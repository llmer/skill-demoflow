import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { CLICK_VIS_SCRIPT, compositeWithFrame, convertToMp4, convertToMp4WithTrim, convertToMp4WithZoom, convertToMp4WithSpeed, convertToGif } from './recorder.js'
import { renderFrame, type DesktopFrameOptions, type FrameComponents } from './frame.js'
import { getGitState, getLibHash, hashFile, readManifest, writeManifest, type Manifest } from './manifest.js'
import { getDevicePreset } from './devices.js'
import { generateAutoZoomRegions } from './zoom.js'
import { CURSOR_SAMPLE_SCRIPT, collectCursorSamples, saveCursorTelemetry } from './cursor.js'
import { renderWithAnnotations } from './render-page.js'
import type { ElementHit, ZoomRegion, SpeedRegion, Annotation, ScenarioEffects, GifOptions, CursorPoint } from './types.js'

export interface RecordingOptions {
  /** Output directory for HAR, video, screenshots. Created if missing. */
  outputDir: string
  /** Browser viewport size. */
  viewport?: { width: number; height: number }
  /** Run headed (default true). */
  headed?: boolean
  /** Slow down actions by this many ms (default 100). */
  slowMo?: number
  /** Ignore HTTPS errors (default true). */
  ignoreHTTPSErrors?: boolean
  /** Device preset for mobile emulation (e.g. 'iphone-15-pro'). Sets viewport, isMobile, hasTouch, userAgent. Overrides viewport. */
  device?: string
  /** Wrap video in a frame. Default: true (macOS style). Pass false to disable. */
  desktopFrame?: boolean | DesktopFrameOptions
  /** Path to scenario file — stored in manifest for cache invalidation. */
  scenarioPath?: string
  /** Path to target file — stored in manifest for cache invalidation. */
  targetPath?: string
  /** Scenario-level effect configuration (auto-zoom, GIF export, etc.) */
  effects?: ScenarioEffects
}

export interface PauseSegment {
  /** Seconds from recording start when pause began */
  start: number
  /** Seconds from recording start when pause ended */
  end: number
}

export interface RecordingSession {
  browser: Browser
  context: BrowserContext
  page: Page
  outputDir: string
  /** @internal wall-clock time when recording started */
  _startTime: number
  /** @internal pause segments to trim from video */
  _pauses: PauseSegment[]
  /** @internal timestamp of current pause start, or null */
  _pauseStart: number | null
  /** @internal resolved desktop frame options, or null if disabled */
  _frameOptions: DesktopFrameOptions | null
  /** @internal viewport used for recording */
  _viewport: { width: number; height: number }
  /** @internal device preset key */
  _device?: string
  /** @internal scenario file path for manifest hashing */
  _scenarioPath?: string
  /** @internal target file path for manifest hashing */
  _targetPath?: string
  /** @internal element bounding boxes captured during recording (for auto-zoom) */
  _elementHits: ElementHit[]
  /** @internal explicitly defined zoom regions */
  _zoomRegions: ZoomRegion[]
  /** @internal speed regions for variable playback speed */
  _speedRegions: SpeedRegion[]
  /** @internal annotations from step directives */
  _annotations: Annotation[]
  /** @internal scenario-level effect configuration */
  _effects: ScenarioEffects
}

export interface RecordingResult {
  harPath: string
  mp4Path: string | null
  webmPath: string | null
}

// ── Render (standalone post-processing) ──────────────────────────────────────

export interface RenderOptions {
  /** Frame style. 'none' disables frame. Default: 'macos' */
  frameStyle?: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none'
  /** Title for titlebar/tab. Falls back to captured page title. */
  title?: string
  /** URL for address bar (XP/98 style). Falls back to captured page URL. */
  url?: string
  /** Desktop resolution. Default: 1920x1080 */
  resolution?: { width: number; height: number }
  /** Vertical offset in px from centered position. Default: 0 */
  windowOffsetY?: number
  /** Solid wallpaper color. Overrides the default gradient if set. */
  wallpaperColor?: string
  /** Per-component visibility and text overrides. */
  components?: FrameComponents
  /** Zoom regions to apply. Falls back to manifest data. */
  zoomRegions?: ZoomRegion[]
  /** Speed regions to apply. Falls back to manifest data. */
  speedRegions?: SpeedRegion[]
  /** Annotations to draw on frames. Falls back to manifest data. */
  annotations?: Annotation[]
  /** Export format. Default: 'mp4' */
  exportFormat?: 'mp4' | 'gif'
  /** GIF export options (when exportFormat is 'gif'). */
  gifOptions?: GifOptions
}

