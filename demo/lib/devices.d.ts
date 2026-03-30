export interface DevicePreset {
    /** Human-readable device name */
    name: string;
    /** Browser viewport dimensions (CSS pixels) */
    viewport: {
        width: number;
        height: number;
    };
    /** Device pixel ratio */
    deviceScaleFactor: number;
    /** Enable mobile viewport behavior */
    isMobile: boolean;
    /** Enable touch event emulation */
    hasTouch: boolean;
    /** User agent string */
    userAgent: string;
}
export declare const DEVICE_PRESETS: Record<string, DevicePreset>;
export declare function getDevicePreset(name: string): DevicePreset | undefined;
export declare function listDevicePresets(): {
    key: string;
    preset: DevicePreset;
}[];
//# sourceMappingURL=devices.d.ts.map