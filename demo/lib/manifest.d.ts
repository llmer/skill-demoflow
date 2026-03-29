import type { PauseSegment } from './browser.js';
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
}
export interface RenderInfo {
    frameStyle: 'macos' | 'windows-xp' | 'none';
    title?: string;
    url?: string;
    resolution: {
        width: number;
        height: number;
    };
    timestamp: string;
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