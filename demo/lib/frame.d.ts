export interface DesktopFrameOptions {
    /** OS style. Default: 'macos' */
    style?: 'macos' | 'windows-xp' | 'windows-98';
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