/**
 * Zoom math ported from openscreen.
 *
 * Core concepts:
 * - ZoomRegion: a time range + focus point + depth defining where to zoom
 * - Region strength: 0-1 value controlling zoom progress (eased in/out)
 * - Focus clamping: prevents the zoom from panning off the edge of the video
 * - Connected transitions: smooth panning between adjacent zoom regions
 */
import { type ZoomDepth, type ZoomFocus, type ZoomRegion } from './types.js';
export declare function clampFocusToScale(focus: ZoomFocus, zoomScale: number): ZoomFocus;
export declare function computeRegionStrength(region: ZoomRegion, timeMs: number): number;
export interface DominantResult {
    region: ZoomRegion | null;
    strength: number;
    blendedScale: number | null;
}
/**
 * Find the dominant zoom region at a given time.
 * Returns the active region, its strength (0-1), and optional blended scale
 * for connected pan transitions between adjacent regions.
 */
export declare function findDominantRegion(regions: ZoomRegion[], timeMs: number, connectZooms?: boolean): DominantResult;
export interface ZoomTransform {
    /** Scale factor (1 = no zoom) */
    scale: number;
    /** Horizontal offset in pixels (of the content within the frame) */
    x: number;
    /** Vertical offset in pixels */
    y: number;
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
export declare function computeZoomAtTime(regions: ZoomRegion[], timeMs: number, videoWidth: number, videoHeight: number): ZoomTransform;
/**
 * Generate zoom regions from element hit data captured during step execution.
 * Each interactive step (click, fill, select) produces a hit; this creates
 * a zoom region that zooms in before the action and holds briefly after.
 */
export declare function generateAutoZoomRegions(hits: {
    timeMs: number;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}[], viewport: {
    width: number;
    height: number;
}, options?: {
    depth?: ZoomDepth;
    durationMs?: number;
}): ZoomRegion[];
//# sourceMappingURL=zoom.d.ts.map