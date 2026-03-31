/**
 * Frame-by-frame compositing engine using a headless Playwright page.
 *
 * Used when annotations or complex zoom transitions require per-frame rendering
 * that can't be expressed via ffmpeg filters alone.
 *
 * Pipeline:
 * 1. Extract frames from source video via ffmpeg (pipe to stdout as raw images)
 * 2. For each frame, load into a Canvas element in the Playwright page
 * 3. Apply zoom transform + draw annotations via Canvas2D
 * 4. Export composited frame
 * 5. Encode all frames back to MP4 via ffmpeg (pipe from stdin)
 */
import type { ZoomRegion, Annotation } from './types.js';
export interface RenderPageOptions {
    /** Source video path (WebM or MP4) */
    inputPath: string;
    /** Output MP4 path */
    outputPath: string;
    /** Video dimensions */
    width: number;
    height: number;
    /** Zoom regions to apply */
    zoomRegions?: ZoomRegion[];
    /** Annotations to draw */
    annotations?: Annotation[];
    /** Frame rate. Default: auto-detect from source */
    fps?: number;
    /** Progress callback (frameIndex, totalFrames) */
    onProgress?: (frame: number, total: number) => void;
}
/**
 * Render a video frame-by-frame with annotations and zoom via Canvas2D.
 * This launches a headless Playwright browser, loads each frame into a canvas,
 * applies effects, and pipes composited frames to ffmpeg for encoding.
 */
export declare function renderWithAnnotations(options: RenderPageOptions): Promise<void>;
//# sourceMappingURL=render-page.d.ts.map