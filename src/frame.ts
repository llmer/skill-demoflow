import { chromium } from '@playwright/test'
import { join } from 'path'

export interface FrameComponents {
  /** Hide the address bar (XP/98 only). Default: false (visible). */
  hideAddressBar?: boolean
  /** Hide the status bar (XP/98 only). Default: false (visible). */
  hideStatusBar?: boolean
  /** Hide the taskbar (XP/98 only). Default: false (visible). */
  hideTaskbar?: boolean
  /** Hide the traffic light buttons (macOS only). Default: false (visible). */
  hideTrafficLights?: boolean
  /** Title bar suffix, e.g. " - Internet Explorer". Empty string removes it. */
  titleSuffix?: string
  /** Status bar left field text. Default: "Done" */
  statusText?: string
  /** Status bar right field text. Default: "Internet" */
  statusRightText?: string
  /** Taskbar clock text. Default: "3:42 PM" */
  clockText?: string
  /** Start button text (XP/98). Default: "start"/"Start" */
  startButtonText?: string
}

export interface DesktopFrameOptions {
  /** OS style. Default: 'macos' */
  style?: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode'
  /** Desktop resolution. Default: 1920x1080 */
  resolution?: { width: number; height: number }
  /** URL to display in address bar. */
  url?: string
  /** Page title for title bar / tab. */
  title?: string
  /** Vertical offset in px from centered position (negative = up). Default: 0 */
  windowOffsetY?: number
  /** Solid wallpaper color. Overrides the default gradient if set. */
  wallpaperColor?: string
  /** Per-component visibility and text overrides. */
  components?: FrameComponents
}

export interface FrameRenderResult {
  pngPath: string
  contentX: number
  contentY: number
  outputWidth: number
  outputHeight: number
}

