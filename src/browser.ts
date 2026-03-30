import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { CLICK_VIS_SCRIPT, compositeWithFrame, convertToMp4, convertToMp4WithTrim } from './recorder.js'
import { renderFrame, type DesktopFrameOptions, type FrameComponents } from './frame.js'
import { getGitState, getLibHash, hashFile, readManifest, writeManifest, type Manifest } from './manifest.js'
import { getDevicePreset } from './devices.js'

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

  const webmPath = join(outputDir, 'recording.webm')
  if (!existsSync(webmPath)) {
    throw new Error(`No recording.webm in ${outputDir} — run a capture first`)
  }

  const mp4Path = join(outputDir, 'recording.mp4')

  // Step 1: WebM → MP4 (with pause trimming)
  try {
    if (pauses.length > 0) {
      convertToMp4WithTrim(webmPath, mp4Path, pauses)
    } else {
      convertToMp4(webmPath, mp4Path)
    }
  } catch {
    updateRenderManifest(outputDir, manifest, options)
    return { mp4Path: null }
  }

  // Step 2: Frame compositing
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

  return {
    browser, context, page, outputDir,
    _startTime: Date.now(), _pauses: [], _pauseStart: null,
    _frameOptions: frameOptions, _viewport: viewport,
    _device: options.device,
    _scenarioPath: scenarioPath, _targetPath: targetPath,
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
      },
    }
    writeManifest(outputDir, manifest)

    // Render: convert to MP4 + frame composite
    const frameStyle = session._frameOptions === null
      ? 'none' as const
      : (session._frameOptions.style ?? 'macos') as Exclude<RenderOptions['frameStyle'], 'none' | undefined>

    const renderResult = await render(outputDir, {
      frameStyle,
      title: session._frameOptions?.title ?? pageTitle,
      url: session._frameOptions?.url ?? pageUrl,
      resolution: session._frameOptions?.resolution,
    })
    mp4Path = renderResult.mp4Path
  }

  return { harPath, mp4Path, webmPath }
}