export interface RenderResult {
  mp4Path: string | null
}

/**
 * Re-render an existing capture to MP4 with optional frame compositing.
 * Reads viewport and pause data from the manifest (or uses defaults).
 * Does NOT require a browser session — works entirely from the WebM on disk.
 */
export async function render(outputDir: string, options: RenderOptions = {}): Promise<RenderResult> {
  const manifest = readManifest(outputDir)
  const viewport = manifest?.capture?.viewport ?? { width: 1280, height: 720 }
  const pauses = manifest?.capture?.pauses ?? []
  const zoomRegions = options.zoomRegions ?? manifest?.capture?.zoomRegions ?? []
  const speedRegions = options.speedRegions ?? manifest?.capture?.speedRegions ?? []
  const annotations = options.annotations ?? manifest?.capture?.annotations ?? []

  const webmPath = join(outputDir, 'recording.webm')
  if (!existsSync(webmPath)) {
    throw new Error(`No recording.webm in ${outputDir} — run a capture first`)
  }

  const mp4Path = join(outputDir, 'recording.mp4')

  // Step 1: WebM → MP4 (with pause trimming + zoom + speed)
  try {
    const pauseArg = pauses.length > 0 ? pauses : undefined
    if (zoomRegions.length > 0) {
      // TODO: combine zoom + speed in a single pass when both are present
      convertToMp4WithZoom(webmPath, mp4Path, zoomRegions, viewport, pauseArg)
    } else if (speedRegions.length > 0) {
      convertToMp4WithSpeed(webmPath, mp4Path, speedRegions, pauseArg)
    } else if (pauses.length > 0) {
      convertToMp4WithTrim(webmPath, mp4Path, pauses)
    } else {
      convertToMp4(webmPath, mp4Path)
    }
  } catch {
    updateRenderManifest(outputDir, manifest, options)
    return { mp4Path: null }
  }

  // Step 2: Annotation rendering (frame-by-frame pipeline if annotations present)
  if (annotations.length > 0 && existsSync(mp4Path)) {
    try {
      const annotatedPath = join(outputDir, 'recording-annotated.mp4')
      await renderWithAnnotations({
        inputPath: mp4Path,
        outputPath: annotatedPath,
        width: viewport.width,
        height: viewport.height,
        // Pass zoom regions only if they weren't already applied in step 1
        zoomRegions: zoomRegions.length > 0 ? undefined : undefined,
        annotations,
      })
      unlinkSync(mp4Path)
      renameSync(annotatedPath, mp4Path)
    } catch {
      // Annotation rendering failed — keep the MP4 without annotations
    }
  }

  // Step 3: Frame compositing
  const frameStyle = options.frameStyle ?? 'macos'
  if (frameStyle !== 'none') {
    try {
      const frameOpts: DesktopFrameOptions = {
        style: frameStyle,
        title: options.title ?? manifest?.capture?.pageTitle,
        url: options.url ?? manifest?.capture?.pageUrl,
        resolution: options.resolution,
        windowOffsetY: options.windowOffsetY,
        wallpaperColor: options.wallpaperColor,
        components: options.components,
      }
      const frame = await renderFrame(outputDir, viewport, frameOpts)
      const framedPath = join(outputDir, 'recording-framed.mp4')
      compositeWithFrame(mp4Path, frame.pngPath, framedPath, frame.contentX, frame.contentY)

      unlinkSync(mp4Path)
      renameSync(framedPath, mp4Path)
      unlinkSync(frame.pngPath)
    } catch {
      // Frame compositing failed — keep unframed MP4
    }
  }

  // Step 4: GIF export (optional)
  const exportFormat = options.exportFormat ?? 'mp4'
  if (exportFormat === 'gif' && existsSync(mp4Path)) {
    try {
      const gifPath = join(outputDir, 'recording.gif')
      convertToGif(mp4Path, gifPath, options.gifOptions)
    } catch {
      // GIF export failed — MP4 still available
    }
  }

  updateRenderManifest(outputDir, manifest, options)
  return { mp4Path }
}

