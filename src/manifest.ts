import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { PauseSegment } from './browser.js'
import type { FrameComponents } from './frame.js'
import type { ZoomRegion, ElementHit, SpeedRegion, Annotation, GifOptions } from './types.js'

export interface CaptureInfo {
  commitHash: string
  dirty: boolean
  scenarioHash?: string
  targetHash?: string
  libHash?: string
  viewport: { width: number; height: number }
  pauses: PauseSegment[]
  pageUrl?: string
  pageTitle?: string
  timestamp: string
  /** Device preset key used for recording, e.g. 'iphone-15-pro' */
  device?: string
  /** Terminal recording metadata (absent for browser recordings). */
  terminal?: {
    shell: string
    cwd: string
  }
  /** Zoom regions derived from step metadata (auto-zoom) */
  zoomRegions?: ZoomRegion[]
  /** Element bounding boxes captured during recording (for auto-zoom) */
  elementHitmap?: ElementHit[]
  /** Speed regions derived from step metadata */
  speedRegions?: SpeedRegion[]
  /** Annotations derived from step metadata */
  annotations?: Annotation[]
  /** Path to cursor telemetry JSON file (relative to output dir) */
  cursorTelemetryPath?: string
}

export interface RenderInfo {
  frameStyle: 'macos' | 'windows-xp' | 'windows-98' | 'macos-terminal' | 'vscode' | 'ios' | 'none'
  title?: string
  url?: string
  resolution: { width: number; height: number }
  windowOffsetY?: number
  wallpaperColor?: string
  components?: FrameComponents
  timestamp: string
  /** Override or additional zoom regions from Studio */
  zoomRegions?: ZoomRegion[]
  /** Speed regions */
  speedRegions?: SpeedRegion[]
  /** Annotations */
  annotations?: Annotation[]
  /** Export format */
  exportFormat?: 'mp4' | 'gif'
  /** GIF export options */
  gifOptions?: GifOptions
}

export interface Manifest {
  capture: CaptureInfo
  render?: RenderInfo
}

export function getGitState(): { commitHash: string; dirty: boolean } {
  try {
    const commitHash = execSync('git rev-parse HEAD', { stdio: 'pipe', encoding: 'utf-8' }).trim()
    const status = execSync('git status --porcelain', { stdio: 'pipe', encoding: 'utf-8' }).trim()
    return { commitHash, dirty: status.length > 0 }
  } catch {
    return { commitHash: 'unknown', dirty: true }
  }
}

export function hashFile(filePath: string): string {
  if (!existsSync(filePath)) return 'missing'
  const content = readFileSync(filePath, 'utf-8')
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Compute a hash of all .js files in the skill lib directory.
 * Used to detect when the lib has changed so scripts get regenerated.
 */
export function getLibHash(): string {
  try {
    const libDir = join(dirname(fileURLToPath(import.meta.url)))
    const jsFiles = readdirSync(libDir).filter(f => f.endsWith('.js')).sort()
    const hash = createHash('sha256')
    for (const file of jsFiles) {
      hash.update(readFileSync(join(libDir, file), 'utf-8'))
    }
    return hash.digest('hex').slice(0, 16)
  } catch {
    return 'unknown'
  }
}

export function readManifest(outputDir: string): Manifest | null {
  const manifestPath = join(outputDir, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}

export function writeManifest(outputDir: string, manifest: Manifest): void {
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

export interface CaptureValidationOptions {
  scenarioPath?: string
  targetPath?: string
}

/**
 * Check whether an existing capture in outputDir is still valid.
 * Valid means: WebM exists, git HEAD matches, working tree is clean,
 * scenario/target file hashes match (if paths provided), and the
 * skill lib hasn't changed since the capture.
 */
export function isCaptureValid(outputDir: string, options: CaptureValidationOptions = {}): boolean {
  const manifest = readManifest(outputDir)
  if (!manifest) return false

  if (!existsSync(join(outputDir, 'recording.webm'))) return false

  const { commitHash, dirty } = getGitState()

  // Dirty working tree → can't verify code hasn't changed
  if (dirty) return false

  if (manifest.capture.commitHash !== commitHash) return false

  // Skill lib changed → script may use stale API patterns
  if (manifest.capture.libHash && manifest.capture.libHash !== getLibHash()) return false

  if (options.scenarioPath) {
    const currentHash = hashFile(options.scenarioPath)
    if (manifest.capture.scenarioHash !== currentHash) return false
  }

  if (options.targetPath) {
    const currentHash = hashFile(options.targetPath)
    if (manifest.capture.targetHash !== currentHash) return false
  }

  return true
}
