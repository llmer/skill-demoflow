import { chromium } from '@playwright/test';
import { join } from 'path';
const MACOS_TITLE_BAR_HEIGHT = 52;
const MACOS_BOTTOM_EDGE = 8;
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function computeLayout(viewport, resolution, chromeHeight, bottomEdge = 0, offsetY = 0) {
    const windowWidth = viewport.width;
    const windowHeight = chromeHeight + viewport.height + bottomEdge;
    const windowX = Math.round((resolution.width - windowWidth) / 2);
    const windowY = Math.round((resolution.height - windowHeight) / 2) + offsetY;
    const contentX = windowX;
    const contentY = windowY + chromeHeight;
    return { contentX, contentY, windowX, windowY, windowWidth, windowHeight };
}
// ---------------------------------------------------------------------------
// macOS Sonoma
// ---------------------------------------------------------------------------
const MACOS_DEFAULT_WALLPAPER = `
      radial-gradient(ellipse 120% 80% at 15% 85%, #6e2c91 0%, transparent 55%),
      radial-gradient(ellipse 100% 70% at 85% 75%, #1a4a6e 0%, transparent 50%),
      radial-gradient(ellipse 90% 90% at 50% 20%, #2d1654 0%, transparent 60%),
      radial-gradient(ellipse 80% 60% at 75% 30%, #0d5e6b 0%, transparent 50%),
      radial-gradient(ellipse 70% 50% at 25% 40%, #3b1578 0%, transparent 45%),
      linear-gradient(145deg, #1a0a2e 0%, #16213e 30%, #0a3d62 55%, #1b4332 80%, #1a0a2e 100%)`;
function macosFrameHtml(viewport, resolution, options) {
    const layout = computeLayout(viewport, resolution, MACOS_TITLE_BAR_HEIGHT, MACOS_BOTTOM_EDGE, options.windowOffsetY);
    const title = options.title ?? 'Untitled';
    const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER;
    const c = options.components;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    background: ${wallpaper};
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
    height: ${layout.windowHeight}px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow:
      0 25px 60px rgba(0, 0, 0, 0.35),
      0 8px 20px rgba(0, 0, 0, 0.2),
      0 0 0 0.5px rgba(0, 0, 0, 0.12);
  }

  .titlebar {
    height: ${MACOS_TITLE_BAR_HEIGHT}px;
    background: rgba(246, 246, 246, 0.94);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    padding: 0 16px;
    position: relative;
  }

  .traffic-lights {
    display: flex;
    gap: 8px;
    align-items: center;
    z-index: 1;
  }

  .traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .tl-close {
    background: #FF5F57;
    border: 0.5px solid #E14942;
  }

  .tl-minimize {
    background: #FFBD2E;
    border: 0.5px solid #DFA123;
  }

  .tl-maximize {
    background: #27C93F;
    border: 0.5px solid #1EAD2B;
  }

  .tab-area {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    pointer-events: none;
  }

  .tab {
    background: rgba(0, 0, 0, 0.04);
    border-radius: 6px;
    padding: 6px 32px;
    font-size: 13px;
    color: #333;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #ffffff;
  }

  .bottom-edge {
    height: ${MACOS_BOTTOM_EDGE}px;
    background: rgba(246, 246, 246, 0.94);
  }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      ${c?.hideTrafficLights ? '' : `<div class="traffic-lights">
        <div class="traffic-light tl-close"></div>
        <div class="traffic-light tl-minimize"></div>
        <div class="traffic-light tl-maximize"></div>
      </div>`}
      <div class="tab-area">
        <div class="tab">${escapeHtml(title)}</div>
      </div>
    </div>
    <div class="content-area"></div>
    <div class="bottom-edge"></div>
  </div>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Windows XP (via XP.css)