function updateRenderManifest(outputDir: string, manifest: Manifest | null, options: RenderOptions): void {
  if (!manifest) return
  manifest.render = {
    frameStyle: options.frameStyle ?? 'macos',
    title: options.title,
    url: options.url,
    resolution: options.resolution ?? { width: 1920, height: 1080 },
    windowOffsetY: options.windowOffsetY,
    wallpaperColor: options.wallpaperColor,
    components: options.components,
    timestamp: new Date().toISOString(),
    ...(options.zoomRegions ? { zoomRegions: options.zoomRegions } : {}),
    ...(options.speedRegions ? { speedRegions: options.speedRegions } : {}),
    ...(options.annotations ? { annotations: options.annotations } : {}),
    ...(options.exportFormat ? { exportFormat: options.exportFormat } : {}),
    ...(options.gifOptions ? { gifOptions: options.gifOptions } : {}),
  }
  writeManifest(outputDir, manifest)
}

// ── Recording lifecycle ──────────────────────────────────────────────────────

/**
 * Launch a Chromium browser with full recording enabled:
 * - HAR capture (all network traffic)
 * - Video recording
 * - Click visualization (red dot on every click)
 */
export async function launchWithRecording(
  options: RecordingOptions,
): Promise<RecordingSession> {
  const {
    outputDir,
    headed = true,
    slowMo = 100,
    ignoreHTTPSErrors = true,
    desktopFrame = true,
    scenarioPath,
    targetPath,
    effects = {},
  } = options

  // Resolve device preset (overrides viewport)
  const preset = options.device ? getDevicePreset(options.device) : undefined
  const viewport = preset?.viewport ?? options.viewport ?? { width: 1280, height: 720 }

  // Frame defaults: use iOS frame for device presets unless explicitly overridden
  let frameOptions: DesktopFrameOptions | null
  if (desktopFrame === false) {
    frameOptions = null
  } else if (desktopFrame === true && preset) {
    frameOptions = { style: 'ios', resolution: { width: 1080, height: 1920 } }
  } else if (desktopFrame === true) {
    frameOptions = {}
  } else {
    frameOptions = desktopFrame
  }

  mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch({
    headless: !headed,
    slowMo,
  })

  const context = await browser.newContext({
    recordHar: {
      path: join(outputDir, 'recording.har'),
      mode: 'full',
    },
    recordVideo: {
      dir: outputDir,
      size: viewport,
    },
    ignoreHTTPSErrors,
    viewport,
    ...(preset ? {
      isMobile: preset.isMobile,
      hasTouch: preset.hasTouch,
      userAgent: preset.userAgent,
    } : {}),
  })

  const page = await context.newPage()
  await page.addInitScript(CLICK_VIS_SCRIPT)
  if (effects.cursorTelemetry) {
    await page.addInitScript(CURSOR_SAMPLE_SCRIPT)
  }

  return {
    browser, context, page, outputDir,
    _startTime: Date.now(), _pauses: [], _pauseStart: null,
    _frameOptions: frameOptions, _viewport: viewport,
    _device: options.device,
    _scenarioPath: scenarioPath, _targetPath: targetPath,
    _elementHits: [], _zoomRegions: [], _speedRegions: [], _annotations: [], _effects: effects,
  }
}

/**
 * Mark the start of an idle period (e.g. waiting for user input).
 * The paused segment will be trimmed from the final video.
 */
export function pauseRecording(session: RecordingSession): void {
  if (session._pauseStart === null) {
    session._pauseStart = (Date.now() - session._startTime) / 1000
  }
}

/**
 * Mark the end of an idle period. Recording resumes normally.
 */
export function resumeRecording(session: RecordingSession): void {
  if (session._pauseStart !== null) {
    session._pauses.push({
      start: session._pauseStart,
      end: (Date.now() - session._startTime) / 1000,
    })
    session._pauseStart = null
  }
}

