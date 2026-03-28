import { chromium } from '@playwright/test';
import { join } from 'path';
const TITLE_BAR_HEIGHT = 52;
const ADDRESS_BAR_HEIGHT = 36;
const CHROME_HEIGHT = TITLE_BAR_HEIGHT + ADDRESS_BAR_HEIGHT;
const WINDOW_TOP_MARGIN = 80;
const WINDOW_BOTTOM_EDGE = 8;
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function computeLayout(viewport, resolution, chromeHeight = CHROME_HEIGHT, bottomEdge = 0) {
    const contentX = Math.round((resolution.width - viewport.width) / 2);
    const contentY = WINDOW_TOP_MARGIN + chromeHeight;
    const windowX = contentX;
    const windowY = WINDOW_TOP_MARGIN;
    const windowWidth = viewport.width;
    const windowHeight = chromeHeight + viewport.height + bottomEdge;
    return { contentX, contentY, windowX, windowY, windowWidth, windowHeight };
}
// ---------------------------------------------------------------------------
// macOS Sonoma
// ---------------------------------------------------------------------------
function macosFrameHtml(viewport, resolution, options) {
    const layout = computeLayout(viewport, resolution, TITLE_BAR_HEIGHT, WINDOW_BOTTOM_EDGE);
    const title = options.title ?? 'Untitled';
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
    background:
      radial-gradient(ellipse 120% 80% at 15% 85%, #6e2c91 0%, transparent 55%),
      radial-gradient(ellipse 100% 70% at 85% 75%, #1a4a6e 0%, transparent 50%),
      radial-gradient(ellipse 90% 90% at 50% 20%, #2d1654 0%, transparent 60%),
      radial-gradient(ellipse 80% 60% at 75% 30%, #0d5e6b 0%, transparent 50%),
      radial-gradient(ellipse 70% 50% at 25% 40%, #3b1578 0%, transparent 45%),
      linear-gradient(145deg, #1a0a2e 0%, #16213e 30%, #0a3d62 55%, #1b4332 80%, #1a0a2e 100%);
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
    height: ${TITLE_BAR_HEIGHT}px;
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
    height: ${WINDOW_BOTTOM_EDGE}px;
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
</html>`;
}
// ---------------------------------------------------------------------------
// Windows XP
// ---------------------------------------------------------------------------
function xpFrameHtml(viewport, resolution, options) {
    const layout = computeLayout(viewport, resolution);
    const url = options.url ?? 'https://example.com';
    const title = options.title ?? 'Untitled';
    const taskbarHeight = 36;
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
    font-family: 'Tahoma', 'Segoe UI', sans-serif;
    background:
      linear-gradient(180deg, #3a7bd5 0%, #6db3f2 15%, #87ceeb 30%, #b0d4f1 42%, #dce9c5 52%, #7cba5c 58%, #5a9a3c 68%, #4a8a2c 80%, #3d7a24 100%);
  }

  .window {
    position: absolute;
    top: ${layout.windowY}px;
    left: ${layout.windowX}px;
    width: ${layout.windowWidth}px;
    height: ${layout.windowHeight}px;
    border: 3px solid #0054e3;
    border-radius: 8px 8px 0 0;
    overflow: hidden;
    box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.35);
  }

  .xp-titlebar {
    height: ${TITLE_BAR_HEIGHT}px;
    background: linear-gradient(180deg, #0058ee 0%, #3a8df5 12%, #0053e0 30%, #0050d8 70%, #2e7cf6 88%, #1665e0 100%);
    display: flex;
    align-items: center;
    padding: 0 6px;
    position: relative;
  }

  .xp-icon {
    width: 18px;
    height: 18px;
    background: linear-gradient(135deg, #4a9eff, #0060df);
    border-radius: 3px;
    margin-right: 6px;
    border: 1px solid rgba(255,255,255,0.3);
  }

  .xp-title {
    color: white;
    font-size: 13px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.4);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .xp-buttons {
    display: flex;
    gap: 2px;
  }

  .xp-btn {
    width: 22px;
    height: 22px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    color: white;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.4);
  }

  .xp-btn-min {
    background: linear-gradient(180deg, #3c8eff 0%, #2060c0 100%);
  }

  .xp-btn-max {
    background: linear-gradient(180deg, #3c8eff 0%, #2060c0 100%);
  }

  .xp-btn-close {
    background: linear-gradient(180deg, #e47458 0%, #c12b0a 100%);
    border-color: rgba(200,60,40,0.6);
  }

  .xp-addressbar {
    height: ${ADDRESS_BAR_HEIGHT}px;
    background: linear-gradient(180deg, #f0f0ea 0%, #d8d8ce 100%);
    border-bottom: 1px solid #a0a090;
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 6px;
  }

  .xp-address-label {
    font-size: 12px;
    color: #333;
  }

  .xp-url-input {
    flex: 1;
    height: 22px;
    background: white;
    border: 1px solid #7f9db9;
    border-radius: 0;
    padding: 0 6px;
    font-size: 12px;
    font-family: 'Tahoma', sans-serif;
    color: #333;
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .xp-go-btn {
    background: linear-gradient(180deg, #f5f5ee 0%, #d8d8ce 100%);
    border: 1px solid #a0a090;
    padding: 2px 10px;
    font-size: 12px;
    color: #333;
    border-radius: 0;
  }

  .content-area {
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: #ffffff;
    border-top: 2px solid #d4d0c8;
  }

  .taskbar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: ${taskbarHeight}px;
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
    width: 16px;
    height: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    border-radius: 1px;
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
    <div class="xp-titlebar">
      <div class="xp-icon"></div>
      <div class="xp-title">${escapeHtml(title)} - Internet Explorer</div>
      <div class="xp-buttons">
        <div class="xp-btn xp-btn-min">\u2013</div>
        <div class="xp-btn xp-btn-max">\u25A1</div>
        <div class="xp-btn xp-btn-close">\u2715</div>
      </div>
    </div>
    <div class="xp-addressbar">
      <span class="xp-address-label">Address</span>
      <div class="xp-url-input">${escapeHtml(url)}</div>
      <div class="xp-go-btn">Go</div>
    </div>
    <div class="content-area"></div>
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
</html>`;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function generateFrameHtml(viewport, options = {}) {
    const resolution = options.resolution ?? { width: 1920, height: 1080 };
    const style = options.style ?? 'macos';
    if (style === 'windows-xp') {
        return xpFrameHtml(viewport, resolution, options);
    }
    return macosFrameHtml(viewport, resolution, options);
}
export async function renderFrame(outputDir, viewport, options = {}) {
    const resolution = options.resolution ?? { width: 1920, height: 1080 };
    const html = generateFrameHtml(viewport, options);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: resolution,
        deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const pngPath = join(outputDir, 'frame.png');
    await page.screenshot({ path: pngPath, type: 'png' });
    await browser.close();
    const style = options.style ?? 'macos';
    const chromeHeight = style === 'macos' ? TITLE_BAR_HEIGHT : CHROME_HEIGHT;
    const bottomEdge = style === 'macos' ? WINDOW_BOTTOM_EDGE : 0;
    const layout = computeLayout(viewport, resolution, chromeHeight, bottomEdge);
    return {
        pngPath,
        contentX: layout.contentX,
        contentY: layout.contentY,
        outputWidth: resolution.width,
        outputHeight: resolution.height,
    };
}
//# sourceMappingURL=frame.js.map