// ---------------------------------------------------------------------------
const XP_TITLE_BAR_HEIGHT = 30;
const XP_ADDRESS_BAR_HEIGHT = 28;
const XP_STATUS_BAR_HEIGHT = 22;
const XP_DEFAULT_WALLPAPER = `linear-gradient(180deg, #3a7bd5 0%, #6db3f2 15%, #87ceeb 30%, #b0d4f1 42%, #dce9c5 52%, #7cba5c 58%, #5a9a3c 68%, #4a8a2c 80%, #3d7a24 100%)`;
const XP_TASKBAR_HEIGHT = 36;
function xpFrameHtml(viewport, resolution, options) {
    const c = options.components;
    const { chromeHeight, bottomEdge } = styleParams('windows-xp', c);
    const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY);
    const url = options.url ?? 'https://example.com';
    const title = options.title ?? 'Untitled';
    const wallpaper = options.wallpaperColor ?? XP_DEFAULT_WALLPAPER;
    const titleSuffix = c?.titleSuffix ?? ' - Internet Explorer';
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/xp.css/dist/XP.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    background: ${wallpaper};
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
  }

  .address-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    background: #f0f0ea;
    border-bottom: 1px solid #a0a090;
  }

  .address-bar label { font-size: 11px; }

  .address-bar input {
    flex: 1;
    font-size: 11px;
    padding: 1px 4px;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #ffffff;
    overflow: hidden;
  }

  .taskbar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: ${XP_TASKBAR_HEIGHT}px;
    background: linear-gradient(180deg, #3168d5 0%, #2456c0 20%, #1d4ab0 50%, #1840a0 80%, #1038a0 100%);
    display: flex;
    align-items: center;
    padding: 0 4px;
    border-top: 2px solid #5c8fe8;
  }

  .start-btn {
    background: linear-gradient(180deg, #3c9a3c 0%, #2d8e2d 30%, #1e7a1e 70%, #1a6e1a 100%);
    border: 1px solid #2d8e2d;
    border-radius: 0 10px 10px 0;
    padding: 3px 16px 3px 10px;
    color: white;
    font-size: 13px;
    font-weight: bold;
    font-style: italic;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 4px;
    height: 28px;
  }

  .start-flag {
    width: 16px; height: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
  }
  .flag-r { background: #ff3030; }
  .flag-g { background: #30b030; }
  .flag-b { background: #3060ff; }
  .flag-y { background: #ffcc00; }

  .taskbar-clock {
    margin-left: auto;
    color: white;
    font-size: 12px;
    padding: 0 12px;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
  }
</style>
</head>
<body>
  <div class="window">
    <div class="title-bar">
      <div class="title-bar-text">${escapeHtml(title)}${escapeHtml(titleSuffix)}</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    ${c?.hideAddressBar ? '' : `<div class="address-bar">
      <label>Address</label>
      <input type="text" value="${escapeHtml(url)}" readonly>
      <button>Go</button>
    </div>`}
    <div class="window-body" style="margin:0;padding:0;">
      <div class="content-area"></div>
    </div>
    ${c?.hideStatusBar ? '' : `<div class="status-bar">
      <p class="status-bar-field">${escapeHtml(c?.statusText ?? 'Done')}</p>
      <p class="status-bar-field">${escapeHtml(c?.statusRightText ?? 'Internet')}</p>
    </div>`}
  </div>
  ${c?.hideTaskbar ? '' : `<div class="taskbar">
    <div class="start-btn">
      <div class="start-flag">
        <div class="flag-r"></div>
        <div class="flag-g"></div>
        <div class="flag-b"></div>
        <div class="flag-y"></div>
      </div>
      ${escapeHtml(c?.startButtonText ?? 'start')}
    </div>
    <div class="taskbar-clock">${escapeHtml(c?.clockText ?? '3:42 PM')}</div>
  </div>`}
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Windows 98 (via 98.css from XP.css package)
// ---------------------------------------------------------------------------
const W98_TITLE_BAR_HEIGHT = 24;
const W98_ADDRESS_BAR_HEIGHT = 26;
const W98_STATUS_BAR_HEIGHT = 20;
function w98FrameHtml(viewport, resolution, options) {
    const c = options.components;
    const { chromeHeight, bottomEdge } = styleParams('windows-98', c);
    const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY);
    const url = options.url ?? 'https://example.com';
    const title = options.title ?? 'Untitled';
    const wallpaper = options.wallpaperColor ?? '#008080';
    const titleSuffix = c?.titleSuffix ?? ' - Internet Explorer';
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/xp.css/dist/98.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    background: ${wallpaper};
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
  }

  .address-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    background: #c0c0c0;
    border-bottom: 1px solid #808080;
  }

  .address-bar label { font-size: 11px; }

  .address-bar input {
    flex: 1;
    font-size: 11px;
    padding: 1px 4px;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #ffffff;
    overflow: hidden;
  }

  .taskbar-98 {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 32px;
    background: #c0c0c0;
    border-top: 2px solid #dfdfdf;
    display: flex;
    align-items: center;
    padding: 2px 4px;
    gap: 4px;
  }

  .taskbar-98 button {
    font-weight: bold;
    font-size: 12px;
    padding: 2px 8px;
    min-width: 60px;
  }

  .taskbar-clock-98 {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px inset #c0c0c0;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="title-bar">
      <div class="title-bar-text">${escapeHtml(title)}${escapeHtml(titleSuffix)}</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    ${c?.hideAddressBar ? '' : `<div class="address-bar">
      <label>Address</label>
      <input type="text" value="${escapeHtml(url)}" readonly>
      <button>Go</button>
    </div>`}
    <div class="window-body" style="margin:0;padding:0;">
      <div class="content-area"></div>
    </div>
    ${c?.hideStatusBar ? '' : `<div class="status-bar">
      <p class="status-bar-field">${escapeHtml(c?.statusText ?? 'Done')}</p>
      <p class="status-bar-field">${escapeHtml(c?.statusRightText ?? 'Internet')}</p>
    </div>`}
  </div>
  ${c?.hideTaskbar ? '' : `<div class="taskbar-98">
    <button>${escapeHtml(c?.startButtonText ?? 'Start')}</button>
    <div class="taskbar-clock-98">${escapeHtml(c?.clockText ?? '3:42 PM')}</div>
  </div>`}
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// macOS Terminal
// ---------------------------------------------------------------------------
const MACOS_TERMINAL_TITLE_BAR_HEIGHT = 38;
const MACOS_TERMINAL_BOTTOM_EDGE = 0;
function macosTerminalFrameHtml(viewport, resolution, options) {
    const layout = computeLayout(viewport, resolution, MACOS_TERMINAL_TITLE_BAR_HEIGHT, MACOS_TERMINAL_BOTTOM_EDGE, options.windowOffsetY);
    const title = options.title ?? 'Terminal';
    const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER;
    const c = options.components;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    background: ${wallpaper};
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
    height: ${layout.windowHeight}px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow:
      0 25px 60px rgba(0, 0, 0, 0.45),
      0 8px 20px rgba(0, 0, 0, 0.3),
      0 0 0 0.5px rgba(255, 255, 255, 0.08);
  }

  .titlebar {
    height: ${MACOS_TERMINAL_TITLE_BAR_HEIGHT}px;
    background: linear-gradient(180deg, #3c3c3c 0%, #323232 100%);
    border-bottom: 1px solid rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    padding: 0 14px;
    position: relative;
  }

  .traffic-lights {
    display: flex;
    gap: 8px;
    align-items: center;
    z-index: 1;
  }

  .traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .tl-close { background: #FF5F57; border: 0.5px solid #E14942; }
  .tl-minimize { background: #FFBD2E; border: 0.5px solid #DFA123; }
  .tl-maximize { background: #27C93F; border: 0.5px solid #1EAD2B; }

  .title-text {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    pointer-events: none;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #1e1e1e;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      ${c?.hideTrafficLights ? '' : `<div class="traffic-lights">
        <div class="traffic-light tl-close"></div>
        <div class="traffic-light tl-minimize"></div>
        <div class="traffic-light tl-maximize"></div>
      </div>`}
      <div class="title-text">${escapeHtml(title)}</div>
    </div>
    <div class="content-area"></div>
  </div>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// VS Code Terminal
// ---------------------------------------------------------------------------
const VSCODE_TITLE_BAR_HEIGHT = 36;
const VSCODE_TAB_BAR_HEIGHT = 35;
const VSCODE_BOTTOM_EDGE = 24; // status bar
function vscodeFrameHtml(viewport, resolution, options) {
    const chromeHeight = VSCODE_TITLE_BAR_HEIGHT + VSCODE_TAB_BAR_HEIGHT;
    const layout = computeLayout(viewport, resolution, chromeHeight, VSCODE_BOTTOM_EDGE, options.windowOffsetY);
    const title = options.title ?? 'Terminal';
    const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: ${wallpaper};
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
    height: ${layout.windowHeight}px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow:
      0 25px 60px rgba(0, 0, 0, 0.45),
      0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .vscode-titlebar {
    height: ${VSCODE_TITLE_BAR_HEIGHT}px;
    background: #1f1f1f;
    display: flex;
    align-items: center;
    padding: 0 12px;
    position: relative;
  }

  .traffic-lights {
    display: flex;
    gap: 8px;
    align-items: center;
    z-index: 1;
  }

  .traffic-light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .tl-close { background: #FF5F57; border: 0.5px solid #E14942; }
  .tl-minimize { background: #FFBD2E; border: 0.5px solid #DFA123; }
  .tl-maximize { background: #27C93F; border: 0.5px solid #1EAD2B; }

  .vscode-title-text {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    pointer-events: none;
  }

  .vscode-tab-bar {
    height: ${VSCODE_TAB_BAR_HEIGHT}px;
    background: #181818;
    display: flex;
    align-items: flex-end;
    padding: 0 8px;
    border-bottom: 1px solid #2b2b2b;
  }

  .vscode-tab {
    background: #1f1f1f;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    padding: 6px 16px;
    border-top: 1px solid #007acc;
    border-left: 1px solid #2b2b2b;
    border-right: 1px solid #2b2b2b;
    border-radius: 4px 4px 0 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab-icon {
    font-size: 14px;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #1e1e1e;
  }

  .status-bar {
    height: ${VSCODE_BOTTOM_EDGE}px;
    background: #007acc;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
    gap: 12px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status-right {
    margin-left: auto;
    display: flex;
    gap: 12px;
  }
</style>
</head>
<body>
  <div class="window">
    <div class="vscode-titlebar">
      <div class="traffic-lights">
        <div class="traffic-light tl-close"></div>
        <div class="traffic-light tl-minimize"></div>
        <div class="traffic-light tl-maximize"></div>
      </div>
      <div class="vscode-title-text">${escapeHtml(title)} — Visual Studio Code</div>
    </div>
    <div class="vscode-tab-bar">
      <div class="vscode-tab">
        <span class="tab-icon">&gt;_</span>
        ${escapeHtml(title)}
      </div>
    </div>
    <div class="content-area"></div>
    <div class="status-bar">
      <span class="status-item">main</span>
      <div class="status-right">
        <span>Ln 1, Col 1</span>
        <span>UTF-8</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// iOS (iPhone)
// ---------------------------------------------------------------------------
const IOS_FRAME_IMG_W = 473;
const IOS_FRAME_IMG_H = 932;
const IOS_SCREEN_LEFT = 40;
const IOS_SCREEN_TOP = 40;
const IOS_SCREEN_W = 393;
const IOS_SCREEN_H = 852;
// Base64-encoded iPhone 15 Pro frame PNG (473×932, RGBA with transparent screen area)
const IOS_FRAME_DATA_URI = 'data:image/png;base64,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';
function computeMobileLayout(viewport, resolution) {
    const scale = viewport.width / IOS_SCREEN_W;
    const frameW = Math.round(IOS_FRAME_IMG_W * scale);
    const frameH = Math.round(IOS_FRAME_IMG_H * scale);
    const frameX = Math.round((resolution.width - frameW) / 2);
    const frameY = Math.round((resolution.height - frameH) / 2);
    const contentX = frameX + Math.round(IOS_SCREEN_LEFT * scale);
    const contentY = frameY + Math.round(IOS_SCREEN_TOP * scale);
    const screenW = Math.round(IOS_SCREEN_W * scale);
    const screenH = Math.round(IOS_SCREEN_H * scale);
    return { frameX, frameY, frameW, frameH, contentX, contentY, screenW, screenH };
}
function iosFrameHtml(viewport, resolution, options) {
    const layout = computeMobileLayout(viewport, resolution);
    const wallpaper = options.wallpaperColor ?? '#111111';
    const screenLeft = Math.round(IOS_SCREEN_LEFT * (viewport.width / IOS_SCREEN_W));
    const screenTop = Math.round(IOS_SCREEN_TOP * (viewport.width / IOS_SCREEN_W));
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${resolution.width}px;
    height: ${resolution.height}px;
    overflow: hidden;
    background: ${wallpaper};
  }

  .phone-frame {
    position: absolute;
    top: ${layout.frameY}px;
    left: ${layout.frameX}px;
    width: ${layout.frameW}px;
    height: ${layout.frameH}px;
  }

  .screen-fill {
    position: absolute;
    top: ${screenTop}px;
    left: ${screenLeft}px;
    width: ${layout.screenW}px;
    height: ${layout.screenH}px;
    background: #000;
    z-index: 1;
  }

  .content-area {
    position: absolute;
    top: ${screenTop}px;
    left: ${screenLeft}px;
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #ffffff;
    z-index: 2;
    overflow: hidden;
  }

  .frame-img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="phone-frame">
    <div class="screen-fill"></div>
    <div class="content-area"></div>
    <img class="frame-img" src="${IOS_FRAME_DATA_URI}">
  </div>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function styleParams(style, components) {
    switch (style) {
        case 'windows-xp':
            return {
                chromeHeight: XP_TITLE_BAR_HEIGHT + (components?.hideAddressBar ? 0 : XP_ADDRESS_BAR_HEIGHT),
                bottomEdge: components?.hideStatusBar ? 0 : XP_STATUS_BAR_HEIGHT,
            };
        case 'windows-98':
            return {
                chromeHeight: W98_TITLE_BAR_HEIGHT + (components?.hideAddressBar ? 0 : W98_ADDRESS_BAR_HEIGHT),
                bottomEdge: components?.hideStatusBar ? 0 : W98_STATUS_BAR_HEIGHT,
            };
        case 'macos-terminal':
            return { chromeHeight: MACOS_TERMINAL_TITLE_BAR_HEIGHT, bottomEdge: MACOS_TERMINAL_BOTTOM_EDGE };
        case 'vscode':
            return { chromeHeight: VSCODE_TITLE_BAR_HEIGHT + VSCODE_TAB_BAR_HEIGHT, bottomEdge: VSCODE_BOTTOM_EDGE };
        case 'ios':
            return { chromeHeight: IOS_SCREEN_TOP, bottomEdge: IOS_FRAME_IMG_H - IOS_SCREEN_TOP - IOS_SCREEN_H };
        default:
            return { chromeHeight: MACOS_TITLE_BAR_HEIGHT, bottomEdge: MACOS_BOTTOM_EDGE };
    }
}
export function generateFrameHtml(viewport, options = {}) {
    const style = options.style ?? 'macos';
    const defaultRes = style === 'ios'
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    const resolution = options.resolution ?? defaultRes;
    if (style === 'ios') {
        return iosFrameHtml(viewport, resolution, options);
    }
    if (style === 'windows-98') {
        return w98FrameHtml(viewport, resolution, options);
    }
    if (style === 'windows-xp') {
        return xpFrameHtml(viewport, resolution, options);
    }
    if (style === 'macos-terminal') {
        return macosTerminalFrameHtml(viewport, resolution, options);
    }
    if (style === 'vscode') {
        return vscodeFrameHtml(viewport, resolution, options);
    }
    return macosFrameHtml(viewport, resolution, options);
}
export async function renderFrame(outputDir, viewport, options = {}) {
    const style = options.style ?? 'macos';
    const defaultRes = style === 'ios'
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    const resolution = options.resolution ?? defaultRes;
    const html = generateFrameHtml(viewport, { ...options, resolution });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: resolution,
        deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const pngPath = join(outputDir, 'frame.png');
    await page.screenshot({ path: pngPath, type: 'png' });
    await browser.close();
    let contentX;
    let contentY;
    if (style === 'ios') {
        const mobileLayout = computeMobileLayout(viewport, resolution);
        contentX = mobileLayout.contentX;
        contentY = mobileLayout.contentY;
    }
    else {
        const { chromeHeight, bottomEdge } = styleParams(style, options.components);
        const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY);
        contentX = layout.contentX;
        contentY = layout.contentY;
    }
    return {
        pngPath,
        contentX,
        contentY,
        outputWidth: resolution.width,
        outputHeight: resolution.height,
    };
}
//# sourceMappingURL=frame.js.map