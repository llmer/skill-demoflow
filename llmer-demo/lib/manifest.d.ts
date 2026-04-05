import type { PauseSegment } from './browser.js';
import type { FrameComponents } from './frame.js';
import type { ZoomRegion, ElementHit, SpeedRegion, Annotation, GifOptions } from './types.js';
export interface CaptureInfo {
    commitHash: string;
    dirty: boolean;
    scenarioHash?: string;
    targetHash?: string;
    libHash?: string;
    viewport: {
        width: number;
        height: number;
    };
    pauses: PauseSegment[];
    pageUrl?: string;
    pageTitle?: string;
    timestamp: string;
    /** Device preset key used for recording, e.g. 'iphone-15-pro' */
    device?: string;
    /** Terminal recording metadata (absent for browser recordings). */
    terminal?: {
        shell: string;
        cwd: string;
    };
    /** Zoom regions derived from step metadata (auto-zoom) */
    zoomRegions?: ZoomRegion[];
    /** Element bounding boxes captured during recording (for auto-zoom) */
    elementHitmap?: ElementHit[];
    /** Speed regions derived from step metadata */
    speedRegions?: SpeedRegion[];
    /** Annotations derived from step metadata */
    annotations?: Annotation[];
    /** Path to cursor telemetry JSON file (relative to output dir) */
    cursorTelemetryPath?: string;
}
export interface RenderInfo {
    frameStyle: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none';
    title?: string;
    url?: string;
    resolution: {
        width: number;
        height: number;
    };
    windowOffsetY?: number;
    wallpaperColor?: string;
    components?: FrameComponents;
    timestamp: string;
    /** Override or additional zoom regions from Studio */
    zoomRegions?: ZoomRegion[];
    /** Speed regions */
    speedRegions?: SpeedRegion[];
    /** Annotations */
    annotations?: Annotation[];
    /** Export format */
    exportFormat?: 'mp4' | 'gif';
    /** GIF export options */
    gifOptions?: GifOptions;
}
export interface Manifest {
    capture: CaptureInfo;
    render?: RenderInfo;
}
export declare function getGitState(): {
    commitHash: string;
    dirty: boolean;
};
export declare function hashFile(filePath: string): string;
/**
 * Compute a hash of all .js files in the skill lib directory.
 * Used to detect when the lib has changed so scripts get regenerated.
 */
export declare function getLibHash(): string;
export declare function readManifest(outputDir: string): Manifest | null;
export declare function writeManifest(outputDir: string, manifest: Manifest): void;
export interface CaptureValidationOptions {
    scenarioPath?: string;
    targetPath?: string;
}
/**
 * Check whether an existing capture in outputDir is still valid.
 * Valid means: WebM exists, git HEAD matches, working tree is clean,
 * scenario/target file hashes match (if paths provided), and the
 * skill lib hasn't changed since the capture.
 */
export declare function isCaptureValid(outputDir: string, options?: CaptureValidationOptions): boolean;
//# sourceMappingURL=manifest.d.ts.map