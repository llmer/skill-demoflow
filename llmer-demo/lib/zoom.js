/**
 * Zoom math ported from openscreen.
 *
 * Core concepts:
 * - ZoomRegion: a time range + focus point + depth defining where to zoom
 * - Region strength: 0-1 value controlling zoom progress (eased in/out)
 * - Focus clamping: prevents the zoom from panning off the edge of the video
 * - Connected transitions: smooth panning between adjacent zoom regions
 */
import { ZOOM_DEPTH_SCALES } from './types.js';
// ── Constants (from openscreen/constants.ts) ────────────────────────────────
const TRANSITION_WINDOW_MS = 1015.05;
const ZOOM_IN_TRANSITION_WINDOW_MS = TRANSITION_WINDOW_MS * 1.5;
const ZOOM_IN_OVERLAP_MS = 500;
const CHAINED_ZOOM_PAN_GAP_MS = 1500;
const CONNECTED_ZOOM_PAN_DURATION_MS = 1000;
// ── Math utilities (from openscreen/mathUtils.ts) ───────────────────────────
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
function sampleCubicBezier(a1, a2, t) {
    const oneMinusT = 1 - t;
    return 3 * a1 * oneMinusT * oneMinusT * t + 3 * a2 * oneMinusT * t * t + t * t * t;
}
function sampleCubicBezierDerivative(a1, a2, t) {
    const oneMinusT = 1 - t;
    return 3 * a1 * oneMinusT * oneMinusT + 6 * (a2 - a1) * oneMinusT * t + 3 * (1 - a2) * t * t;
}
function cubicBezier(x1, y1, x2, y2, t) {
    const targetX = clamp01(t);
    let solvedT = targetX;
    for (let i = 0; i < 8; i++) {
        const currentX = sampleCubicBezier(x1, x2, solvedT) - targetX;
        const currentDerivative = sampleCubicBezierDerivative(x1, x2, solvedT);
        if (Math.abs(currentX) < 1e-6 || Math.abs(currentDerivative) < 1e-6)
            break;
        solvedT -= currentX / currentDerivative;
    }
    let lower = 0;
    let upper = 1;
    solvedT = clamp01(solvedT);
    for (let i = 0; i < 10; i++) {
        const currentX = sampleCubicBezier(x1, x2, solvedT);
        if (Math.abs(currentX - targetX) < 1e-6)
            break;
        if (currentX < targetX)
            lower = solvedT;
        else
            upper = solvedT;
        solvedT = (lower + upper) / 2;
    }
    return sampleCubicBezier(y1, y2, solvedT);
}
function easeOutScreenStudio(t) {
    return cubicBezier(0.16, 1, 0.3, 1, t);
}
function easeConnectedPan(value) {
    return cubicBezier(0.1, 0.0, 0.2, 1.0, value);
}
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}
// ── Focus clamping (from openscreen/focusUtils.ts) ──────────────────────────
function getFocusBoundsForScale(zoomScale) {
    const marginX = 1 / (2 * zoomScale);
    const marginY = 1 / (2 * zoomScale);
    return { minX: marginX, maxX: 1 - marginX, minY: marginY, maxY: 1 - marginY };
}
function clamp(value, min, max) {
    if (Number.isNaN(value))
        return (min + max) / 2;
    return Math.min(max, Math.max(min, value));
}
export function clampFocusToScale(focus, zoomScale) {
    const baseFocus = { cx: clamp(focus.cx, 0, 1), cy: clamp(focus.cy, 0, 1) };
    const bounds = getFocusBoundsForScale(zoomScale);
    return {
        cx: clamp(baseFocus.cx, bounds.minX, bounds.maxX),
        cy: clamp(baseFocus.cy, bounds.minY, bounds.maxY),
    };
}
// ── Region strength (from openscreen/zoomRegionUtils.ts) ────────────────────
export function computeRegionStrength(region, timeMs) {
    const zoomInEnd = region.startMs + ZOOM_IN_OVERLAP_MS;
    const leadInStart = zoomInEnd - ZOOM_IN_TRANSITION_WINDOW_MS;
    const leadOutEnd = region.endMs + TRANSITION_WINDOW_MS;
    if (timeMs < leadInStart || timeMs > leadOutEnd)
        return 0;
    if (timeMs < zoomInEnd) {
        const progress = (timeMs - leadInStart) / ZOOM_IN_TRANSITION_WINDOW_MS;
        return easeOutScreenStudio(progress);
    }
    if (timeMs <= region.endMs)
        return 1;
    const progress = clamp01((timeMs - region.endMs) / TRANSITION_WINDOW_MS);
    return 1 - easeOutScreenStudio(progress);
}
function getConnectedRegionPairs(regions) {
    const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (next.startMs - curr.endMs > CHAINED_ZOOM_PAN_GAP_MS)
            continue;
        pairs.push({
            currentRegion: curr,
            nextRegion: next,
            transitionStart: curr.endMs,
            transitionEnd: curr.endMs + CONNECTED_ZOOM_PAN_DURATION_MS,
        });
    }
    return pairs;
}
function getLinearFocus(start, end, amount) {
    return { cx: lerp(start.cx, end.cx, amount), cy: lerp(start.cy, end.cy, amount) };
}
function getResolvedFocus(region, zoomScale) {
    return clampFocusToScale(region.focus, zoomScale);
}
/**
 * Find the dominant zoom region at a given time.
 * Returns the active region, its strength (0-1), and optional blended scale
 * for connected pan transitions between adjacent regions.
 */
