import { createServer } from 'http';
import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { readManifest } from './manifest.js';
import { render } from './browser.js';
import { generateFrameHtml } from './frame.js';
export async function startStudio(options = {}) {
    const port = options.port ?? 3274;
    const outputDir = options.outputDir ?? 'output';
    const server = createServer(async (req, res) => {
        try {
            await handleRequest(req, res, outputDir);
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
        }
    });
    server.listen(port, () => {
        console.log(`\n  DemoFlow Studio`);
        console.log(`  ───────────────`);
        console.log(`  http://localhost:${port}\n`);
        console.log(`  Serving recordings from: ${outputDir}/\n`);
    });
}
async function handleRequest(req, res, outputDir) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    // Studio UI
    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(studioHtml());
        return;
    }
    // List recordings
    if (pathname === '/api/recordings') {
        const recordings = listRecordings(outputDir);
        json(res, recordings);
        return;
    }
    // Get manifest
    const manifestMatch = pathname.match(/^\/api\/recordings\/([^/]+)\/manifest$/);
    if (manifestMatch) {
        const manifest = readManifest(join(outputDir, manifestMatch[1]));
        if (manifest) {
            json(res, manifest);
        }
        else {
            res.writeHead(404);
            res.end('No manifest');
        }
        return;
    }
    // Trigger render
    const renderMatch = pathname.match(/^\/api\/recordings\/([^/]+)\/render$/);
    if (renderMatch && req.method === 'POST') {
        const body = await readBody(req);
        const opts = JSON.parse(body);
        const result = await render(join(outputDir, renderMatch[1]), opts);
        json(res, result);
        return;
    }
    // Frame preview (HTML with embedded video)
    const previewMatch = pathname.match(/^\/preview\/([^/]+)$/);
    if (previewMatch) {
        const name = previewMatch[1];
        const manifest = readManifest(join(outputDir, name));
        const viewport = manifest?.capture?.viewport ?? { width: 1280, height: 720 };
        const style = (url.searchParams.get('style') ?? 'macos');
        const title = url.searchParams.get('title') ?? manifest?.capture?.pageTitle ?? 'Untitled';
        const urlParam = url.searchParams.get('url') ?? manifest?.capture?.pageUrl ?? '';
        const resW = parseInt(url.searchParams.get('resWidth') ?? '1920', 10);
        const resH = parseInt(url.searchParams.get('resHeight') ?? '1080', 10);
        const offsetY = parseInt(url.searchParams.get('offsetY') ?? '0', 10);
        const wallpaper = url.searchParams.get('wallpaper') ?? '';
        const videoUrl = `/files/${name}/recording.webm`;
        const components = {};
        if (url.searchParams.get('hideAddressBar') === 'true')
            components.hideAddressBar = true;
        if (url.searchParams.get('hideStatusBar') === 'true')
            components.hideStatusBar = true;
        if (url.searchParams.get('hideTaskbar') === 'true')
            components.hideTaskbar = true;
        if (url.searchParams.get('hideTrafficLights') === 'true')
            components.hideTrafficLights = true;
        const titleSuffix = url.searchParams.get('titleSuffix');
        if (titleSuffix !== null)
            components.titleSuffix = titleSuffix;
        const statusText = url.searchParams.get('statusText');
        if (statusText)
            components.statusText = statusText;
        const statusRightText = url.searchParams.get('statusRightText');
        if (statusRightText)
            components.statusRightText = statusRightText;
        const clockText = url.searchParams.get('clockText');
        if (clockText)
            components.clockText = clockText;
        const startButtonText = url.searchParams.get('startButtonText');
        if (startButtonText)
            components.startButtonText = startButtonText;
        const html = previewHtml(videoUrl, viewport, {
            style,
            title,
            url: urlParam,
            resolution: { width: resW, height: resH },
            windowOffsetY: offsetY,
            wallpaperColor: wallpaper || undefined,
            components,
        });
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }
    // Serve recording files (video, HAR, screenshots)
    const fileMatch = pathname.match(/^\/files\/([^/]+)\/(.+)$/);
    if (fileMatch) {
        const filePath = join(outputDir, fileMatch[1], fileMatch[2]);
        serveFile(req, res, filePath);
        return;
    }
    res.writeHead(404);
    res.end('Not found');
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function json(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
function listRecordings(baseDir) {
    if (!existsSync(baseDir))
        return [];
    return readdirSync(baseDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({
        name: e.name,
        hasManifest: existsSync(join(baseDir, e.name, 'manifest.json')),
        hasWebm: existsSync(join(baseDir, e.name, 'recording.webm')),
        hasMp4: existsSync(join(baseDir, e.name, 'recording.mp4')),
    }))
        .filter(r => r.hasWebm || r.hasMp4);
}
const MIME = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.har': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
};
function serveFile(req, res, filePath) {
    if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    const stat = statSync(filePath);
    const contentType = MIME[extname(filePath)] ?? 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
        });
        createReadStream(filePath, { start, end }).pipe(res);
    }
    else {
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
        });
        createReadStream(filePath).pipe(res);
    }
}
function previewHtml(videoUrl, viewport, options) {
    if (options.style === 'none') {
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; } body { background: #111; display: flex; align-items: center; justify-content: center; width: ${viewport.width}px; height: ${viewport.height}px; }
</style></head><body>
<video src="${videoUrl}" autoplay loop muted playsinline style="width:${viewport.width}px;height:${viewport.height}px;display:block;"></video>
</body></html>`;
    }
    const frameHtml = generateFrameHtml(viewport, {
        style: options.style,
        title: options.title,
        url: options.url,
        resolution: options.resolution,
        windowOffsetY: options.windowOffsetY,
        wallpaperColor: options.wallpaperColor,
        components: options.components,
    });
    // Inject video element into the content area
    return frameHtml.replace('<div class="content-area"></div>', `<div class="content-area"><video src="${videoUrl}" autoplay loop muted playsinline style="width:${viewport.width}px;height:${viewport.height}px;display:block;object-fit:cover;"></video></div>`);
}
// ── Studio HTML ──────────────────────────────────────────────────────────────
function studioHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>DemoFlow Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
    background: #0C0C0C;
    color: #FAFAFA;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  body::after {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  /* ── Topbar ── */

  .topbar {
    height: 48px;
    background: #141414;
    border-bottom: 1px solid #262626;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    flex-shrink: 0;
  }

  .topbar-title {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 13px;
    font-weight: 500;
    color: #A1A1AA;
  }

  .topbar-sep { color: #333; font-size: 14px; user-select: none; }

  .topbar select {
    background: #1a1a1a;
    border: 1px solid #262626;
    color: #FAFAFA;
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 150ms;
  }

  .topbar select:focus { border-color: #F59E0B; }

  .topbar-spacer { flex: 1; }

  .kbd-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #3a3a3a;
    cursor: default;
    position: relative;
    padding: 4px;
  }

  .kbd-hint:hover .kbd-tooltip { display: block; }

  .kbd-tooltip {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: #1a1a1a;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 10px 14px;
    width: 200px;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }

  .kbd-tooltip div {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 11px;
  }

  .kbd-tooltip .kl { color: #A1A1AA; font-family: 'DM Sans', sans-serif; }
  .kbd-tooltip .kv { color: #F59E0B; }

  .render-btn {
    background: #F59E0B;
    color: #0C0C0C;
    border: none;
    padding: 6px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: background 150ms;
  }

  .render-btn:hover { background: #D97706; }
  .render-btn:active { background: #B45309; }

  .render-btn:disabled {
    background: #262626;
    color: #52525B;
    cursor: not-allowed;
  }

  /* ── Layout ── */

  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .preview-pane {
    flex: 1;
    position: relative;
    background: #0C0C0C;
    overflow: hidden;
  }

  .preview-pane iframe {
    position: absolute;
    border: none;
    background: #000;
    border-radius: 4px;
  }

  .empty-state {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .empty-state h2 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 500;
    color: #A1A1AA;
    margin-bottom: 8px;
  }

  .empty-state p {
    font-size: 13px;
    line-height: 1.6;
    color: #52525B;
  }

  /* ── Controls Sidebar ── */

  .controls {
    width: 260px;
    background: #141414;
    border-left: 1px solid #262626;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .controls::-webkit-scrollbar { width: 3px; }
  .controls::-webkit-scrollbar-track { background: transparent; }
  .controls::-webkit-scrollbar-thumb { background: #262626; border-radius: 2px; }

  /* ── Collapsible Sections ── */

  .section { border-bottom: 1px solid #1e1e1e; }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    cursor: pointer;
    user-select: none;
    transition: background 150ms;
  }

  .section-header:hover { background: #1a1a1a; }

  .section-chevron {
    width: 12px; height: 12px;
    color: #52525B;
    transition: transform 200ms ease;
    flex-shrink: 0;
    transform: rotate(90deg);
  }

  .section.collapsed .section-chevron { transform: rotate(0deg); }

  .section-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #A1A1AA;
  }

  .section-body {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
    max-height: 600px;
    opacity: 1;
    transition: max-height 250ms ease, padding-bottom 200ms ease, opacity 150ms ease;
  }

  .section.collapsed .section-body {
    max-height: 0;
    padding-bottom: 0;
    opacity: 0;
    pointer-events: none;
  }

  /* ── Controls ── */

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-label {
    font-size: 12px;
    font-weight: 500;
    color: #71717A;
  }

  /* ── Style List (vertical) ── */

  .style-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .style-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 150ms;
    border-left: 2px solid transparent;
    user-select: none;
  }

  .style-option:hover { background: #1a1a1a; }

  .style-option.active {
    background: #1a1a1a;
    border-left-color: #F59E0B;
  }

  .style-option input[type="radio"] { display: none; }

  .style-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    border: 1.5px solid #52525B;
    flex-shrink: 0;
    transition: all 150ms;
  }

  .style-option.active .style-dot {
    border-color: #F59E0B;
    background: #F59E0B;
  }

  .style-name {
    font-size: 13px;
    color: #A1A1AA;
    flex: 1;
  }

  .style-option.active .style-name { color: #FAFAFA; }

  .style-desc {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #3a3a3a;
  }

  .style-option.active .style-desc { color: #52525B; }

  /* ── Inputs ── */

  .text-input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #262626;
    color: #FAFAFA;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 150ms;
  }

  .text-input:focus { border-color: #F59E0B; }
  .text-input::placeholder { color: #3a3a3a; }

  .select-input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #262626;
    color: #FAFAFA;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2352525B' stroke-width='1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    transition: border-color 150ms;
  }

  .select-input:focus { border-color: #F59E0B; }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #A1A1AA;
    cursor: pointer;
  }

  .toggle-row input[type="checkbox"] { accent-color: #F59E0B; }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-row input[type="range"] { flex: 1; accent-color: #F59E0B; }

  .range-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #52525B;
    min-width: 28px;
    text-align: right;
  }

  .range-label {
    font-size: 12px;
    color: #52525B;
    min-width: 36px;
  }

  /* ── Wallpaper ── */

  .wallpaper-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .wallpaper-swatch {
    width: 28px; height: 24px;
    border: 1px solid #262626;
    border-radius: 6px;
    cursor: pointer;
    padding: 0;
    background: none;
  }

  .wallpaper-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #52525B;
    flex: 1;
  }

  .wallpaper-reset {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #3a3a3a;
    cursor: pointer;
    background: none;
    border: none;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 150ms;
  }

  .wallpaper-reset:hover { color: #F59E0B; }

  /* ── Zoom ── */

  .zoom-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #3a3a3a;
    font-weight: 400;
  }

  .zoom-region-item {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #71717A;
    padding: 2px 0;
  }

  /* ── Format Toggle ── */

  .format-toggle {
    display: flex;
    border: 1px solid #262626;
    border-radius: 8px;
    overflow: hidden;
  }

  .format-option {
    flex: 1;
    text-align: center;
    padding: 6px 0;
    font-size: 12px;
    font-weight: 500;
    color: #52525B;
    background: #1a1a1a;
    cursor: pointer;
    transition: all 150ms;
    user-select: none;
    border: none;
    font-family: 'DM Sans', sans-serif;
  }

  .format-option input[type="radio"] { display: none; }

  .format-option.active {
    background: #262626;
    color: #FAFAFA;
  }

  .gif-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gif-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .gif-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #52525B;
    min-width: 32px;
  }

  .gif-row .select-input { flex: 1; }

  /* ── Status Bar ── */

  .status-bar {
    height: 26px;
    background: #141414;
    border-top: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    padding: 0 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #3a3a3a;
    flex-shrink: 0;
    gap: 6px;
  }

  .status-bar.success { color: #22C55E; }
  .status-bar.error { color: #EF4444; }
  .status-bar.loading { color: #F59E0B; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .spinner {
    display: inline-block;
    width: 10px; height: 10px;
    border: 1.5px solid #262626;
    border-top-color: #F59E0B;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 6px;
    vertical-align: middle;
  }
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-title">DemoFlow Studio</span>
  <span class="topbar-sep">/</span>
  <select id="recording-select">
    <option value="">Loading\u2026</option>
  </select>
  <div class="topbar-spacer"></div>
  <div class="kbd-hint">
    \u2328
    <div class="kbd-tooltip">
      <div><span class="kl">Render</span><span class="kv">\u2318\u23CE</span></div>
      <div><span class="kl">Frame 1\u20137</span><span class="kv">1\u20137</span></div>
      <div><span class="kl">Collapse all</span><span class="kv">Esc</span></div>
    </div>
  </div>
  <button class="render-btn" id="render-btn" disabled>Render MP4</button>
</div>

<div class="main">
  <div class="preview-pane" id="preview-pane">
    <div class="empty-state" id="empty-state">
      <h2>No recordings</h2>
      <p>Run a scenario with /demo to create a recording,<br>then come back here to adjust the frame.</p>
    </div>
    <iframe id="preview-frame" style="display:none"></iframe>
  </div>

  <div class="controls">

    <div class="section" id="section-frame">
      <div class="section-header" onclick="toggleSection('frame')">
        <svg class="section-chevron" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="section-title">Frame</span>
      </div>
      <div class="section-body">
        <div class="style-list" id="style-group"></div>
        <div class="control-group">
          <label class="control-label">Title</label>
          <input type="text" class="text-input" id="title-input" placeholder="Page title from recording">
        </div>
        <div class="control-group">
          <label class="control-label">Resolution</label>
          <select class="select-input" id="resolution-select">
            <option value="1920x1080">1920 \u00d7 1080</option>
            <option value="2560x1440">2560 \u00d7 1440</option>
            <option value="1440x900">1440 \u00d7 900</option>
            <option value="1280x800">1280 \u00d7 800</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section collapsed" id="section-appearance">
      <div class="section-header" onclick="toggleSection('appearance')">
        <svg class="section-chevron" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="section-title">Appearance</span>
      </div>
      <div class="section-body">
        <div class="control-group" id="url-group">
          <label class="control-label">Address Bar URL</label>
          <input type="text" class="text-input" id="url-input" placeholder="https://example.com">
        </div>
        <div class="control-group" id="comp-visibility-group">
          <label class="control-label">Components</label>
          <label class="toggle-row" id="tl-toggle"><input type="checkbox" id="tl-check" checked> Traffic Lights</label>
          <label class="toggle-row" id="ab-toggle"><input type="checkbox" id="ab-check" checked> Address Bar</label>
          <label class="toggle-row" id="sb-toggle"><input type="checkbox" id="sb-check" checked> Status Bar</label>
          <label class="toggle-row" id="tb-toggle"><input type="checkbox" id="tb-check" checked> Taskbar</label>
        </div>
        <div class="control-group" id="comp-text-group">
          <label class="control-label">Component Text</label>
          <input type="text" class="text-input" id="title-suffix-input" placeholder="- Internet Explorer">
          <input type="text" class="text-input" id="status-text-input" placeholder="Done">
          <input type="text" class="text-input" id="clock-text-input" placeholder="3:42 PM">
        </div>
        <div class="control-group" id="offset-group">
          <label class="control-label">Window Offset</label>
          <div class="range-row">
            <input type="range" id="offset-slider" min="-200" max="200" value="0">
            <span class="range-value" id="offset-value">0px</span>
          </div>
        </div>
        <div class="control-group" id="wallpaper-group">
          <label class="control-label">Wallpaper</label>
          <div class="wallpaper-row">
            <input type="color" class="wallpaper-swatch" id="wallpaper-color" value="#1a0a2e">
            <span class="wallpaper-label" id="wallpaper-label">Default</span>
            <button class="wallpaper-reset" id="wallpaper-reset">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <div class="section collapsed" id="section-effects">
      <div class="section-header" onclick="toggleSection('effects')">
        <svg class="section-chevron" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="section-title">Effects</span>
      </div>
      <div class="section-body">
        <div class="control-group" id="zoom-group">
          <label class="control-label">Zoom Regions <span class="zoom-info">(auto-detected)</span></label>
          <div id="zoom-list"></div>
          <label class="toggle-row"><input type="checkbox" id="zoom-enabled"> Auto-zoom to clicks</label>
          <div class="range-row">
            <span class="range-label">Depth</span>
            <input type="range" id="zoom-depth" min="1" max="6" value="3">
            <span class="range-value" id="zoom-depth-value">3</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section collapsed" id="section-export">
      <div class="section-header" onclick="toggleSection('export')">
        <svg class="section-chevron" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="section-title">Export</span>
      </div>
      <div class="section-body">
        <div class="control-group">
          <label class="control-label">Format</label>
          <div class="format-toggle" id="format-group">
            <label class="format-option active"><input type="radio" name="format" value="mp4" checked><span>MP4</span></label>
            <label class="format-option"><input type="radio" name="format" value="gif"><span>GIF</span></label>
          </div>
          <div class="gif-options" id="gif-options" style="display:none">
            <div class="gif-row">
              <span class="gif-label">FPS</span>
              <select class="select-input" id="gif-fps">
                <option value="15" selected>15</option>
                <option value="20">20</option>
                <option value="25">25</option>
                <option value="30">30</option>
              </select>
            </div>
            <div class="gif-row">
              <span class="gif-label">Size</span>
              <select class="select-input" id="gif-size">
                <option value="medium" selected>Medium (720p)</option>
                <option value="large">Large (1080p)</option>
                <option value="original">Original</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<div class="status-bar" id="status"></div>

<script>
var g = function(id) { return document.getElementById(id); };
var recSelect = g('recording-select');
var previewFrame = g('preview-frame');
var emptyState = g('empty-state');
var previewPane = g('preview-pane');
var titleInput = g('title-input');
var urlInput = g('url-input');
var urlGroup = g('url-group');
var resSelect = g('resolution-select');
var offsetSlider = g('offset-slider');
var offsetValue = g('offset-value');
var offsetGroup = g('offset-group');
var wallpaperColor = g('wallpaper-color');
var wallpaperLabel = g('wallpaper-label');
var wallpaperReset = g('wallpaper-reset');
var wallpaperGroup = g('wallpaper-group');
var renderBtn = g('render-btn');
var statusEl = g('status');

var compVisGroup = g('comp-visibility-group');
var compTextGroup = g('comp-text-group');
var tlToggle = g('tl-toggle');
var abToggle = g('ab-toggle');
var sbToggle = g('sb-toggle');
var tbToggle = g('tb-toggle');
var tlCheck = g('tl-check');
var abCheck = g('ab-check');
var sbCheck = g('sb-check');
var tbCheck = g('tb-check');
var titleSuffixInput = g('title-suffix-input');
var statusTextInput = g('status-text-input');
var clockTextInput = g('clock-text-input');

var zoomEnabled = g('zoom-enabled');
var zoomDepthSlider = g('zoom-depth');
var zoomDepthValue = g('zoom-depth-value');
var zoomList = g('zoom-list');
var gifOptionsEl = g('gif-options');
var gifFps = g('gif-fps');
var gifSize = g('gif-size');

var current = null;
var manifest = null;
var wallpaperActive = false;

var STYLES = [
  { value: 'macos', name: 'macOS', desc: 'Sonoma' },
  { value: 'windows-xp', name: 'Windows XP', desc: '' },
  { value: 'windows-98', name: 'Windows 98', desc: '' },
  { value: 'macos-terminal', name: 'Terminal', desc: 'macOS' },
  { value: 'vscode', name: 'VS Code', desc: '' },
  { value: 'ios', name: 'iPhone', desc: 'iOS' },
  { value: 'none', name: 'None', desc: 'Raw' }
];

// ── Sections ──

function toggleSection(name) {
  var el = g('section-' + name);
  el.classList.toggle('collapsed');
}

// ── Style List ──

function renderStyleList(activeValue) {
  var group = g('style-group');
  group.innerHTML = STYLES.map(function(s) {
    return '<div class="style-option' + (s.value === activeValue ? ' active' : '') + '" data-style="' + s.value + '">' +
      '<input type="radio" name="style" value="' + s.value + '"' + (s.value === activeValue ? ' checked' : '') + '>' +
      '<div class="style-dot"></div>' +
      '<span class="style-name">' + s.name + '</span>' +
      (s.desc ? '<span class="style-desc">' + s.desc + '</span>' : '') +
      '</div>';
  }).join('');

  group.querySelectorAll('.style-option').forEach(function(el) {
    el.addEventListener('click', function() { selectStyle(el.dataset.style); });
  });
}

function selectStyle(value) {
  var radio = document.querySelector('input[name="style"][value="' + value + '"]');
  if (radio) radio.checked = true;
  document.querySelectorAll('.style-option').forEach(function(el) {
    el.classList.toggle('active', el.dataset.style === value);
  });
  toggleStyleControls();
  updatePreview();
}

function getStyle() {
  var checked = document.querySelector('input[name="style"]:checked');
  return checked ? checked.value : 'macos';
}

// ── Recordings ──

async function loadRecordings() {
  var res = await fetch('/api/recordings');
  var recs = await res.json();
  if (recs.length === 0) {
    recSelect.innerHTML = '<option value="">No recordings</option>';
    emptyState.style.display = '';
    previewFrame.style.display = 'none';
    renderBtn.disabled = true;
    return;
  }
  recSelect.innerHTML = recs.map(function(r) {
    return '<option value="' + r.name + '">' + r.name + (r.hasMp4 ? '' : ' (no mp4)') + '</option>';
  }).join('');
  await selectRecording(recs[0].name);
}

async function selectRecording(name) {
  current = name;
  try {
    var res = await fetch('/api/recordings/' + name + '/manifest');
    manifest = res.ok ? await res.json() : null;
  } catch(e) { manifest = null; }

  wallpaperActive = false;
  wallpaperLabel.textContent = 'Default';

  if (manifest && manifest.render) {
    var r = manifest.render;
    renderStyleList(r.frameStyle || 'macos');
    titleInput.value = r.title || (manifest.capture && manifest.capture.pageTitle) || '';
    urlInput.value = r.url || (manifest.capture && manifest.capture.pageUrl) || '';
    if (r.resolution) resSelect.value = r.resolution.width + 'x' + r.resolution.height;
    var comp = r.components || {};
    tlCheck.checked = !comp.hideTrafficLights;
    abCheck.checked = !comp.hideAddressBar;
    sbCheck.checked = !comp.hideStatusBar;
    tbCheck.checked = !comp.hideTaskbar;
    titleSuffixInput.value = comp.titleSuffix || '';
    statusTextInput.value = comp.statusText || '';
    clockTextInput.value = comp.clockText || '';
  } else if (manifest && manifest.capture) {
    var defaultStyle = manifest.capture.device ? 'ios' : manifest.capture.terminal ? 'macos-terminal' : 'macos';
    renderStyleList(defaultStyle);
    if (manifest.capture.device) resSelect.value = '1080x1920';
    titleInput.value = manifest.capture.pageTitle || '';
    urlInput.value = manifest.capture.pageUrl || '';
    resetComponents();
  } else {
    renderStyleList('macos');
    titleInput.value = '';
    urlInput.value = '';
    resetComponents();
  }

  var regions = (manifest && manifest.capture && manifest.capture.zoomRegions) || [];
  if (regions.length > 0) {
    zoomList.innerHTML = regions.map(function(r, i) {
      return '<div class="zoom-region-item">Z' + (i+1) + ': ' +
        (r.startMs/1000).toFixed(1) + 's\\u2013' + (r.endMs/1000).toFixed(1) + 's ' +
        '(depth ' + r.depth + ')</div>';
    }).join('');
    zoomEnabled.checked = true;
  } else {
    zoomList.innerHTML = '<div class="zoom-region-item">None captured</div>';
    zoomEnabled.checked = false;
  }

  emptyState.style.display = 'none';
  previewFrame.style.display = '';
  renderBtn.disabled = false;
  toggleStyleControls();
  updatePreview();
  showInfo();
}

function resetComponents() {
  tlCheck.checked = true;
  abCheck.checked = true;
  sbCheck.checked = true;
  tbCheck.checked = true;
  titleSuffixInput.value = '';
  statusTextInput.value = '';
  clockTextInput.value = '';
}

// ── Style-dependent visibility ──

function toggleStyleControls() {
  var s = getStyle();
  var isWin = s === 'windows-xp' || s === 'windows-98';
  var isMac = s === 'macos' || s === 'macos-terminal';
  var isTerminal = s === 'macos-terminal' || s === 'vscode';
  var isNone = s === 'none';
  var isMobile = s === 'ios';

  urlGroup.style.display = isWin ? '' : 'none';
  offsetGroup.style.display = (isNone || isMobile) ? 'none' : '';
  wallpaperGroup.style.display = isNone ? 'none' : '';

  compVisGroup.style.display = (isNone || isTerminal || isMobile) ? 'none' : '';
  tlToggle.style.display = (isMac && !isTerminal) ? '' : 'none';
  abToggle.style.display = isWin ? '' : 'none';
  sbToggle.style.display = isWin ? '' : 'none';
  tbToggle.style.display = isWin ? '' : 'none';

  compTextGroup.style.display = isWin ? '' : 'none';
  updateResolutionOptions();
}

function updateResolutionOptions() {
  var s = getStyle();
  var currentVal = resSelect.value;
  if (s === 'ios') {
    resSelect.innerHTML = '<option value="1080x1920">1080 \\u00d7 1920</option><option value="750x1334">750 \\u00d7 1334</option><option value="1290x2796">1290 \\u00d7 2796</option>';
  } else {
    resSelect.innerHTML = '<option value="1920x1080">1920 \\u00d7 1080</option><option value="2560x1440">2560 \\u00d7 1440</option><option value="1440x900">1440 \\u00d7 900</option><option value="1280x800">1280 \\u00d7 800</option>';
  }
  var exists = Array.from(resSelect.options).some(function(o) { return o.value === currentVal; });
  if (exists) resSelect.value = currentVal;
}

// ── Options ──

function getComponents() {
  var s = getStyle();
  var comp = {};
  if (s === 'macos') {
    if (!tlCheck.checked) comp.hideTrafficLights = true;
  } else if (s === 'windows-xp' || s === 'windows-98') {
    if (!abCheck.checked) comp.hideAddressBar = true;
    if (!sbCheck.checked) comp.hideStatusBar = true;
    if (!tbCheck.checked) comp.hideTaskbar = true;
    if (titleSuffixInput.value !== '') comp.titleSuffix = titleSuffixInput.value;
    if (statusTextInput.value !== '') comp.statusText = statusTextInput.value;
    if (clockTextInput.value !== '') comp.clockText = clockTextInput.value;
  }
  return comp;
}

function getExportFormat() {
  var checked = document.querySelector('input[name="format"]:checked');
  return checked ? checked.value : 'mp4';
}

function getOptions() {
  var parts = resSelect.value.split('x').map(Number);
  var format = getExportFormat();
  return {
    style: getStyle(),
    title: titleInput.value,
    url: urlInput.value,
    resolution: { width: parts[0], height: parts[1] },
    offsetY: parseInt(offsetSlider.value, 10),
    wallpaper: wallpaperActive ? wallpaperColor.value : '',
    components: getComponents(),
    exportFormat: format,
    gifOptions: format === 'gif' ? {
      frameRate: parseInt(gifFps.value, 10),
      sizePreset: gifSize.value,
      loop: true
    } : undefined
  };
}

// ── Preview ──

function updatePreview() {
  if (!current) return;
  var opts = getOptions();
  var params = new URLSearchParams({
    style: opts.style,
    title: opts.title,
    url: opts.url,
    resWidth: String(opts.resolution.width),
    resHeight: String(opts.resolution.height),
    offsetY: String(opts.offsetY),
    wallpaper: opts.wallpaper
  });
  var comp = opts.components;
  if (comp.hideAddressBar) params.set('hideAddressBar', 'true');
  if (comp.hideStatusBar) params.set('hideStatusBar', 'true');
  if (comp.hideTaskbar) params.set('hideTaskbar', 'true');
  if (comp.hideTrafficLights) params.set('hideTrafficLights', 'true');
  if (comp.titleSuffix !== undefined) params.set('titleSuffix', comp.titleSuffix);
  if (comp.statusText) params.set('statusText', comp.statusText);
  if (comp.clockText) params.set('clockText', comp.clockText);

  previewFrame.src = '/preview/' + current + '?' + params;

  var pane = previewPane;
  var maxW = pane.clientWidth - 48;
  var maxH = pane.clientHeight - 48;
  var fw, fh;
  if (opts.style === 'none') {
    var vp = (manifest && manifest.capture && manifest.capture.viewport) || { width: 1280, height: 720 };
    fw = vp.width;
    fh = vp.height;
  } else {
    fw = opts.resolution.width;
    fh = opts.resolution.height;
  }
  var scale = Math.min(maxW / fw, maxH / fh);
  var scaledW = fw * scale;
  var scaledH = fh * scale;
  previewFrame.style.width = fw + 'px';
  previewFrame.style.height = fh + 'px';
  previewFrame.style.transform = 'scale(' + scale + ')';
  previewFrame.style.transformOrigin = '0 0';
  previewFrame.style.left = ((pane.clientWidth - scaledW) / 2) + 'px';
  previewFrame.style.top = ((pane.clientHeight - scaledH) / 2) + 'px';
}

// ── Status ──

function showInfo() {
  if (!current) return;
  var res = resSelect.value.replace('x', '\\u00d7');
  statusEl.className = 'status-bar';
  statusEl.textContent = current + ' \\u00b7 ' + res + ' \\u00b7 ' + getStyle();
}

// ── Debounce ──

var debounce;
function scheduleUpdate() {
  clearTimeout(debounce);
  debounce = setTimeout(function() { updatePreview(); showInfo(); }, 300);
}

// ── Event listeners ──

recSelect.addEventListener('change', function(e) { selectRecording(e.target.value); });

titleInput.addEventListener('input', scheduleUpdate);
urlInput.addEventListener('input', scheduleUpdate);
resSelect.addEventListener('change', function() { updatePreview(); showInfo(); });

offsetSlider.addEventListener('input', function() {
  offsetValue.textContent = offsetSlider.value + 'px';
  scheduleUpdate();
});

wallpaperColor.addEventListener('input', function() {
  wallpaperActive = true;
  wallpaperLabel.textContent = wallpaperColor.value;
  scheduleUpdate();
});

wallpaperReset.addEventListener('click', function() {
  wallpaperActive = false;
  wallpaperLabel.textContent = 'Default';
  updatePreview();
});

[tlCheck, abCheck, sbCheck, tbCheck].forEach(function(cb) {
  cb.addEventListener('change', updatePreview);
});

[titleSuffixInput, statusTextInput, clockTextInput].forEach(function(inp) {
  inp.addEventListener('input', scheduleUpdate);
});

// Format toggle
document.querySelectorAll('#format-group .format-option').forEach(function(label) {
  var radio = label.querySelector('input');
  radio.addEventListener('change', function() {
    document.querySelectorAll('#format-group .format-option').forEach(function(l) {
      l.classList.toggle('active', l.querySelector('input').checked);
    });
    var fmt = getExportFormat();
    gifOptionsEl.style.display = fmt === 'gif' ? '' : 'none';
    renderBtn.textContent = fmt === 'gif' ? 'Render GIF' : 'Render MP4';
  });
});

zoomDepthSlider.addEventListener('input', function() {
  zoomDepthValue.textContent = zoomDepthSlider.value;
});

// Render
renderBtn.addEventListener('click', async function() {
  if (!current) return;
  renderBtn.disabled = true;
  statusEl.className = 'status-bar loading';
  statusEl.innerHTML = '<span class="spinner"></span>Rendering\\u2026';

  try {
    var opts = getOptions();
    var zoomRegions = zoomEnabled.checked ? ((manifest && manifest.capture && manifest.capture.zoomRegions) || []) : [];
    var res = await fetch('/api/recordings/' + current + '/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frameStyle: opts.style,
        title: opts.title,
        url: opts.url,
        resolution: opts.resolution,
        windowOffsetY: opts.offsetY,
        wallpaperColor: opts.wallpaper || undefined,
        components: opts.components,
        zoomRegions: zoomRegions.length > 0 ? zoomRegions : undefined,
        exportFormat: opts.exportFormat !== 'mp4' ? opts.exportFormat : undefined,
        gifOptions: opts.gifOptions
      })
    });
    var result = await res.json();
    var fmt = opts.exportFormat;
    if (result.mp4Path) {
      statusEl.className = 'status-bar success';
      statusEl.textContent = 'Success: ' + result.mp4Path + (fmt === 'gif' ? ' + .gif' : '');
    } else {
      statusEl.className = 'status-bar error';
      statusEl.textContent = 'Error: Render failed. Check that ffmpeg is installed and accessible.';
    }
  } catch (err) {
    statusEl.className = 'status-bar error';
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    renderBtn.disabled = false;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  var meta = e.metaKey || e.ctrlKey;
  var tag = document.activeElement && document.activeElement.tagName;
  var inText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (meta && e.key === 'Enter') {
    e.preventDefault();
    renderBtn.click();
    return;
  }

  if (e.key === 'Escape') {
    document.querySelectorAll('.section').forEach(function(s) {
      s.classList.add('collapsed');
    });
    if (document.activeElement) document.activeElement.blur();
    return;
  }

  if (!inText && !meta && e.key >= '1' && e.key <= '7') {
    var idx = parseInt(e.key) - 1;
    if (STYLES[idx]) selectStyle(STYLES[idx].value);
  }
});

window.addEventListener('resize', updatePreview);
renderStyleList('macos');
toggleStyleControls();
loadRecordings();
</script>
</body>
</html>`;
}
// ── CLI entry ────────────────────────────────────────────────────────────────
const isDirectRun = process.argv[1]?.replace(/\.ts$/, '.js').endsWith('/studio.js')
    || process.argv[1]?.endsWith('/studio.ts');
if (isDirectRun) {
    const portArg = process.argv.find(a => a.startsWith('--port='));
    const dirArg = process.argv.find(a => a.startsWith('--dir='));
    startStudio({
        port: portArg ? parseInt(portArg.split('=')[1], 10) : undefined,
        outputDir: dirArg ? dirArg.split('=')[1] : undefined,
    });
}
//# sourceMappingURL=studio.js.map