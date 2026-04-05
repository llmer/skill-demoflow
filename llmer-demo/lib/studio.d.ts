export interface StudioOptions {
    /** Port to listen on. Default: 3274 */
    port?: number;
    /** Base directory containing recording folders. Default: 'output' */
    outputDir?: string;
}
export declare function startStudio(options?: StudioOptions): Promise<void>;
//# sourceMappingURL=studio.d.ts.map