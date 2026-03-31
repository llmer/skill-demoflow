import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { computeZoomAtTime } from './zoom.js';
/**
 * Click visualization script injected into every page via addInitScript.
 * Draws a red expanding/fading circle at each click point — captured in video.
 */
export const CLICK_VIS_SCRIPT = `
  document.addEventListener('click', (e) => {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed',
      left: (e.clientX - 15) + 'px',
      top: (e.clientY - 15) + 'px',
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      background: 'rgba(255, 50, 50, 0.45)',
      border: '2.5px solid rgba(255, 50, 50, 0.8)',
      pointerEvents: 'none',
      zIndex: '999999',
      transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',
      transform: 'scale(1)',
      opacity: '1',
    });
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.opacity = '0';
      dot.style.transform = 'scale(2.5)';
    });
    setTimeout(() => dot.remove(), 1200);
  }, true);
`;
/**
 * Keystroke visualization script for terminal recordings.
 * Shows typed keys in a floating overlay at bottom-right, fades after 1.5s.
 * Embedded in terminal-page.ts by default; exported here for custom pages.
 */
export const KEYSTROKE_VIS_SCRIPT = `
  (function() {
    let overlay = document.getElementById('keystroke-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'keystroke-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', bottom: '16px', right: '16px',
        fontFamily: 'Menlo, Monaco, monospace', fontSize: '13px',
        color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.55)',
        borderRadius: '6px', padding: '4px 10px', pointerEvents: 'none',
        zIndex: '999999', opacity: '0', transition: 'opacity 0.3s ease-out',
        maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
      document.body.appendChild(overlay);
    }
    let clearTimer = null;
    let keyBuffer = '';
    function showKeystroke(text) {
      keyBuffer += text;
      overlay.textContent = keyBuffer;
      overlay.style.opacity = '1';
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => { keyBuffer = ''; }, 300);
      }, 1500);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') showKeystroke('\\u23CE');
      else if (e.key === 'Tab') showKeystroke('\\u21E5');
      else if (e.key === 'Backspace') showKeystroke('\\u232B');
      else if (e.key === 'Escape') showKeystroke('Esc');
      else if (e.ctrlKey && e.key.length === 1) showKeystroke('Ctrl+' + e.key.toUpperCase());
      else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) showKeystroke(e.key);
    }, true);
  })();
`;
/**
 * Convert a webm video to mp4 using ffmpeg.
 * Requires ffmpeg to be installed and on PATH.
 */
export function convertToMp4(webmPath, mp4Path) {
    execSync(`ffmpeg -i "${webmPath}" -c:v libx264 -preset fast -y "${mp4Path}"`, {
        stdio: 'pipe',
    });
}
/**
 * Convert an mp4 to an animated GIF using ffmpeg two-pass palette method.
 * Produces high-quality dithered output with reasonable file sizes.
 */
export function convertToGif(mp4Path, gifPath, options = {}) {
    const fps = options.frameRate ?? 15;
    const maxHeight = options.sizePreset === 'large' ? 1080
        : options.sizePreset === 'original' ? -1
            : 720;
    const loop = options.loop !== false ? 0 : -1;
    const scaleFilter = maxHeight === -1
        ? `fps=${fps}`
        : `fps=${fps},scale=-1:'min(${maxHeight},ih)':flags=lanczos`;
    const palettePath = mp4Path.replace(/\.mp4$/, '-palette.png');
    try {
        // Pass 1: generate optimal palette
        execSync(`ffmpeg -i "${mp4Path}" -vf "${scaleFilter},palettegen=stats_mode=diff" -y "${palettePath}"`, { stdio: 'pipe' });
        // Pass 2: encode GIF with palette
        execSync(`ffmpeg -i "${mp4Path}" -i "${palettePath}" ` +
            `-lavfi "${scaleFilter} [x]; [x][1:v] paletteuse=dither=floyd_steinberg" ` +
            `-loop ${loop} -y "${gifPath}"`, { stdio: 'pipe' });
    }
    finally {
        // Clean up palette file
        if (existsSync(palettePath))
            unlinkSync(palettePath);
    }
}
/**
 * Convert webm to mp4 with zoom regions applied via ffmpeg zoompan filter.
 * Generates per-frame zoom/pan expressions from the zoom region data.
 */
