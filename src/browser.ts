import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'
import { CLICK_VIS_SCRIPT, convertToMp4, convertToMp4WithTrim } from './recorder.js'

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
}

export interface RecordingResult {
  harPath: string
  mp4Path: string | null
  webmPath: string | null
}

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
    viewport = { width: 1280, height: 720 },
    headed = true,
    slowMo = 100,
    ignoreHTTPSErrors = true,
  } = options

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
  })

  const page = await context.newPage()
  await page.addInitScript(CLICK_VIS_SCRIPT)

  return { browser, context, page, outputDir, _startTime: Date.now(), _pauses: [], _pauseStart: null }
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
 * Finalize recording: close browser, rename video, convert to mp4.
 * Must be called after the scenario completes (or on error).
 */
export async function finalize(session: RecordingSession): Promise<RecordingResult> {
  const { page, context, browser, outputDir } = session

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
    renameSync(originalWebm, webmPath)

    mp4Path = join(outputDir, 'recording.mp4')
    try {
      if (session._pauses.length > 0) {
        convertToMp4WithTrim(webmPath, mp4Path, session._pauses)
      } else {
        convertToMp4(webmPath, mp4Path)
      }
    } catch {
      mp4Path = null
    }
  }

  return { harPath, mp4Path, webmPath }
}
