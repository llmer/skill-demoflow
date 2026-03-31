/**
 * Annotation rendering utilities.
 *
 * Generates Canvas2D drawing commands for text labels and directional arrows.
 * Used by the render page (render-page.ts) for frame-by-frame compositing,
 * and can also generate standalone SVG/Canvas snippets for Studio preview.
 */

import type { Annotation, ArrowDirection } from './types.js'

// ── Arrow SVG paths ─────────────────────────────────────────────────────────

const ARROW_PATHS: Record<ArrowDirection, string> = {
  'up':         'M 0.5 0 L 0.5 0.85 M 0.3 0.2 L 0.5 0 L 0.7 0.2',
  'down':       'M 0.5 1 L 0.5 0.15 M 0.3 0.8 L 0.5 1 L 0.7 0.8',
  'left':       'M 0 0.5 L 0.85 0.5 M 0.2 0.3 L 0 0.5 L 0.2 0.7',
  'right':      'M 1 0.5 L 0.15 0.5 M 0.8 0.3 L 1 0.5 L 0.8 0.7',
  'up-right':   'M 0.85 0.15 L 0.15 0.85 M 0.5 0.15 L 0.85 0.15 L 0.85 0.5',
  'up-left':    'M 0.15 0.15 L 0.85 0.85 M 0.5 0.15 L 0.15 0.15 L 0.15 0.5',
  'down-right': 'M 0.85 0.85 L 0.15 0.15 M 0.5 0.85 L 0.85 0.85 L 0.85 0.5',
  'down-left':  'M 0.15 0.85 L 0.85 0.15 M 0.5 0.85 L 0.15 0.85 L 0.15 0.5',
}

// ── Canvas2D rendering commands ─────────────────────────────────────────────

/**
 * Generate JavaScript code that draws an annotation onto a Canvas2D context.
 * The code assumes a `ctx` variable is in scope and the canvas matches the
 * video viewport dimensions.
 *
 * @param annotation The annotation to render
 * @param viewportWidth Video viewport width in pixels
 * @param viewportHeight Video viewport height in pixels
 * @returns JavaScript source string
 */
export function generateAnnotationDrawCode(
  annotation: Annotation,
  viewportWidth: number,
  viewportHeight: number,
): string {
  const x = annotation.position.x * viewportWidth
  const y = annotation.position.y * viewportHeight
  const w = annotation.size.width * viewportWidth
  const h = annotation.size.height * viewportHeight

  if (annotation.type === 'arrow' && annotation.arrow) {
    return generateArrowCode(x, y, w, h, annotation.arrow)
  }

  return generateTextCode(x, y, w, h, annotation)
}

function generateTextCode(
  x: number, y: number, w: number, h: number,
  annotation: Annotation,
): string {
  const bg = annotation.style?.backgroundColor ?? 'rgba(0, 0, 0, 0.75)'
  const color = annotation.style?.color ?? '#ffffff'
  const fontSize = annotation.style?.fontSize ?? 16
  const fontWeight = annotation.style?.fontWeight ?? 'bold'
  const text = annotation.content ?? ''
  const padding = 8
  const radius = 6

  return `
    // Text annotation
    ctx.save();
    ctx.font = '${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif';
    const metrics = ctx.measureText(${JSON.stringify(text)});
    const textW = metrics.width + ${padding * 2};
    const textH = ${fontSize + padding * 2};
    const tx = ${x};
    const ty = ${y};

    // Background rounded rect
    ctx.fillStyle = '${bg}';
    ctx.beginPath();
    ctx.roundRect(tx, ty, Math.max(textW, ${w}), Math.max(textH, ${h}), ${radius});
    ctx.fill();

    // Text
    ctx.fillStyle = '${color}';
    ctx.textBaseline = 'middle';
    ctx.fillText(${JSON.stringify(text)}, tx + ${padding}, ty + Math.max(textH, ${h}) / 2);
    ctx.restore();
  `
}

function generateArrowCode(
  x: number, y: number, w: number, h: number,
  arrow: NonNullable<Annotation['arrow']>,
): string {
  const color = arrow.color ?? '#ff4444'
  const strokeWidth = arrow.strokeWidth ?? 3
  const pathData = ARROW_PATHS[arrow.direction] ?? ARROW_PATHS['up']

  // Parse the SVG-like path and scale to the annotation dimensions
  return `
    // Arrow annotation
    ctx.save();
    ctx.strokeStyle = '${color}';
    ctx.lineWidth = ${strokeWidth};
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ${parseSvgPathToCanvas(pathData, x, y, w, h)}
    ctx.stroke();
    ctx.restore();
  `
}

/**
 * Convert a simple SVG path string (M/L commands with normalized 0-1 coords)
 * to Canvas2D moveTo/lineTo calls scaled to the given rectangle.
 */
function parseSvgPathToCanvas(
  path: string,
  x: number, y: number, w: number, h: number,
): string {
  const commands: string[] = []
  const parts = path.split(/(?=[ML])/).filter(Boolean)

  for (const part of parts) {
    const cmd = part[0]
    const coords = part.slice(1).trim().split(/\s+/).map(Number)
    if (coords.length < 2) continue

    const px = x + coords[0] * w
    const py = y + coords[1] * h

    if (cmd === 'M') {
      commands.push(`ctx.moveTo(${px.toFixed(1)}, ${py.toFixed(1)});`)
    } else if (cmd === 'L') {
      commands.push(`ctx.lineTo(${px.toFixed(1)}, ${py.toFixed(1)});`)
    }
  }

  return commands.join('\n    ')
}

// ── Annotation filtering ────────────────────────────────────────────────────

/**
 * Filter annotations that are visible at a given time.
 */
export function getVisibleAnnotations(
  annotations: Annotation[],
  timeMs: number,
): Annotation[] {
  return annotations
    .filter(a => timeMs >= a.startMs && timeMs <= a.endMs)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
}

/**
 * Generate the complete draw code for all visible annotations at a given time.
 */
export function generateAnnotationsDrawCode(
  annotations: Annotation[],
  timeMs: number,
  viewportWidth: number,
  viewportHeight: number,
): string {
  const visible = getVisibleAnnotations(annotations, timeMs)
  if (visible.length === 0) return ''
  return visible
    .map(a => generateAnnotationDrawCode(a, viewportWidth, viewportHeight))
    .join('\n')
}
