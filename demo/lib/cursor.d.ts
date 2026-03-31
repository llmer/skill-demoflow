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
import type { CursorPoint, ZoomRegion, ZoomDepth } from './types.js';
/**
 * Script injected into every page via addInitScript to sample cursor position.
 * Stores normalized (0-1) coordinates at 10 Hz.
 * Collected via page.evaluate(() => window.__demoflow_cursorSamples).
 */
export declare const CURSOR_SAMPLE_SCRIPT = "\n  (function() {\n    if (window.__demoflow_cursorSamples) return;\n    window.__demoflow_cursorSamples = [];\n    window.__demoflow_cursorStartTime = Date.now();\n    let lastX = 0, lastY = 0;\n\n    document.addEventListener('mousemove', (e) => {\n      lastX = e.clientX;\n      lastY = e.clientY;\n    }, { passive: true });\n\n    setInterval(() => {\n      const vw = window.innerWidth || 1;\n      const vh = window.innerHeight || 1;\n      window.__demoflow_cursorSamples.push({\n        timeMs: Date.now() - window.__demoflow_cursorStartTime,\n        cx: lastX / vw,\n        cy: lastY / vh,\n      });\n    }, 100); // 10 Hz\n  })();\n";
/**
 * Collect cursor samples from the page and return them.
 * Call this before closing the page.
 */
export declare function collectCursorSamples(page: import('@playwright/test').Page): Promise<CursorPoint[]>;
/**
 * Save cursor telemetry to a JSON file alongside the video.
 */
export declare function saveCursorTelemetry(outputDir: string, samples: CursorPoint[]): string;
/**
 * Load cursor telemetry from disk.
 */
export declare function loadCursorTelemetry(outputDir: string): CursorPoint[];
export interface DwellCandidate {
    /** Center of the dwell area (normalized 0-1) */
    focus: {
        cx: number;
        cy: number;
    };
    /** Start time in ms */
    startMs: number;
    /** End time in ms */
    endMs: number;
    /** Number of samples in the dwell */
    sampleCount: number;
}
export interface DwellOptions {
    /** Minimum dwell duration in ms. Default: 800 */
    minDurationMs?: number;
    /** Maximum cursor movement radius (normalized) to consider "dwelling". Default: 0.05 */
    maxRadius?: number;
    /** Minimum gap between dwell candidates in ms. Default: 500 */
    minGapMs?: number;
}
/**
 * Detect dwell candidates from cursor telemetry.
 * A dwell is a period where the cursor stays within a small radius
 * for a minimum duration — indicating focused attention.
 */
export declare function detectDwellCandidates(samples: CursorPoint[], options?: DwellOptions): DwellCandidate[];
/**
 * Generate suggested zoom regions from cursor dwell patterns.
 * Each significant dwell period becomes a candidate zoom region.
 */
export declare function suggestZoomRegions(samples: CursorPoint[], options?: DwellOptions & {
    depth?: ZoomDepth;
    leadInMs?: number;
    leadOutMs?: number;
}): ZoomRegion[];
//# sourceMappingURL=cursor.d.ts.map