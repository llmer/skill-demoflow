export interface FrameComponents {
    /** Hide the address bar (XP/98 only). Default: false (visible). */
    hideAddressBar?: boolean;
    /** Hide the status bar (XP/98 only). Default: false (visible). */
    hideStatusBar?: boolean;
    /** Hide the taskbar (XP/98 only). Default: false (visible). */
    hideTaskbar?: boolean;
    /** Hide the traffic light buttons (macOS only). Default: false (visible). */
    hideTrafficLights?: boolean;
    /** Title bar suffix, e.g. " - Internet Explorer". Empty string removes it. */
    titleSuffix?: string;
    /** Status bar left field text. Default: "Done" */
    statusText?: string;
    /** Status bar right field text. Default: "Internet" */
    statusRightText?: string;
    /** Taskbar clock text. Default: "3:42 PM" */
    clockText?: string;
    /** Start button text (XP/98). Default: "start"/"Start" */
    startButtonText?: string;
}
export interface DesktopFrameOptions {
    /** OS style. Default: 'macos' */
    style?: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios';
    /** Desktop resolution. Default: 1920x1080 */
    resolution?: {
        width: number;
        height: number;
    };
    /** URL to display in address bar. */
    url?: string;
    /** Page title for title bar / tab. */
    title?: string;
    /** Vertical offset in px from centered position (negative = up). Default: 0 */
    windowOffsetY?: number;
    /** Solid wallpaper color. Overrides the default gradient if set. */
    wallpaperColor?: string;
    /** Per-component visibility and text overrides. */
    components?: FrameComponents;
}
export interface FrameRenderResult {
    pngPath: string;
    contentX: number;
    contentY: number;
    outputWidth: number;
    outputHeight: number;
}
export declare function generateFrameHtml(viewport: {
    width: number;
    height: number;
}, options?: DesktopFrameOptions): string;
export declare function renderFrame(outputDir: string, viewport: {
    width: number;
    height: number;
}, options?: DesktopFrameOptions): Promise<FrameRenderResult>;
//# sourceMappingURL=frame.d.ts.map