/**
 * Finalize recording: close browser, save manifest, convert + frame.
 * Must be called after the scenario completes (or on error).
 *
 * This captures page metadata, saves the manifest with git state and
 * pause segments, then calls render() to produce the final MP4.
 */
export async function finalize(
  session: RecordingSession,
  overrides?: { pageTitle?: string; pageUrl?: string },
): Promise<RecordingResult> {
  const { page, context, browser, outputDir } = session

  // Capture page info before closing (needed for frame title/URL)
  let pageUrl: string | undefined
  let pageTitle: string | undefined
  try {
    pageUrl = page.url()
    pageTitle = await page.title()
  } catch {
    // Page may already be closed
  }

  // Collect cursor telemetry before closing
  let cursorSamples: CursorPoint[] = []
  if (session._effects.cursorTelemetry) {
    cursorSamples = await collectCursorSamples(page)
  }

  // Apply overrides (e.g. terminal sessions provide meaningful titles)
  if (overrides?.pageTitle) pageTitle = overrides.pageTitle
  if (overrides?.pageUrl) pageUrl = overrides.pageUrl

  await page.close()
  await context.close()
  await browser.close()

  const harPath = join(outputDir, 'recording.har')
  let webmPath: string | null = null
  let mp4Path: string | null = null

  const webmFiles = readdirSync(outputDir).filter((f) => f.endsWith('.webm'))
  if (webmFiles.length > 0) {
    const originalWebm = join(outputDir, webmFiles[0])
    webmPath = join(outputDir, 'recording.webm')
    if (originalWebm !== webmPath) {
      renameSync(originalWebm, webmPath)
    }

    // Generate auto-zoom regions from element hits
    let zoomRegions = session._zoomRegions
    const autoZoom = session._effects.autoZoom
    if (autoZoom && session._elementHits.length > 0) {
      const autoOpts = typeof autoZoom === 'object' ? autoZoom : {}
      const autoRegions = generateAutoZoomRegions(
        session._elementHits,
        session._viewport,
        autoOpts,
      )
      zoomRegions = [...zoomRegions, ...autoRegions]
    }

    // Save manifest with capture info
    const gitState = getGitState()
    const manifest: Manifest = {
      capture: {
        commitHash: gitState.commitHash,
        dirty: gitState.dirty,
        libHash: getLibHash(),
        viewport: session._viewport,
        pauses: session._pauses,
        pageUrl,
        pageTitle,
        timestamp: new Date().toISOString(),
        ...(session._device ? { device: session._device } : {}),
        ...(session._scenarioPath ? { scenarioHash: hashFile(session._scenarioPath) } : {}),
        ...(session._targetPath ? { targetHash: hashFile(session._targetPath) } : {}),
        ...(zoomRegions.length > 0 ? { zoomRegions } : {}),
        ...(session._elementHits.length > 0 ? { elementHitmap: session._elementHits } : {}),
        ...(session._speedRegions.length > 0 ? { speedRegions: session._speedRegions } : {}),
        ...(session._annotations.length > 0 ? { annotations: session._annotations } : {}),
        ...(cursorSamples.length > 0 ? { cursorTelemetryPath: 'cursor.json' } : {}),
      },
    }
    writeManifest(outputDir, manifest)

    // Save cursor telemetry
    if (cursorSamples.length > 0) {
      saveCursorTelemetry(outputDir, cursorSamples)
    }

    // Render: convert to MP4 + frame composite
    const frameStyle = session._frameOptions === null
      ? 'none' as const
      : (session._frameOptions.style ?? 'macos') as Exclude<RenderOptions['frameStyle'], 'none' | undefined>

    // Resolve GIF export config from effects
    const gifConfig = session._effects.gif
    const exportFormat = gifConfig ? 'gif' as const : undefined
    const gifOptions = typeof gifConfig === 'object' ? gifConfig : undefined

    const renderResult = await render(outputDir, {
      frameStyle,
      title: session._frameOptions?.title ?? pageTitle,
      url: session._frameOptions?.url ?? pageUrl,
      resolution: session._frameOptions?.resolution,
      ...(exportFormat ? { exportFormat } : {}),
      ...(gifOptions ? { gifOptions } : {}),
    })
    mp4Path = renderResult.mp4Path
  }

  return { harPath, mp4Path, webmPath }
}
