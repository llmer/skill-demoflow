import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { createReadStream, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { readManifest } from './manifest.js'
import { render } from './browser.js'
import { generateFrameHtml, type FrameComponents } from './frame.js'

// ── Server ───────────────────────────────────────────────────────────────────

export interface StudioOptions {
  /** Port to listen on. Default: 3274 */
  port?: number
  /** Base directory containing recording folders. Default: 'output' */
  outputDir?: string
}

export async function startStudio(options: StudioOptions = {}): Promise<void> {
  const port = options.port ?? 3274
  const outputDir = options.outputDir ?? 'output'

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, outputDir)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  })

  server.listen(port, () => {
    console.log(`\n  DemoFlow Studio`)
    console.log(`  ───────────────`)
    console.log(`  http://localhost:${port}\n`)
    console.log(`  Serving recordings from: ${outputDir}/\n`)
  })
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, outputDir: string): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const pathname = url.pathname

  // Studio UI
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(studioHtml())
    return
  }

  // List recordings
  if (pathname === '/api/recordings') {
    const recordings = listRecordings(outputDir)
    json(res, recordings)
    return
  }

  // Get manifest
  const manifestMatch = pathname.match(/^\/api\/recordings\/([^/]+)\/manifest$/)
  if (manifestMatch) {
    const manifest = readManifest(join(outputDir, manifestMatch[1]))
    if (manifest) {
      json(res, manifest)
    } else {
      res.writeHead(404)
      res.end('No manifest')
    }
    return
  }

  // Trigger render
  const renderMatch = pathname.match(/^\/api\/recordings\/([^/]+)\/render$/)
  if (renderMatch && req.method === 'POST') {
    const body = await readBody(req)
    const opts = JSON.parse(body)
    const result = await render(join(outputDir, renderMatch[1]), opts)
    json(res, result)
    return
  }

  // Frame preview (HTML with embedded video)
  const previewMatch = pathname.match(/^\/preview\/([^/]+)$/)
  if (previewMatch) {
    const name = previewMatch[1]
    const manifest = readManifest(join(outputDir, name))
    const viewport = manifest?.capture?.viewport ?? { width: 1280, height: 720 }
    const style = (url.searchParams.get('style') ?? 'macos') as 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none'
    const title = url.searchParams.get('title') ?? manifest?.capture?.pageTitle ?? 'Untitled'
    const urlParam = url.searchParams.get('url') ?? manifest?.capture?.pageUrl ?? ''
    const resW = parseInt(url.searchParams.get('resWidth') ?? '1920', 10)
    const resH = parseInt(url.searchParams.get('resHeight') ?? '1080', 10)
    const offsetY = parseInt(url.searchParams.get('offsetY') ?? '0', 10)
    const wallpaper = url.searchParams.get('wallpaper') ?? ''
    const videoUrl = `/files/${name}/recording.webm`

    const components: FrameComponents = {}
    if (url.searchParams.get('hideAddressBar') === 'true') components.hideAddressBar = true
    if (url.searchParams.get('hideStatusBar') === 'true') components.hideStatusBar = true
    if (url.searchParams.get('hideTaskbar') === 'true') components.hideTaskbar = true
    if (url.searchParams.get('hideTrafficLights') === 'true') components.hideTrafficLights = true
    const titleSuffix = url.searchParams.get('titleSuffix')
    if (titleSuffix !== null) components.titleSuffix = titleSuffix
    const statusText = url.searchParams.get('statusText')
    if (statusText) components.statusText = statusText
    const statusRightText = url.searchParams.get('statusRightText')
    if (statusRightText) components.statusRightText = statusRightText
    const clockText = url.searchParams.get('clockText')
    if (clockText) components.clockText = clockText
    const startButtonText = url.searchParams.get('startButtonText')
    if (startButtonText) components.startButtonText = startButtonText

    const html = previewHtml(videoUrl, viewport, {
      style,
      title,
      url: urlParam,
      resolution: { width: resW, height: resH },
      windowOffsetY: offsetY,
      wallpaperColor: wallpaper || undefined,
      components,
    })
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
    return
  }

  // Serve recording files (video, HAR, screenshots)
  const fileMatch = pathname.match(/^\/files\/([^/]+)\/(.+)$/)
  if (fileMatch) {
    const filePath = join(outputDir, fileMatch[1], fileMatch[2])
    serveFile(req, res, filePath)
    return
  }

  res.writeHead(404)
  res.end('Not found')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function listRecordings(baseDir: string): { name: string; hasManifest: boolean; hasWebm: boolean; hasMp4: boolean }[] {
  if (!existsSync(baseDir)) return []
  return readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      hasManifest: existsSync(join(baseDir, e.name, 'manifest.json')),
      hasWebm: existsSync(join(baseDir, e.name, 'recording.webm')),
      hasMp4: existsSync(join(baseDir, e.name, 'recording.mp4')),
    }))
    .filter(r => r.hasWebm || r.hasMp4)
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.har': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
}