export function findDominantRegion(regions, timeMs, connectZooms = true) {
    const connectedPairs = connectZooms ? getConnectedRegionPairs(regions) : [];
    // Check connected transitions first (smooth pan between regions)
    if (connectZooms) {
        for (const pair of connectedPairs) {
            const { currentRegion, nextRegion, transitionStart, transitionEnd } = pair;
            if (timeMs < transitionStart || timeMs > transitionEnd)
                continue;
            const progress = easeConnectedPan(clamp01((timeMs - transitionStart) / Math.max(1, transitionEnd - transitionStart)));
            const currentScale = ZOOM_DEPTH_SCALES[currentRegion.depth];
            const nextScale = ZOOM_DEPTH_SCALES[nextRegion.depth];
            const currentFocus = getResolvedFocus(currentRegion, currentScale);
            const nextFocus = getResolvedFocus(nextRegion, nextScale);
            return {
                region: { ...nextRegion, focus: getLinearFocus(currentFocus, nextFocus, progress) },
                strength: 1,
                blendedScale: lerp(currentScale, nextScale, progress),
            };
        }
        // Check connected holds (time between transition end and next region start)
        for (const pair of connectedPairs) {
            if (timeMs > pair.transitionEnd && timeMs < pair.nextRegion.startMs) {
                const nextScale = ZOOM_DEPTH_SCALES[pair.nextRegion.depth];
                return {
                    region: { ...pair.nextRegion, focus: getResolvedFocus(pair.nextRegion, nextScale) },
                    strength: 1,
                    blendedScale: null,
                };
            }
        }
    }
    // Standard: find strongest active region
    const active = regions
        .map((region) => {
        // Suppress strength for outgoing connected regions
        const outPair = connectedPairs.find((p) => p.currentRegion.id === region.id);
        if (outPair && timeMs > outPair.currentRegion.endMs)
            return { region, strength: 0 };
        // Suppress strength for incoming connected regions during transition
        const inPair = connectedPairs.find((p) => p.nextRegion.id === region.id);
        if (inPair && timeMs < inPair.transitionEnd)
            return { region, strength: 0 };
        return { region, strength: computeRegionStrength(region, timeMs) };
    })
        .filter((e) => e.strength > 0)
        .sort((a, b) => b.strength !== a.strength ? b.strength - a.strength : b.region.startMs - a.region.startMs);
    if (active.length === 0) {
        return { region: null, strength: 0, blendedScale: null };
    }
    const r = active[0].region;
    const scale = ZOOM_DEPTH_SCALES[r.depth];
    return {
        region: { ...r, focus: getResolvedFocus(r, scale) },
        strength: active[0].strength,
        blendedScale: null,
    };
}
/**
 * Compute the zoom transform for a given set of regions at a point in time.
 * This is the main entry point for the ffmpeg zoompan integration.
 *
 * @param regions All zoom regions for the video
 * @param timeMs Current time in milliseconds
 * @param videoWidth Video width in pixels
 * @param videoHeight Video height in pixels
 * @returns Transform with scale and pixel offsets
 */
export function computeZoomAtTime(regions, timeMs, videoWidth, videoHeight) {
    if (regions.length === 0)
        return { scale: 1, x: 0, y: 0 };
    const { region, strength, blendedScale } = findDominantRegion(regions, timeMs);
    if (!region || strength === 0)
        return { scale: 1, x: 0, y: 0 };
    const targetScale = blendedScale ?? ZOOM_DEPTH_SCALES[region.depth];
    const scale = 1 + (targetScale - 1) * strength;
    // Position: center the focus point in the viewport
    const focusPixelX = region.focus.cx * videoWidth;
    const focusPixelY = region.focus.cy * videoHeight;
    const centerX = videoWidth / 2;
    const centerY = videoHeight / 2;
    const x = (centerX - focusPixelX * scale) * strength;
    const y = (centerY - focusPixelY * scale) * strength;
    return { scale, x, y };
}
// ── Auto-zoom region generation ─────────────────────────────────────────────
/**
 * Generate zoom regions from element hit data captured during step execution.
 * Each interactive step (click, fill, select) produces a hit; this creates
 * a zoom region that zooms in before the action and holds briefly after.
 */
export function generateAutoZoomRegions(hits, viewport, options = {}) {
    const depth = options.depth ?? 3;
    const duration = options.durationMs ?? 1500;
    return hits
        .map((hit, i) => {
        const cx = clamp01((hit.bbox.x + hit.bbox.width / 2) / viewport.width);
        const cy = clamp01((hit.bbox.y + hit.bbox.height / 2) / viewport.height);
        return {
            id: `auto-zoom-${i}`,
            startMs: Math.max(0, hit.timeMs - 300),
            endMs: hit.timeMs + duration,
            depth,
            focus: { cx, cy },
        };
    });
}
//# sourceMappingURL=zoom.js.map