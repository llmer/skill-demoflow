/**
 * Cursor telemetry: sampling, persistence, and zoom-suggestion from dwell patterns.
 *
 * During recording, a script injected via addInitScript samples the cursor
 * position at 10 Hz. After recording, the samples are collected and saved
 * to a .cursor.json file alongside the video.
 *
 * The dwell detector identifies time ranges where the cursor stayed in a
 * small area for an extended period — these are candidates for auto-zoom.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
// ── Cursor sampling script ──────────────────────────────────────────────────
/**
 * Script injected into every page via addInitScript to sample cursor position.
 * Stores normalized (0-1) coordinates at 10 Hz.
 * Collected via page.evaluate(() => window.__demoflow_cursorSamples).
 */
export const CURSOR_SAMPLE_SCRIPT = `
  (function() {
    if (window.__demoflow_cursorSamples) return;
    window.__demoflow_cursorSamples = [];
    window.__demoflow_cursorStartTime = Date.now();
    let lastX = 0, lastY = 0;

    document.addEventListener('mousemove', (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
    }, { passive: true });

    setInterval(() => {
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      window.__demoflow_cursorSamples.push({
        timeMs: Date.now() - window.__demoflow_cursorStartTime,
        cx: lastX / vw,
        cy: lastY / vh,
      });
    }, 100); // 10 Hz
  })();
`;
// ── Collection ──────────────────────────────────────────────────────────────
/**
 * Collect cursor samples from the page and return them.
 * Call this before closing the page.
 */
export async function collectCursorSamples(page) {
    try {
        const samples = await page.evaluate(() => window.__demoflow_cursorSamples ?? []);
        return samples;
    }
    catch {
        return [];
    }
}
/**
 * Save cursor telemetry to a JSON file alongside the video.
 */
export function saveCursorTelemetry(outputDir, samples) {
    const filePath = join(outputDir, 'cursor.json');
    writeFileSync(filePath, JSON.stringify(samples));
    return filePath;
}
/**
 * Load cursor telemetry from disk.
 */
export function loadCursorTelemetry(outputDir) {
    const filePath = join(outputDir, 'cursor.json');
    if (!existsSync(filePath))
        return [];
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    catch {
        return [];
    }
}
/**
 * Detect dwell candidates from cursor telemetry.
 * A dwell is a period where the cursor stays within a small radius
 * for a minimum duration — indicating focused attention.
 */
export function detectDwellCandidates(samples, options = {}) {
    const minDuration = options.minDurationMs ?? 800;
    const maxRadius = options.maxRadius ?? 0.05;
    const minGap = options.minGapMs ?? 500;
    if (samples.length < 2)
        return [];
    const candidates = [];
    let dwellStart = 0;
    let dwellCenterX = samples[0].cx;
    let dwellCenterY = samples[0].cy;
    let sumX = samples[0].cx;
    let sumY = samples[0].cy;
    let count = 1;
    for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        const dx = s.cx - dwellCenterX;
        const dy = s.cy - dwellCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= maxRadius) {
            // Still dwelling — update running average
            sumX += s.cx;
            sumY += s.cy;
            count++;
            dwellCenterX = sumX / count;
            dwellCenterY = sumY / count;
        }
        else {
            // Cursor moved away — check if previous dwell was long enough
            const duration = samples[i - 1].timeMs - samples[dwellStart].timeMs;
            if (duration >= minDuration) {
                candidates.push({
                    focus: { cx: dwellCenterX, cy: dwellCenterY },
                    startMs: samples[dwellStart].timeMs,
                    endMs: samples[i - 1].timeMs,
                    sampleCount: count,
                });
            }
            // Start new dwell window
            dwellStart = i;
            dwellCenterX = s.cx;
            dwellCenterY = s.cy;
            sumX = s.cx;
            sumY = s.cy;
            count = 1;
        }
    }
    // Check trailing dwell
    const lastDuration = samples[samples.length - 1].timeMs - samples[dwellStart].timeMs;
    if (lastDuration >= minDuration) {
        candidates.push({
            focus: { cx: dwellCenterX, cy: dwellCenterY },
            startMs: samples[dwellStart].timeMs,
            endMs: samples[samples.length - 1].timeMs,
            sampleCount: count,
        });
    }
    // Merge candidates that are too close together
    const merged = [];
    for (const c of candidates) {
        const last = merged[merged.length - 1];
        if (last && c.startMs - last.endMs < minGap) {
            // Merge: extend end, average focus
            const totalSamples = last.sampleCount + c.sampleCount;
            last.focus.cx = (last.focus.cx * last.sampleCount + c.focus.cx * c.sampleCount) / totalSamples;
            last.focus.cy = (last.focus.cy * last.sampleCount + c.focus.cy * c.sampleCount) / totalSamples;
            last.endMs = c.endMs;
            last.sampleCount = totalSamples;
        }
        else {
            merged.push({ ...c, focus: { ...c.focus } });
        }
    }
    return merged;
}
// ── Zoom suggestion ─────────────────────────────────────────────────────────
/**
 * Generate suggested zoom regions from cursor dwell patterns.
 * Each significant dwell period becomes a candidate zoom region.
 */
export function suggestZoomRegions(samples, options = {}) {
    const depth = options.depth ?? 3;
    const leadIn = options.leadInMs ?? 300;
    const leadOut = options.leadOutMs ?? 500;
    const dwells = detectDwellCandidates(samples, options);
    return dwells.map((d, i) => ({
        id: `cursor-dwell-${i}`,
        startMs: Math.max(0, d.startMs - leadIn),
        endMs: d.endMs + leadOut,
        depth,
        focus: d.focus,
    }));
}
//# sourceMappingURL=cursor.js.map