const MACOS_TITLE_BAR_HEIGHT = 52
const MACOS_BOTTOM_EDGE = 8

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function computeLayout(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  chromeHeight: number,
  bottomEdge: number = 0,
  offsetY: number = 0,
) {
  const windowWidth = viewport.width
  const windowHeight = chromeHeight + viewport.height + bottomEdge
  const windowX = Math.round((resolution.width - windowWidth) / 2)
  const windowY = Math.round((resolution.height - windowHeight) / 2) + offsetY
  const contentX = windowX
  const contentY = windowY + chromeHeight
  return { contentX, contentY, windowX, windowY, windowWidth, windowHeight }
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
      linear-gradient(145deg, #1a0a2e 0%, #16213e 30%, #0a3d62 55%, #1b4332 80%, #1a0a2e 100%)`

function macosFrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const layout = computeLayout(viewport, resolution, MACOS_TITLE_BAR_HEIGHT, MACOS_BOTTOM_EDGE, options.windowOffsetY)
  const title = options.title ?? 'Untitled'
  const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER
  const c = options.components

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
</html>`
}

// ---------------------------------------------------------------------------
// Windows XP (via XP.css)
// ---------------------------------------------------------------------------

const XP_TITLE_BAR_HEIGHT = 30
const XP_ADDRESS_BAR_HEIGHT = 28
const XP_STATUS_BAR_HEIGHT = 22
const XP_DEFAULT_WALLPAPER = `linear-gradient(180deg, #3a7bd5 0%, #6db3f2 15%, #87ceeb 30%, #b0d4f1 42%, #dce9c5 52%, #7cba5c 58%, #5a9a3c 68%, #4a8a2c 80%, #3d7a24 100%)`

const XP_TASKBAR_HEIGHT = 36

function xpFrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const c = options.components
  const { chromeHeight, bottomEdge } = styleParams('windows-xp', c)
  const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY)
  const url = options.url ?? 'https://example.com'
  const title = options.title ?? 'Untitled'
  const wallpaper = options.wallpaperColor ?? XP_DEFAULT_WALLPAPER
  const titleSuffix = c?.titleSuffix ?? ' - Internet Explorer'

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
</html>`
}

// ---------------------------------------------------------------------------
// Windows 98 (via 98.css from XP.css package)
// ---------------------------------------------------------------------------

const W98_TITLE_BAR_HEIGHT = 24
const W98_ADDRESS_BAR_HEIGHT = 26
const W98_STATUS_BAR_HEIGHT = 20
function w98FrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const c = options.components
  const { chromeHeight, bottomEdge } = styleParams('windows-98', c)
  const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY)
  const url = options.url ?? 'https://example.com'
  const title = options.title ?? 'Untitled'
  const wallpaper = options.wallpaperColor ?? '#008080'
  const titleSuffix = c?.titleSuffix ?? ' - Internet Explorer'

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
</html>`
}

// ---------------------------------------------------------------------------
// macOS Terminal
// ---------------------------------------------------------------------------

const MACOS_TERMINAL_TITLE_BAR_HEIGHT = 38
const MACOS_TERMINAL_BOTTOM_EDGE = 0

function macosTerminalFrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const layout = computeLayout(viewport, resolution, MACOS_TERMINAL_TITLE_BAR_HEIGHT, MACOS_TERMINAL_BOTTOM_EDGE, options.windowOffsetY)
  const title = options.title ?? 'Terminal'
  const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER
  const c = options.components

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
</html>`
}

// ---------------------------------------------------------------------------
// VS Code Terminal
// ---------------------------------------------------------------------------

const VSCODE_TITLE_BAR_HEIGHT = 36
const VSCODE_TAB_BAR_HEIGHT = 35
const VSCODE_BOTTOM_EDGE = 24  // status bar

function vscodeFrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const chromeHeight = VSCODE_TITLE_BAR_HEIGHT + VSCODE_TAB_BAR_HEIGHT
  const layout = computeLayout(viewport, resolution, chromeHeight, VSCODE_BOTTOM_EDGE, options.windowOffsetY)
  const title = options.title ?? 'Terminal'
  const wallpaper = options.wallpaperColor ? options.wallpaperColor : MACOS_DEFAULT_WALLPAPER

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
</html>`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function styleParams(style: string, components?: FrameComponents): { chromeHeight: number; bottomEdge: number } {
  switch (style) {
    case 'windows-xp':
      return {
        chromeHeight: XP_TITLE_BAR_HEIGHT + (components?.hideAddressBar ? 0 : XP_ADDRESS_BAR_HEIGHT),
        bottomEdge: components?.hideStatusBar ? 0 : XP_STATUS_BAR_HEIGHT,
      }
    case 'windows-98':
      return {
        chromeHeight: W98_TITLE_BAR_HEIGHT + (components?.hideAddressBar ? 0 : W98_ADDRESS_BAR_HEIGHT),
        bottomEdge: components?.hideStatusBar ? 0 : W98_STATUS_BAR_HEIGHT,
      }
    case 'macos-terminal':
      return { chromeHeight: MACOS_TERMINAL_TITLE_BAR_HEIGHT, bottomEdge: MACOS_TERMINAL_BOTTOM_EDGE }
    case 'vscode':
      return { chromeHeight: VSCODE_TITLE_BAR_HEIGHT + VSCODE_TAB_BAR_HEIGHT, bottomEdge: VSCODE_BOTTOM_EDGE }
    default:
      return { chromeHeight: MACOS_TITLE_BAR_HEIGHT, bottomEdge: MACOS_BOTTOM_EDGE }
  }
}

export function generateFrameHtml(
  viewport: { width: number; height: number },
  options: DesktopFrameOptions = {},
): string {
  const resolution = options.resolution ?? { width: 1920, height: 1080 }
  const style = options.style ?? 'macos'
  if (style === 'windows-98') {
    return w98FrameHtml(viewport, resolution, options)
  }
  if (style === 'windows-xp') {
    return xpFrameHtml(viewport, resolution, options)
  }
  if (style === 'macos-terminal') {
    return macosTerminalFrameHtml(viewport, resolution, options)
  }
  if (style === 'vscode') {
    return vscodeFrameHtml(viewport, resolution, options)
  }
  return macosFrameHtml(viewport, resolution, options)
}

export async function renderFrame(
  outputDir: string,
  viewport: { width: number; height: number },
  options: DesktopFrameOptions = {},
): Promise<FrameRenderResult> {
  const resolution = options.resolution ?? { width: 1920, height: 1080 }
  const html = generateFrameHtml(viewport, options)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: resolution,
    deviceScaleFactor: 1,
  })
  await page.setContent(html, { waitUntil: 'load' })

  const pngPath = join(outputDir, 'frame.png')
  await page.screenshot({ path: pngPath, type: 'png' })
  await browser.close()

  const style = options.style ?? 'macos'
  const { chromeHeight, bottomEdge } = styleParams(style, options.components)
  const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY)
  return {
    pngPath,
    contentX: layout.contentX,
    contentY: layout.contentY,
    outputWidth: resolution.width,
    outputHeight: resolution.height,
  }
}