function serveFile(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const stat = statSync(filePath)
  const contentType = MIME[extname(filePath)] ?? 'application/octet-stream'
  const range = req.headers.range

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunkSize = end - start + 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    })
    createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    })
    createReadStream(filePath).pipe(res)
  }
}

// ── Preview HTML ─────────────────────────────────────────────────────────────

interface PreviewOptions {
  style: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none'
  title: string
  url: string
  resolution: { width: number; height: number }
  windowOffsetY?: number
  wallpaperColor?: string
  components?: FrameComponents
}

function previewHtml(
  videoUrl: string,
  viewport: { width: number; height: number },
  options: PreviewOptions,
): string {
  if (options.style === 'none') {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; } body { background: #111; display: flex; align-items: center; justify-content: center; width: ${viewport.width}px; height: ${viewport.height}px; }
</style></head><body>
<video src="${videoUrl}" autoplay loop muted playsinline style="width:${viewport.width}px;height:${viewport.height}px;display:block;"></video>
</body></html>`
  }

  const frameHtml = generateFrameHtml(viewport, {
    style: options.style,
    title: options.title,
    url: options.url,
    resolution: options.resolution,
    windowOffsetY: options.windowOffsetY,
    wallpaperColor: options.wallpaperColor,
    components: options.components,
  })

  // Inject video element into the content area
  return frameHtml.replace(
    '<div class="content-area"></div>',
    `<div class="content-area"><video src="${videoUrl}" autoplay loop muted playsinline style="width:${viewport.width}px;height:${viewport.height}px;display:block;object-fit:cover;"></video></div>`,
  )
}

// ── Studio HTML ──────────────────────────────────────────────────────────────

function studioHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>DemoFlow Studio</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    background: #0e0e0e;
    color: #e0e0e0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .topbar {
    height: 52px;
    background: #161616;
    border-bottom: 1px solid #2a2a2a;
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
    flex-shrink: 0;
  }

  .topbar-title {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.2px;
  }

  .topbar-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #444;
  }

  .topbar select {
    background: #222;
    border: 1px solid #333;
    color: #ccc;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
  }

  .topbar select:focus {
    border-color: #555;
  }

  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .preview-pane {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0a;
    position: relative;
    overflow: hidden;
  }

  .preview-pane iframe {
    border: none;
    border-radius: 4px;
    background: #000;
  }

  .empty-state {
    text-align: center;
    color: #555;
  }

  .empty-state h2 {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 8px;
    color: #666;
  }

  .empty-state p {
    font-size: 13px;
    line-height: 1.5;
  }

  .controls {
    width: 280px;
    background: #161616;
    border-left: 1px solid #2a2a2a;
    padding: 24px 20px;
    overflow-y: auto;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .control-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #666;
  }

  .radio-group {
    display: flex;
    gap: 4px;
  }

  .radio-group label {
    flex: 1;
    text-align: center;
    padding: 7px 0;
    font-size: 12px;
    color: #999;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }

  .radio-group label:first-child {
    border-radius: 6px 0 0 6px;
  }

  .radio-group label:last-child {
    border-radius: 0 6px 6px 0;
  }

  .radio-group input { display: none; }

  .radio-group input:checked + span {
    color: #fff;
  }

  .radio-group label:has(input:checked) {
    background: #2a2a2a;
    border-color: #444;
    color: #fff;
  }

  .text-input {
    width: 100%;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    color: #ddd;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: #555;
  }

  .text-input::placeholder {
    color: #555;
  }

  .select-input {
    width: 100%;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    color: #ddd;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23666' stroke-width='1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }

  .controls-spacer { flex: 1; }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #999;
    cursor: pointer;
  }

  .toggle-row input[type="checkbox"] {
    accent-color: #2563eb;
  }

  .render-btn {
    width: 100%;
    background: #2563eb;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
    letter-spacing: -0.1px;
  }

  .render-btn:hover {
    background: #1d4ed8;
  }

  .render-btn:active {
    background: #1e40af;
  }

  .render-btn:disabled {
    background: #222;
    color: #555;
    cursor: not-allowed;
  }

  .status-bar {
    min-height: 32px;
    display: flex;
    align-items: center;
    font-size: 12px;
    color: #666;
  }

  .status-bar.success { color: #4ade80; }
  .status-bar.error { color: #f87171; }
  .status-bar.loading { color: #facc15; }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid #444;
    border-top-color: #facc15;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
  }
</style>
</head>
<body>
  <div class="topbar">
    <span class="topbar-title">DemoFlow Studio</span>
    <span class="topbar-dot"></span>
    <select id="recording-select">
      <option value="">Loading...</option>
    </select>
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
      <div class="control-group">
        <div class="control-label">Frame Style</div>
        <div class="radio-group" id="style-group">
          <label><input type="radio" name="style" value="macos" checked><span>macOS</span></label>
          <label><input type="radio" name="style" value="windows-xp"><span>XP</span></label>
          <label><input type="radio" name="style" value="windows-98"><span>98</span></label>
          <label><input type="radio" name="style" value="macos-terminal"><span>Terminal</span></label>
          <label><input type="radio" name="style" value="vscode"><span>VS Code</span></label>
          <label><input type="radio" name="style" value="ios"><span>iPhone</span></label>
          <label><input type="radio" name="style" value="none"><span>None</span></label>
        </div>
      </div>

      <div class="control-group">
        <div class="control-label">Window Title</div>
        <input type="text" class="text-input" id="title-input" placeholder="Page title from recording">
      </div>

      <div class="control-group" id="url-group">
        <div class="control-label">Address Bar URL</div>
        <input type="text" class="text-input" id="url-input" placeholder="https://example.com">
      </div>

      <div class="control-group" id="comp-visibility-group">
        <div class="control-label">Components</div>
        <label class="toggle-row" id="tl-toggle"><input type="checkbox" id="tl-check" checked> Traffic Lights</label>
        <label class="toggle-row" id="ab-toggle"><input type="checkbox" id="ab-check" checked> Address Bar</label>
        <label class="toggle-row" id="sb-toggle"><input type="checkbox" id="sb-check" checked> Status Bar</label>
        <label class="toggle-row" id="tb-toggle"><input type="checkbox" id="tb-check" checked> Taskbar</label>
      </div>

      <div class="control-group" id="comp-text-group">
        <div class="control-label">Component Text</div>
        <input type="text" class="text-input" id="title-suffix-input" placeholder=" - Internet Explorer">
        <input type="text" class="text-input" id="status-text-input" placeholder="Done">
        <input type="text" class="text-input" id="clock-text-input" placeholder="3:42 PM">
      </div>

      <div class="control-group">
        <div class="control-label">Desktop Resolution</div>
        <select class="select-input" id="resolution-select">
          <option value="1920x1080">1920 &times; 1080</option>
          <option value="2560x1440">2560 &times; 1440</option>
          <option value="1440x900">1440 &times; 900</option>
          <option value="1280x800">1280 &times; 800</option>
        </select>
      </div>

      <div class="control-group" id="offset-group">
        <div class="control-label">Window Offset Y</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" id="offset-slider" min="-200" max="200" value="0" style="flex:1;accent-color:#2563eb;">
          <span id="offset-value" style="font-size:12px;color:#999;min-width:36px;text-align:right;">0px</span>
        </div>
      </div>

      <div class="control-group" id="wallpaper-group">
        <div class="control-label">Wallpaper Color</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" id="wallpaper-color" value="#1a0a2e" style="width:36px;height:28px;border:1px solid #2a2a2a;border-radius:4px;background:none;cursor:pointer;">
          <label style="font-size:12px;color:#999;display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="wallpaper-custom" style="accent-color:#2563eb;"> Custom
          </label>
        </div>
      </div>

      <div class="control-group" id="zoom-group">
        <div class="control-label">Zoom Regions</div>
        <div id="zoom-list" style="font-size:12px;color:#999;"></div>
        <label class="toggle-row"><input type="checkbox" id="zoom-enabled" style="accent-color:#2563eb;"> Auto-zoom to clicks</label>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <span style="font-size:12px;color:#666;">Depth</span>
          <input type="range" id="zoom-depth" min="1" max="6" value="3" style="flex:1;accent-color:#2563eb;">
          <span id="zoom-depth-value" style="font-size:12px;color:#999;min-width:24px;text-align:right;">3</span>
        </div>
      </div>

      <div class="control-group" id="export-group">
        <div class="control-label">Export Format</div>
        <div class="radio-group" id="format-group">
          <label><input type="radio" name="format" value="mp4" checked><span>MP4</span></label>
          <label><input type="radio" name="format" value="gif"><span>GIF</span></label>
        </div>
        <div id="gif-options" style="display:none;margin-top:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:12px;color:#666;min-width:48px;">FPS</span>
            <select class="select-input" id="gif-fps" style="flex:1;">
              <option value="15" selected>15</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="30">30</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:#666;min-width:48px;">Size</span>
            <select class="select-input" id="gif-size" style="flex:1;">
              <option value="medium" selected>Medium (720p)</option>
              <option value="large">Large (1080p)</option>
              <option value="original">Original</option>
            </select>
          </div>
        </div>
      </div>

      <div class="controls-spacer"></div>

      <button class="render-btn" id="render-btn">Save &amp; Render MP4</button>
      <div class="status-bar" id="status"></div>
    </div>
  </div>

<script>
const $ = (s) => document.getElementById(s);
const recSelect = $('recording-select');
const previewFrame = $('preview-frame');
const emptyState = $('empty-state');
const previewPane = $('preview-pane');
const titleInput = $('title-input');
const urlInput = $('url-input');
const urlGroup = $('url-group');
const resSelect = $('resolution-select');
const offsetSlider = $('offset-slider');
const offsetValue = $('offset-value');
const offsetGroup = $('offset-group');
const wallpaperColor = $('wallpaper-color');
const wallpaperCustom = $('wallpaper-custom');
const wallpaperGroup = $('wallpaper-group');
const renderBtn = $('render-btn');
const statusEl = $('status');

// Component controls
const compVisGroup = $('comp-visibility-group');
const compTextGroup = $('comp-text-group');
const tlToggle = $('tl-toggle');
const abToggle = $('ab-toggle');
const sbToggle = $('sb-toggle');
const tbToggle = $('tb-toggle');
const tlCheck = $('tl-check');
const abCheck = $('ab-check');
const sbCheck = $('sb-check');
const tbCheck = $('tb-check');
const titleSuffixInput = $('title-suffix-input');
const statusTextInput = $('status-text-input');
const clockTextInput = $('clock-text-input');

const zoomEnabled = $('zoom-enabled');
const zoomDepthSlider = $('zoom-depth');
const zoomDepthValue = $('zoom-depth-value');
const zoomList = $('zoom-list');
const gifOptionsEl = $('gif-options');
const gifFps = $('gif-fps');
const gifSize = $('gif-size');

let current = null;
let manifest = null;

async function loadRecordings() {
  const res = await fetch('/api/recordings');
  const recs = await res.json();
  if (recs.length === 0) {
    recSelect.innerHTML = '<option value="">No recordings</option>';
    emptyState.style.display = '';
    previewFrame.style.display = 'none';
    return;
  }
  recSelect.innerHTML = recs.map(r =>
    '<option value="' + r.name + '">' + r.name + (r.hasMp4 ? '' : ' (no mp4)') + '</option>'
  ).join('');
  await selectRecording(recs[0].name);
}

async function selectRecording(name) {
  current = name;
  try {
    const res = await fetch('/api/recordings/' + name + '/manifest');
    manifest = res.ok ? await res.json() : null;
  } catch { manifest = null; }

  // Populate controls from manifest
  if (manifest?.render) {
    setStyle(manifest.render.frameStyle || 'macos');
    titleInput.value = manifest.render.title || manifest.capture?.pageTitle || '';
    urlInput.value = manifest.render.url || manifest.capture?.pageUrl || '';
    const r = manifest.render.resolution;
    if (r) resSelect.value = r.width + 'x' + r.height;
    // Restore component state
    const comp = manifest.render.components || {};
    tlCheck.checked = !comp.hideTrafficLights;
    abCheck.checked = !comp.hideAddressBar;
    sbCheck.checked = !comp.hideStatusBar;
    tbCheck.checked = !comp.hideTaskbar;
    titleSuffixInput.value = comp.titleSuffix ?? '';
    statusTextInput.value = comp.statusText ?? '';
    clockTextInput.value = comp.clockText ?? '';
  } else if (manifest?.capture) {
    const defaultStyle = manifest.capture.device ? 'ios' : manifest.capture.terminal ? 'macos-terminal' : 'macos';
    setStyle(defaultStyle);
    if (manifest.capture.device) resSelect.value = '1080x1920';
    titleInput.value = manifest.capture.pageTitle || '';
    urlInput.value = manifest.capture.pageUrl || '';
    resetComponents();
  } else {
    setStyle('macos');
    titleInput.value = '';
    urlInput.value = '';
    resetComponents();
  }

  // Show zoom regions from manifest
  const regions = manifest?.capture?.zoomRegions || [];
  if (regions.length > 0) {
    zoomList.innerHTML = regions.map((r, i) =>
      '<div style="margin-bottom:4px;">Z' + (i+1) + ': ' +
      (r.startMs/1000).toFixed(1) + 's\\u2013' + (r.endMs/1000).toFixed(1) + 's ' +
      '(depth ' + r.depth + ', focus ' + r.focus.cx.toFixed(2) + ',' + r.focus.cy.toFixed(2) + ')</div>'
    ).join('');
    zoomEnabled.checked = true;
  } else {
    zoomList.innerHTML = '<span style="color:#555;">No zoom regions captured</span>';
    zoomEnabled.checked = false;
  }

  emptyState.style.display = 'none';
  previewFrame.style.display = '';
  updatePreview();
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

function setStyle(value) {
  const radio = document.querySelector('input[name="style"][value="' + value + '"]');
  if (radio) radio.checked = true;
  toggleStyleControls();
}

function getStyle() {
  return document.querySelector('input[name="style"]:checked')?.value || 'macos';
}

function toggleStyleControls() {
  const s = getStyle();
  const isWin = s === 'windows-xp' || s === 'windows-98';
  const isMac = s === 'macos' || s === 'macos-terminal';
  const isTerminal = s === 'macos-terminal' || s === 'vscode';
  const isNone = s === 'none';
  const isMobile = s === 'ios';

  urlGroup.style.display = isWin ? '' : 'none';
  offsetGroup.style.display = (isNone || isMobile) ? 'none' : '';
  wallpaperGroup.style.display = isNone ? 'none' : '';

  // Component visibility toggles
  compVisGroup.style.display = (isNone || isTerminal || isMobile) ? 'none' : '';
  tlToggle.style.display = (isMac && !isTerminal) ? '' : 'none';
  abToggle.style.display = isWin ? '' : 'none';
  sbToggle.style.display = isWin ? '' : 'none';
  tbToggle.style.display = isWin ? '' : 'none';

  // Component text overrides (XP/98 only)
  compTextGroup.style.display = isWin ? '' : 'none';

  updateResolutionOptions();
}

function updateResolutionOptions() {
  const s = getStyle();
  const currentVal = resSelect.value;
  if (s === 'ios') {
    resSelect.innerHTML = '<option value="1080x1920">1080 \\u00d7 1920</option><option value="750x1334">750 \\u00d7 1334</option><option value="1290x2796">1290 \\u00d7 2796</option>';
  } else {
    resSelect.innerHTML = '<option value="1920x1080">1920 \\u00d7 1080</option><option value="2560x1440">2560 \\u00d7 1440</option><option value="1440x900">1440 \\u00d7 900</option><option value="1280x800">1280 \\u00d7 800</option>';
  }
  // Restore previous value if it exists in the new options
  const exists = Array.from(resSelect.options).some(o => o.value === currentVal);
  if (exists) resSelect.value = currentVal;
}

function getComponents() {
  const s = getStyle();
  const comp = {};
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
  return document.querySelector('input[name="format"]:checked')?.value || 'mp4';
}

function getOptions() {
  const [w, h] = resSelect.value.split('x').map(Number);
  const format = getExportFormat();
  return {
    style: getStyle(),
    title: titleInput.value,
    url: urlInput.value,
    resolution: { width: w, height: h },
    offsetY: parseInt(offsetSlider.value, 10),
    wallpaper: wallpaperCustom.checked ? wallpaperColor.value : '',
    components: getComponents(),
    exportFormat: format,
    gifOptions: format === 'gif' ? {
      frameRate: parseInt(gifFps.value, 10),
      sizePreset: gifSize.value,
      loop: true,
    } : undefined,
  };
}

function updatePreview() {
  if (!current) return;
  const opts = getOptions();
  const params = new URLSearchParams({
    style: opts.style,
    title: opts.title,
    url: opts.url,
    resWidth: String(opts.resolution.width),
    resHeight: String(opts.resolution.height),
    offsetY: String(opts.offsetY),
    wallpaper: opts.wallpaper,
  });
  // Add component params (only non-defaults to keep URL clean)
  const comp = opts.components;
  if (comp.hideAddressBar) params.set('hideAddressBar', 'true');
  if (comp.hideStatusBar) params.set('hideStatusBar', 'true');
  if (comp.hideTaskbar) params.set('hideTaskbar', 'true');
  if (comp.hideTrafficLights) params.set('hideTrafficLights', 'true');
  if (comp.titleSuffix !== undefined) params.set('titleSuffix', comp.titleSuffix);
  if (comp.statusText) params.set('statusText', comp.statusText);
  if (comp.clockText) params.set('clockText', comp.clockText);

  previewFrame.src = '/preview/' + current + '?' + params;

  // Scale iframe to fit the preview pane using CSS transform
  const pane = previewPane;
  const maxW = pane.clientWidth - 40;
  const maxH = pane.clientHeight - 40;
  let fw, fh;
  if (opts.style === 'none') {
    const vp = manifest?.capture?.viewport || { width: 1280, height: 720 };
    fw = vp.width;
    fh = vp.height;
  } else {
    fw = opts.resolution.width;
    fh = opts.resolution.height;
  }
  const scale = Math.min(maxW / fw, maxH / fh, 1);
  previewFrame.style.width = fw + 'px';
  previewFrame.style.height = fh + 'px';
  previewFrame.style.transform = 'scale(' + scale + ')';
  previewFrame.style.transformOrigin = 'center center';
}

// Debounce text inputs
let debounce;
function scheduleUpdate() {
  clearTimeout(debounce);
  debounce = setTimeout(updatePreview, 300);
}

recSelect.addEventListener('change', (e) => selectRecording(e.target.value));
document.querySelectorAll('input[name="style"]').forEach(r => {
  r.addEventListener('change', () => { toggleStyleControls(); updatePreview(); });
});
titleInput.addEventListener('input', scheduleUpdate);
urlInput.addEventListener('input', scheduleUpdate);
resSelect.addEventListener('change', updatePreview);
offsetSlider.addEventListener('input', () => {
  offsetValue.textContent = offsetSlider.value + 'px';
  scheduleUpdate();
});
wallpaperColor.addEventListener('input', () => { if (wallpaperCustom.checked) scheduleUpdate(); });
wallpaperCustom.addEventListener('change', updatePreview);

// Component control listeners
[tlCheck, abCheck, sbCheck, tbCheck].forEach(cb => cb.addEventListener('change', updatePreview));
[titleSuffixInput, statusTextInput, clockTextInput].forEach(inp => inp.addEventListener('input', scheduleUpdate));

// Format toggle
document.querySelectorAll('input[name="format"]').forEach(r => {
  r.addEventListener('change', () => {
    const fmt = getExportFormat();
    gifOptionsEl.style.display = fmt === 'gif' ? '' : 'none';
    renderBtn.textContent = fmt === 'gif' ? 'Save \\u0026 Render GIF' : 'Save \\u0026 Render MP4';
  });
});

// Zoom depth slider
zoomDepthSlider.addEventListener('input', () => {
  zoomDepthValue.textContent = zoomDepthSlider.value;
});

renderBtn.addEventListener('click', async () => {
  if (!current) return;
  renderBtn.disabled = true;
  statusEl.className = 'status-bar loading';
  statusEl.innerHTML = '<span class="spinner"></span>Rendering\u2026';

  try {
    const opts = getOptions();

    // Pass zoom regions from manifest (or empty if disabled)
    const zoomRegions = zoomEnabled.checked ? (manifest?.capture?.zoomRegions || []) : [];

    const res = await fetch('/api/recordings/' + current + '/render', {
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
        gifOptions: opts.gifOptions,
      }),
    });
    const result = await res.json();
    const fmt = opts.exportFormat;
    if (result.mp4Path) {
      statusEl.className = 'status-bar success';
      statusEl.textContent = 'Saved \\u2192 ' + result.mp4Path + (fmt === 'gif' ? ' + .gif' : '');
    } else {
      statusEl.className = 'status-bar error';
      statusEl.textContent = 'Render failed \\u2014 is ffmpeg installed?';
    }
  } catch (err) {
    statusEl.className = 'status-bar error';
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    renderBtn.disabled = false;
  }
});

window.addEventListener('resize', updatePreview);
toggleStyleControls();
loadRecordings();
</script>
</body>
</html>`
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isDirectRun = process.argv[1]?.replace(/\.ts$/, '.js').endsWith('/studio.js')
  || process.argv[1]?.endsWith('/studio.ts')

if (isDirectRun) {
  const portArg = process.argv.find(a => a.startsWith('--port='))
  const dirArg = process.argv.find(a => a.startsWith('--dir='))
  startStudio({
    port: portArg ? parseInt(portArg.split('=')[1], 10) : undefined,
    outputDir: dirArg ? dirArg.split('=')[1] : undefined,
  })
}
