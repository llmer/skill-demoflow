import { type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type DesktopFrameOptions, type FrameComponents } from './frame.js';
export interface RecordingOptions {
    /** Output directory for HAR, video, screenshots. Created if missing. */
    outputDir: string;
    /** Browser viewport size. */
    viewport?: {
        width: number;
        height: number;
    };
    /** Run headed (default true). */
    headed?: boolean;
    /** Slow down actions by this many ms (default 100). */
    slowMo?: number;
    /** Ignore HTTPS errors (default true). */
    ignoreHTTPSErrors?: boolean;
    /** Device preset for mobile emulation (e.g. 'iphone-15-pro'). Sets viewport, isMobile, hasTouch, userAgent. Overrides viewport. */
    device?: string;
    /** Wrap video in a frame. Default: true (macOS style). Pass false to disable. */
    desktopFrame?: boolean | DesktopFrameOptions;
    /** Path to scenario file — stored in manifest for cache invalidation. */
    scenarioPath?: string;
    /** Path to target file — stored in manifest for cache invalidation. */
    targetPath?: string;
}
export interface PauseSegment {
    /** Seconds from recording start when pause began */
    start: number;
    /** Seconds from recording start when pause ended */
    end: number;
}
export interface RecordingSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    outputDir: string;
    /** @internal wall-clock time when recording started */
    _startTime: number;
    /** @internal pause segments to trim from video */
    _pauses: PauseSegment[];
    /** @internal timestamp of current pause start, or null */
    _pauseStart: number | null;
    /** @internal resolved desktop frame options, or null if disabled */
    _frameOptions: DesktopFrameOptions | null;
    /** @internal viewport used for recording */
    _viewport: {
        width: number;
        height: number;
    };
    /** @internal device preset key */
    _device?: string;
    /** @internal scenario file path for manifest hashing */
    _scenarioPath?: string;
    /** @internal target file path for manifest hashing */
    _targetPath?: string;
}
export interface RecordingResult {
    harPath: string;
    mp4Path: string | null;
    webmPath: string | null;
}
export interface RenderOptions {
    /** Frame style. 'none' disables frame. Default: 'macos' */
    frameStyle?: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none';
    /** Title for titlebar/tab. Falls back to captured page title. */
    title?: string;
    /** URL for address bar (XP/98 style). Falls back to captured page URL. */
    url?: string;
    /** Desktop resolution. Default: 1920x1080 */
    resolution?: {
        width: number;
        height: number;
    };
    /** Vertical offset in px from centered position. Default: 0 */
    windowOffsetY?: number;
    /** Solid wallpaper color. Overrides the default gradient if set. */
    wallpaperColor?: string;
    /** Per-component visibility and text overrides. */
    components?: FrameComponents;
}
export interface RenderResult {
    mp4Path: string | null;
}
/**
 * Re-render an existing capture to MP4 with optional frame compositing.
 * Reads viewport and pause data from the manifest (or uses defaults).
 * Does NOT require a browser session — works entirely from the WebM on disk.
 */
export declare function render(outputDir: string, options?: RenderOptions): Promise<RenderResult>;
/**
 * Launch a Chromium browser with full recording enabled:
 * - HAR capture (all network traffic)
 * - Video recording
 * - Click visualization (red dot on every click)
 */
export declare function launchWithRecording(options: RecordingOptions): Promise<RecordingSession>;
/**
 * Mark the start of an idle period (e.g. waiting for user input).
 * The paused segment will be trimmed from the final video.
 */
export declare function pauseRecording(session: RecordingSession): void;
/**
 * Mark the end of an idle period. Recording resumes normally.
 */
export declare function resumeRecording(session: RecordingSession): void;
/**
 * Finalize recording: close browser, save manifest, convert + frame.
 * Must be called after the scenario completes (or on error).
 *
 * This captures page metadata, saves the manifest with git state and
 * pause segments, then calls render() to produce the final MP4.
 */
export declare function finalize(session: RecordingSession, overrides?: {
    pageTitle?: string;
    pageUrl?: string;
}): Promise<RecordingResult>;
//# sourceMappingURL=browser.d.ts.map