export function convertToMp4WithZoom(webmPath, mp4Path, zoomRegions, viewport, pauses) {
    if (zoomRegions.length === 0) {
        if (pauses && pauses.length > 0) {
            return convertToMp4WithTrim(webmPath, mp4Path, pauses);
        }
        return convertToMp4(webmPath, mp4Path);
    }
    // Probe video duration and frame rate
    const probeResult = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=duration,r_frame_rate -of csv=p=0 "${webmPath}"`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const [fpsStr, durStr] = probeResult.split(',');
    const [fpsNum, fpsDen] = (fpsStr ?? '30/1').split('/');
    const fps = Math.round(parseInt(fpsNum) / (parseInt(fpsDen) || 1)) || 30;
    const duration = parseFloat(durStr) || 10;
    // Pre-compute per-frame zoom expressions
    // We generate a lookup table as ffmpeg sendcmd or use the zoompan filter
    // with frame-number-based expressions
    const totalFrames = Math.ceil(duration * fps);
    const { width, height } = viewport;
    // Build frame-by-frame zoom data and encode it as ffmpeg zoompan expressions
    // zoompan: z=zoom, x=pan_x, y=pan_y, d=1 (1 frame per input frame), s=WxH, fps=fps
    //
    // We use a piecewise expression with nested if() calls for each zoom region.
    // For complex cases with many regions, we cap at reasonable segment boundaries.
    const zoomExpr = buildZoomExpression(zoomRegions, totalFrames, fps, width, height);
    const xExpr = buildPanXExpression(zoomRegions, totalFrames, fps, width, height);
    const yExpr = buildPanYExpression(zoomRegions, totalFrames, fps, width, height);
    // First apply trim if needed, then zoom
    let inputFilter = '';
    let inputPrefix = `[0:v]`;
    if (pauses && pauses.length > 0) {
        const sorted = [...pauses].sort((a, b) => a.start - b.start);
        const keeps = [];
        let cursor = 0;
        for (const pause of sorted) {
            if (pause.start > cursor)
                keeps.push({ start: cursor, end: pause.start.toFixed(3) });
            cursor = pause.end;
        }
        keeps.push({ start: cursor, end: '' });
        if (keeps.length > 1 || keeps[0].start !== 0 || keeps[0].end !== '') {
            const trims = keeps.map((k, i) => {
                const endArg = k.end ? `:end=${k.end}` : '';
                return `[0:v]trim=start=${k.start.toFixed(3)}${endArg},setpts=PTS-STARTPTS[v${i}]`;
            });
            const concatInputs = keeps.map((_, i) => `[v${i}]`).join('');
            inputFilter = `${trims.join('; ')}; ${concatInputs}concat=n=${keeps.length}:v=1:a=0[trimmed]; `;
            inputPrefix = `[trimmed]`;
        }
    }
    const filter = `${inputFilter}${inputPrefix}zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${width}x${height}:fps=${fps}[out]`;
    execSync(`ffmpeg -i "${webmPath}" -filter_complex "${filter}" -map "[out]" -c:v libx264 -preset fast -y "${mp4Path}"`, { stdio: 'pipe' });
}
// ── ffmpeg expression builders ──────────────────────────────────────────────
/**
 * Build a nested if() expression for ffmpeg's zoompan filter.
 * Groups zoom regions into time segments and generates piecewise expressions.
 */
function buildZoomExpression(regions, totalFrames, fps, videoWidth, videoHeight) {
    return buildFrameExpression(regions, totalFrames, fps, videoWidth, videoHeight, 'zoom');
}
function buildPanXExpression(regions, totalFrames, fps, videoWidth, videoHeight) {
    return buildFrameExpression(regions, totalFrames, fps, videoWidth, videoHeight, 'x');
}
function buildPanYExpression(regions, totalFrames, fps, videoWidth, videoHeight) {
    return buildFrameExpression(regions, totalFrames, fps, videoWidth, videoHeight, 'y');
}
function buildFrameExpression(regions, totalFrames, fps, videoWidth, videoHeight, component) {
    // Sample at key frame boundaries to build a piecewise expression
    // Find all boundary frames where zoom state changes
    const keyFrames = new Set([0, totalFrames - 1]);
    for (const r of regions) {
        // Add boundaries with margin for transitions
        const frames = [
            Math.max(0, Math.floor((r.startMs / 1000 - 2) * fps)),
            Math.floor((r.startMs / 1000) * fps),
            Math.floor(((r.startMs + 500) / 1000) * fps), // zoom-in midpoint
            Math.floor((r.endMs / 1000) * fps),
            Math.min(totalFrames - 1, Math.ceil((r.endMs / 1000 + 1.5) * fps)),
        ];
        for (const f of frames) {
            if (f >= 0 && f < totalFrames)
                keyFrames.add(f);
        }
    }
    const sorted = [...keyFrames].sort((a, b) => a - b);
    // For each segment between key frames, sample midpoint and generate expression
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const sf = sorted[i];
        const ef = sorted[i + 1];
        const startT = computeZoomAtTime(regions, (sf / fps) * 1000, videoWidth, videoHeight);
        const endT = computeZoomAtTime(regions, (ef / fps) * 1000, videoWidth, videoHeight);
        let startVal;
        let endVal;
        if (component === 'zoom') {
            startVal = startT.scale;
            endVal = endT.scale;
        }
        else if (component === 'x') {
            // zoompan x is the top-left crop offset: when zoomed, x = (scale-1)*W/2 - panX
            startVal = startT.scale > 1 ? (startT.scale - 1) * videoWidth / 2 - startT.x : 0;
            endVal = endT.scale > 1 ? (endT.scale - 1) * videoWidth / 2 - endT.x : 0;
        }
        else {
            startVal = startT.scale > 1 ? (startT.scale - 1) * videoHeight / 2 - startT.y : 0;
            endVal = endT.scale > 1 ? (endT.scale - 1) * videoHeight / 2 - endT.y : 0;
        }
        segments.push({ startFrame: sf, endFrame: ef, startVal, endVal });
    }
    if (segments.length === 0) {
        return component === 'zoom' ? '1' : '0';
    }
    // Build nested if() expression from segments
    // if(lte(on,F), lerp, if(lte(on,F2), lerp2, ...))
    // where lerp = startVal + (endVal-startVal) * (on-startFrame)/(endFrame-startFrame)
    let expr = component === 'zoom' ? '1' : '0';
    for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        const range = s.endFrame - s.startFrame;
        if (range === 0 || (Math.abs(s.startVal - s.endVal) < 0.001 && Math.abs(s.startVal - (component === 'zoom' ? 1 : 0)) < 0.001)) {
            continue; // Skip no-op segments
        }
        let segExpr;
        if (Math.abs(s.startVal - s.endVal) < 0.001) {
            segExpr = s.startVal.toFixed(4);
        }
        else {
            // Linear interpolation within segment
            segExpr = `${s.startVal.toFixed(4)}+(${(s.endVal - s.startVal).toFixed(4)})*(on-${s.startFrame})/${range}`;
        }
        expr = `if(lte(on,${s.endFrame}),${segExpr},${expr})`;
    }
    return expr;
}
/**
 * Composite a recorded MP4 onto a desktop frame PNG using ffmpeg overlay.
 */
export function compositeWithFrame(mp4Path, framePngPath, outputPath, contentX, contentY) {
    execSync(`ffmpeg -loop 1 -i "${framePngPath}" -i "${mp4Path}" ` +
        `-filter_complex "[0:v][1:v]overlay=x=${contentX}:y=${contentY}:shortest=1[out]" ` +
        `-map "[out]" -c:v libx264 -preset fast -y "${outputPath}"`, { stdio: 'pipe' });
}
/**
 * Convert webm to mp4, trimming out pause segments (e.g. idle time waiting for user input).
 * Uses ffmpeg trim + concat filters to splice out the paused ranges.
 */
export function convertToMp4WithTrim(webmPath, mp4Path, pauses) {
    // Build keep-segments from the gaps between pauses
    const sorted = [...pauses].sort((a, b) => a.start - b.start);
    const keeps = [];
    let cursor = 0;
    for (const pause of sorted) {
        if (pause.start > cursor) {
            keeps.push({ start: cursor, end: pause.start.toFixed(3) });
        }
        cursor = pause.end;
    }
    // Final segment from last pause end to video end (no end = rest of video)
    keeps.push({ start: cursor, end: '' });
    if (keeps.length === 1 && keeps[0].start === 0 && keeps[0].end === '') {
        // Nothing to trim, fall back to simple conversion
        return convertToMp4(webmPath, mp4Path);
    }
    const trims = keeps.map((k, i) => {
        const endArg = k.end ? `:end=${k.end}` : '';
        return `[0:v]trim=start=${k.start.toFixed(3)}${endArg},setpts=PTS-STARTPTS[v${i}]`;
    });
    const concatInputs = keeps.map((_, i) => `[v${i}]`).join('');
    const filter = `${trims.join('; ')}; ${concatInputs}concat=n=${keeps.length}:v=1:a=0[out]`;
    execSync(`ffmpeg -i "${webmPath}" -filter_complex "${filter}" -map "[out]" -c:v libx264 -preset fast -y "${mp4Path}"`, { stdio: 'pipe' });
}
/**
 * Convert webm to mp4 with speed regions applied via ffmpeg setpts + concat.
 * Each segment between speed boundaries gets its own setpts factor.
 * Also handles pause trimming — paused segments are removed before speed is applied.
 */
export function convertToMp4WithSpeed(webmPath, mp4Path, speedRegions, pauses) {
    if (speedRegions.length === 0) {
        if (pauses && pauses.length > 0) {
            return convertToMp4WithTrim(webmPath, mp4Path, pauses);
        }
        return convertToMp4(webmPath, mp4Path);
    }
    // Probe video duration
    const durStr = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${webmPath}"`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const totalDuration = parseFloat(durStr) || 30;
    // Build time segments: merge pause trimming and speed changes
    // First, compute "keep" segments after removing pauses
    const sortedPauses = [...(pauses ?? [])].sort((a, b) => a.start - b.start);
    const keepSegs = [];
    let cur = 0;
    for (const pause of sortedPauses) {
        if (pause.start > cur)
            keepSegs.push({ start: cur, end: pause.start });
        cur = pause.end;
    }
    keepSegs.push({ start: cur, end: totalDuration });
    // Now for each keep segment, split it further by speed regions
    const sortedSpeeds = [...speedRegions].sort((a, b) => a.startMs - b.startMs);
    const segments = [];
    for (const keep of keepSegs) {
        let segStart = keep.start;
        for (const sr of sortedSpeeds) {
            const srStart = sr.startMs / 1000;
            const srEnd = sr.endMs / 1000;
            // Skip speed regions outside this keep segment
            if (srEnd <= keep.start || srStart >= keep.end)
                continue;
            // Normal-speed gap before this speed region
            const effectiveStart = Math.max(srStart, keep.start);
            if (effectiveStart > segStart) {
                segments.push({ start: segStart, end: effectiveStart, speed: 1 });
            }
            // Speed region (clamped to keep bounds)
            const effectiveEnd = Math.min(srEnd, keep.end);
            segments.push({ start: effectiveStart, end: effectiveEnd, speed: sr.speed });
            segStart = effectiveEnd;
        }
        // Trailing normal-speed segment
        if (segStart < keep.end) {
            segments.push({ start: segStart, end: keep.end, speed: 1 });
        }
    }
    // Filter out zero-length segments
    const valid = segments.filter(s => s.end - s.start > 0.01);
    if (valid.length === 0) {
        return convertToMp4(webmPath, mp4Path);
    }
    // If all segments are speed 1, just trim
    if (valid.every(s => s.speed === 1)) {
        if (pauses && pauses.length > 0) {
            return convertToMp4WithTrim(webmPath, mp4Path, pauses);
        }
        return convertToMp4(webmPath, mp4Path);
    }
    // Build ffmpeg filter: trim each segment, apply setpts, then concat
    const speedTrims = valid.map((s, i) => {
        const pts = s.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${s.speed}`;
        return `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=${pts}[v${i}]`;
    });
    const speedConcat = valid.map((_, i) => `[v${i}]`).join('');
    const speedFilter = `${speedTrims.join('; ')}; ${speedConcat}concat=n=${valid.length}:v=1:a=0[out]`;
    execSync(`ffmpeg -i "${webmPath}" -filter_complex "${speedFilter}" -map "[out]" -c:v libx264 -preset fast -y "${mp4Path}"`, { stdio: 'pipe' });
}
//# sourceMappingURL=recorder.js.map