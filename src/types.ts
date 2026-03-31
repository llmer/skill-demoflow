// ── Zoom ────────────────────────────────────────────────────────────────────

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6

export interface ZoomFocus {
  /** Normalized horizontal center (0 = left, 1 = right) */
  cx: number
  /** Normalized vertical center (0 = top, 1 = bottom) */
  cy: number
}

export interface ZoomRegion {
  id: string
  startMs: number
  endMs: number
  depth: ZoomDepth
  focus: ZoomFocus
}

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
}

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3

// ── Speed ───────────────────────────────────────────────────────────────────

export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2

export interface SpeedRegion {
  id: string
  startMs: number
  endMs: number
  speed: PlaybackSpeed
}

// ── Annotations ─────────────────────────────────────────────────────────────

export type AnnotationType = 'text' | 'arrow'

export type ArrowDirection =
  | 'up' | 'down' | 'left' | 'right'
  | 'up-right' | 'up-left' | 'down-right' | 'down-left'

export interface Annotation {
  id: string
  startMs: number
  endMs: number
  type: AnnotationType
  /** Label text (for type: 'text') */
  content?: string
  /** Position as fraction of viewport (0-1) */
  position: { x: number; y: number }
  /** Size as fraction of viewport (0-1) */
  size: { width: number; height: number }
  style?: {
    color?: string
    backgroundColor?: string
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
  }
  arrow?: {
    direction: ArrowDirection
    color?: string
    strokeWidth?: number
  }
  zIndex?: number
}

// ── Cursor telemetry ────────────────────────────────────────────────────────

export interface CursorPoint {
  timeMs: number
  /** Normalized horizontal position (0-1) */
  cx: number
  /** Normalized vertical position (0-1) */
  cy: number
}

// ── Element hit tracking (for auto-zoom) ────────────────────────────────────

export interface ElementHit {
  stepIndex: number
  timeMs: number
  selector: string
  bbox: { x: number; y: number; width: number; height: number }
}

// ── Scenario-level effect configuration ─────────────────────────────────────

export interface ScenarioEffects {
  /** Auto-zoom to clicked elements. Default: false */
  autoZoom?: boolean | { depth?: ZoomDepth; durationMs?: number }
  /** GIF export options. Pass true for defaults, or configure. */
  gif?: boolean | GifOptions
  /** Collect cursor telemetry for auto-zoom suggestions. Default: false */
  cursorTelemetry?: boolean
}

export interface GifOptions {
  /** Frame rate for GIF output. Default: 15 */
  frameRate?: 15 | 20 | 25 | 30
  /** Size preset. Default: 'medium' (720p height) */
  sizePreset?: 'medium' | 'large' | 'original'
  /** Loop GIF. Default: true */
  loop?: boolean
}
