const SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const DEVICE_PRESETS = {
    'iphone-se': {
        name: 'iPhone SE',
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
    },
    'iphone-14': {
        name: 'iPhone 14',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
    },
    'iphone-15-pro': {
        name: 'iPhone 15 Pro',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
    },
    'iphone-15-pro-max': {
        name: 'iPhone 15 Pro Max',
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
    },
    'iphone-16-pro': {
        name: 'iPhone 16 Pro',
        viewport: { width: 402, height: 874 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: SAFARI_UA,
    },
    'ipad-mini': {
        name: 'iPad Mini',
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPAD_UA,
    },
    'ipad-pro-11': {
        name: 'iPad Pro 11"',
        viewport: { width: 834, height: 1194 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPAD_UA,
    },
};
export function getDevicePreset(name) {
    return DEVICE_PRESETS[name];
}
export function listDevicePresets() {
    return Object.entries(DEVICE_PRESETS).map(([key, preset]) => ({ key, preset }));
}
//# sourceMappingURL=devices.js.map