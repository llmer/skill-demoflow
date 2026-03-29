import { chromium } from '@playwright/test'
import { join } from 'path'

export interface DesktopFrameOptions {
  /** OS style. Default: 'macos' */
  style?: 'macos' | 'windows-xp' | 'windows-98'
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
      <div class="traffic-lights">
        <div class="traffic-light tl-close"></div>
        <div class="traffic-light tl-minimize"></div>
        <div class="traffic-light tl-maximize"></div>
      </div>
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
const XP_CHROME_HEIGHT = XP_TITLE_BAR_HEIGHT + XP_ADDRESS_BAR_HEIGHT
const XP_BOTTOM_EDGE = XP_STATUS_BAR_HEIGHT

const XP_DEFAULT_WALLPAPER = `linear-gradient(180deg, #3a7bd5 0%, #6db3f2 15%, #87ceeb 30%, #b0d4f1 42%, #dce9c5 52%, #7cba5c 58%, #5a9a3c 68%, #4a8a2c 80%, #3d7a24 100%)`

const XP_TASKBAR_HEIGHT = 36

function xpFrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const layout = computeLayout(viewport, resolution, XP_CHROME_HEIGHT, XP_BOTTOM_EDGE, options.windowOffsetY)
  const url = options.url ?? 'https://example.com'
  const title = options.title ?? 'Untitled'
  const wallpaper = options.wallpaperColor ?? XP_DEFAULT_WALLPAPER

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
      <div class="title-bar-text">${escapeHtml(title)} - Internet Explorer</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="address-bar">
      <label>Address</label>
      <input type="text" value="${escapeHtml(url)}" readonly>
      <button>Go</button>
    </div>
    <div class="window-body" style="margin:0;padding:0;">
      <div class="content-area"></div>
    </div>
    <div class="status-bar">
      <p class="status-bar-field">Done</p>
      <p class="status-bar-field">Internet</p>
    </div>
  </div>
  <div class="taskbar">
    <div class="start-btn">
      <div class="start-flag">
        <div class="flag-r"></div>
        <div class="flag-g"></div>
        <div class="flag-b"></div>
        <div class="flag-y"></div>
      </div>
      start
    </div>
    <div class="taskbar-clock">3:42 PM</div>
  </div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Windows 98 (via 98.css from XP.css package)
// ---------------------------------------------------------------------------

const W98_TITLE_BAR_HEIGHT = 24
const W98_ADDRESS_BAR_HEIGHT = 26
const W98_STATUS_BAR_HEIGHT = 20
const W98_CHROME_HEIGHT = W98_TITLE_BAR_HEIGHT + W98_ADDRESS_BAR_HEIGHT
const W98_BOTTOM_EDGE = W98_STATUS_BAR_HEIGHT

function w98FrameHtml(
  viewport: { width: number; height: number },
  resolution: { width: number; height: number },
  options: DesktopFrameOptions,
): string {
  const layout = computeLayout(viewport, resolution, W98_CHROME_HEIGHT, W98_BOTTOM_EDGE, options.windowOffsetY)
  const url = options.url ?? 'https://example.com'
  const title = options.title ?? 'Untitled'
  const wallpaper = options.wallpaperColor ?? '#008080'

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
      <div class="title-bar-text">${escapeHtml(title)} - Internet Explorer</div>
      <div class="title-bar-controls">
        <button aria-label="Minimize"></button>
        <button aria-label="Maximize"></button>
        <button aria-label="Close"></button>
      </div>
    </div>
    <div class="address-bar">
      <label>Address</label>
      <input type="text" value="${escapeHtml(url)}" readonly>
      <button>Go</button>
    </div>
    <div class="window-body" style="margin:0;padding:0;">
      <div class="content-area"></div>
    </div>
    <div class="status-bar">
      <p class="status-bar-field">Done</p>
      <p class="status-bar-field">Internet</p>
    </div>
  </div>
  <div class="taskbar-98">
    <button>Start</button>
    <div class="taskbar-clock-98">3:42 PM</div>
  </div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function styleParams(style: string): { chromeHeight: number; bottomEdge: number } {
  switch (style) {
    case 'windows-xp':
      return { chromeHeight: XP_CHROME_HEIGHT, bottomEdge: XP_BOTTOM_EDGE }
    case 'windows-98':
      return { chromeHeight: W98_CHROME_HEIGHT, bottomEdge: W98_BOTTOM_EDGE }
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
  const { chromeHeight, bottomEdge } = styleParams(style)
  const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge, options.windowOffsetY)
  return {
    pngPath,
    contentX: layout.contentX,
    contentY: layout.contentY,
    outputWidth: resolution.width,
    outputHeight: resolution.height,
  }
}
