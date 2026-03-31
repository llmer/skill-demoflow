import type { Page, Locator } from '@playwright/test'
import { join } from 'path'
import type { RecordingSession } from './browser.js'
import { pauseRecording, resumeRecording } from './browser.js'
import { requestInput } from './prompt.js'
import type { ZoomDepth, PlaybackSpeed, ArrowDirection, SpeedRegion, Annotation } from './types.js'

// ── Step types ──────────────────────────────────────────────────────────────

/** Step-level zoom directive. 'auto' zooms to the interacted element. */
type ZoomDirective = ZoomDepth | 'auto'

/** Step-level annotation directive. */
interface StepAnnotation {
  text?: string
  arrow?: ArrowDirection
  position?: 'above' | 'below' | 'left' | 'right' | { x: number; y: number }
  style?: { color?: string; backgroundColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold' }
}

export type Step =
  | { action: 'navigate'; url: string; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; description?: string; zoom?: ZoomDirective; speed?: PlaybackSpeed; annotation?: StepAnnotation }
  | { action: 'click'; target: string; description?: string; zoom?: ZoomDirective; speed?: PlaybackSpeed; annotation?: StepAnnotation }
  | { action: 'fill'; target: string; value: string; clear?: boolean; description?: string; zoom?: ZoomDirective; speed?: PlaybackSpeed; annotation?: StepAnnotation }
  | { action: 'select'; target: string; value: string; description?: string; zoom?: ZoomDirective; speed?: PlaybackSpeed; annotation?: StepAnnotation }
  | { action: 'press'; key: string; description?: string; zoom?: ZoomDirective; speed?: PlaybackSpeed; annotation?: StepAnnotation }
  | { action: 'wait'; ms?: number; for?: string; description?: string; speed?: PlaybackSpeed }
  | { action: 'assert'; target: string; state?: 'visible' | 'hidden' | 'attached'; description?: string }
  | { action: 'screenshot'; name: string; description?: string }
  | { action: 'save'; name: string; from: 'url' | 'text' | 'value'; target?: string; pattern?: string; description?: string }
  | { action: 'input'; message: string; saveAs?: string; description?: string }
  | { action: 'pause'; description?: string }
  | { action: 'resume'; description?: string }
  | { action: 'exec'; fn: (ctx: StepContext) => Promise<void>; description?: string }

export interface StepContext {
  page: Page
  session: RecordingSession
  vars: Record<string, string>
  outputDir: string
}

export interface RunOptions {
  /** Delay in ms between steps for video readability. Default: 500 */
  actionDelay?: number
  /** Timeout in ms for element resolution. Default: 30000 */
  actionTimeout?: number
  /** Take a screenshot when a step fails. Default: true */
  screenshotOnError?: boolean
  /** Progress callback */
  onStep?: (index: number, step: Step, status: 'start' | 'done' | 'error') => void
}

// ── Target resolution ───────────────────────────────────────────────────────

const ROLE_TYPES = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'option', 'textbox', 'combobox', 'switch'] as const

/**
 * Parse a prefixed target string (e.g. "label:Email") or fall back to
 * smart text-based resolution that tries multiple Playwright strategies.
 */
async function resolveTarget(page: Page, target: string, timeout: number): Promise<Locator> {
  // Prefixed selectors — explicit and fast
  if (target.startsWith('label:')) return page.getByLabel(target.slice(6)).first()
  if (target.startsWith('placeholder:')) return page.getByPlaceholder(target.slice(12)).first()
  if (target.startsWith('testid:')) return page.getByTestId(target.slice(7)).first()
  if (target.startsWith('css:')) return page.locator(target.slice(4)).first()
  if (target.startsWith('text:')) return page.getByText(target.slice(5)).first()

  // role:button[Name] — explicit role + name
  const roleMatch = target.match(/^role:(\w+)\[(.+)]$/)
  if (roleMatch) {
    return page.getByRole(roleMatch[1] as any, { name: roleMatch[2] }).first()
  }

  // Unprefixed text — try strategies in priority order, return first visible match.
  // Use a short probe timeout so we don't stall on misses.
  const probe = Math.min(2000, Math.floor(timeout / 5))

  // 1. Role-based (buttons, links, etc.) — most reliable for interactive elements
  for (const role of ROLE_TYPES) {
    const loc = page.getByRole(role, { name: target })
    if (await isVisible(loc, probe)) return loc.first()
  }

  // 2. Exact text match
  const exactText = page.getByText(target, { exact: true })
  if (await isVisible(exactText, probe)) return exactText.first()

  // 3. Substring text match
  const subText = page.getByText(target)
  if (await isVisible(subText, probe)) return subText.first()

  // 4. Label match (useful for inputs near labels)
  const labelLoc = page.getByLabel(target)
  if (await isVisible(labelLoc, probe)) return labelLoc.first()

  // 5. Placeholder match
  const placeholderLoc = page.getByPlaceholder(target)
  if (await isVisible(placeholderLoc, probe)) return placeholderLoc.first()

  // Nothing found quickly — fall back to getByText with the full timeout.
  // This gives the page time to render if content is still loading.
  return page.getByText(target).first()
}

async function isVisible(locator: Locator, timeout: number): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

// ── Variable interpolation ──────────────────────────────────────────────────

function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\$\{(\w+)}/g, (_, name) => vars[name] ?? `\${${name}}`)
}

function interpolateStep(step: Step, vars: Record<string, string>): Step {
  const result = { ...step } as any
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string' && key !== 'action') {
      result[key] = interpolate(result[key], vars)
    }
  }
  return result as Step
}

// ── Step execution ──────────────────────────────────────────────────────────

async function executeStep(ctx: StepContext, raw: Step, opts: RunOptions): Promise<void> {
  const step = interpolateStep(raw, ctx.vars)
  const { page, session, outputDir } = ctx
  const timeout = opts.actionTimeout ?? 30_000

  switch (step.action) {
    case 'navigate': {
      await page.goto(step.url, { waitUntil: step.waitUntil ?? 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      break
    }

    case 'click': {
      const loc = await resolveTarget(page, step.target, timeout)
      await captureElementHit(ctx, loc, step)
      await loc.click({ timeout })
      break
    }

    case 'fill': {
      const loc = await resolveTarget(page, step.target, timeout)
      await captureElementHit(ctx, loc, step)
      if (step.clear !== false) await loc.clear().catch(() => {})
      await loc.fill(step.value)
      break
    }

    case 'select': {
      const loc = await resolveTarget(page, step.target, timeout)
      await captureElementHit(ctx, loc, step)
      await loc.selectOption(step.value)
      break
    }

    case 'press': {
      await page.keyboard.press(step.key)
      break
    }

    case 'wait': {
      if (step.ms) {
        await new Promise((r) => setTimeout(r, step.ms))
      } else if (step.for) {
        const target = interpolate(step.for, ctx.vars)
        if (target.startsWith('http') || target.startsWith('**/') || target.startsWith('*/')) {
          await page.waitForURL(target, { timeout })
        } else {
          // Wait for text or element to appear
          const loc = await resolveTarget(page, target, timeout)
          await loc.waitFor({ state: 'visible', timeout })
        }
      }
      break
    }

    case 'assert': {
      const loc = await resolveTarget(page, step.target, timeout)
      await loc.waitFor({ state: step.state ?? 'visible', timeout })
      break
    }

    case 'screenshot': {
      await page.screenshot({ path: join(outputDir, `${step.name}.png`) })
      break
    }

    case 'save': {
      if (step.from === 'url') {
        const url = page.url()
        ctx.vars[step.name] = step.pattern ? (url.match(new RegExp(step.pattern))?.[1] ?? url) : url
      } else if (step.from === 'text' && step.target) {
        const loc = await resolveTarget(page, step.target, timeout)
        const text = await loc.textContent() ?? ''
        ctx.vars[step.name] = step.pattern ? (text.match(new RegExp(step.pattern))?.[1] ?? text) : text
      } else if (step.from === 'value' && step.target) {
        const loc = await resolveTarget(page, step.target, timeout)
        const val = await loc.inputValue()
        ctx.vars[step.name] = step.pattern ? (val.match(new RegExp(step.pattern))?.[1] ?? val) : val
      }
      break
    }

    case 'input': {
      const value = await requestInput(outputDir, step.message, { session })
      if (step.saveAs) ctx.vars[step.saveAs] = value
      break
    }

    case 'pause': {
      pauseRecording(session)
      break
    }

    case 'resume': {
      resumeRecording(session)
      break
    }

    case 'exec': {
      await step.fn(ctx)
      break
    }
  }
}

// ── Annotation position resolution ─────────────────────────────────────────

function resolveAnnotationPosition(
  ann: StepAnnotation,
  lastHit: { bbox: { x: number; y: number; width: number; height: number } } | undefined,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  // Explicit coordinates
  if (ann.position && typeof ann.position === 'object' && 'x' in ann.position) {
    return { x: ann.position.x, y: ann.position.y }
  }

  // Position relative to last interacted element
  if (lastHit) {
    const elCx = (lastHit.bbox.x + lastHit.bbox.width / 2) / viewport.width
    const elCy = (lastHit.bbox.y + lastHit.bbox.height / 2) / viewport.height
    const offset = 0.06 // 6% of viewport

    switch (ann.position) {
      case 'above': return { x: elCx - 0.075, y: elCy - offset - 0.04 }
      case 'below': return { x: elCx - 0.075, y: elCy + offset }
      case 'left':  return { x: elCx - offset - 0.15, y: elCy - 0.02 }
      case 'right': return { x: elCx + offset, y: elCy - 0.02 }
    }
  }

  // Fallback: center
  return { x: 0.4, y: 0.4 }
}

// ── Element hit capture ────────────────────────────────────────────────────

/**
 * Capture the bounding box of an interacted element for auto-zoom.
 * Records the element's position and time relative to recording start.
 */
async function captureElementHit(
  ctx: StepContext,
  locator: Locator,
  step: Step,
): Promise<void> {
  try {
    const bbox = await locator.boundingBox()
    if (!bbox) return
    const timeMs = Date.now() - ctx.session._startTime
    const stepIndex = ctx.session._elementHits.length
    ctx.session._elementHits.push({
      stepIndex,
      timeMs,
      selector: 'target' in step ? (step as any).target : '',
      bbox,
    })
  } catch {
    // Element may not be visible or page navigated
  }
}

// ── Main runner ─────────────────────────────────────────────────────────────

/**
 * Execute an array of declarative steps against a recording session.
 *
 * Handles selector resolution, waits, inter-step delays, error screenshots,
 * and variable interpolation so the generated script only needs to declare
 * what should happen — not how.
 */
export async function runSteps(
  session: RecordingSession,
  steps: Step[],
  options: RunOptions = {},
): Promise<{ vars: Record<string, string> }> {
  const delay = options.actionDelay ?? 500
  const ctx: StepContext = {
    page: session.page,
    session,
    vars: {},
    outputDir: session.outputDir,
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    options.onStep?.(i, step, 'start')

    const stepStartMs = Date.now() - session._startTime

    try {
      await executeStep(ctx, step, options)
      options.onStep?.(i, step, 'done')
    } catch (err) {
      options.onStep?.(i, step, 'error')

      if (options.screenshotOnError !== false) {
        try {
          await session.page.screenshot({
            path: join(session.outputDir, `error-step-${i + 1}.png`),
          })
        } catch {
          // Page may already be closed
        }
      }

      const label = step.description ?? describeStep(step)
      const wrapped = new Error(`Step ${i + 1} failed (${label}): ${(err as Error).message}`)
      ;(wrapped as any).cause = err
      throw wrapped
    }

    // Inter-step delay for video readability (skip for non-visual steps)
    if (delay > 0 && !['pause', 'resume', 'save', 'exec'].includes(step.action)) {
      await new Promise((r) => setTimeout(r, delay))
    }

    const stepEndMs = Date.now() - session._startTime

    // Capture speed region if the step has a speed directive
    if ('speed' in step && step.speed && step.speed !== 1) {
      session._speedRegions.push({
        id: `speed-step-${i}`,
        startMs: stepStartMs,
        endMs: stepEndMs,
        speed: step.speed,
      })
    }

    // Capture annotation if the step has an annotation directive
    if ('annotation' in step && step.annotation) {
      const ann = step.annotation as StepAnnotation
      const lastHit = session._elementHits[session._elementHits.length - 1]
      const position = resolveAnnotationPosition(ann, lastHit, session._viewport)

      const annotation: Annotation = {
        id: `ann-step-${i}`,
        startMs: stepStartMs,
        endMs: stepEndMs + 500, // hold annotation 500ms after step completes
        type: ann.arrow ? 'arrow' : 'text',
        ...(ann.text ? { content: ann.text } : {}),
        position: { x: position.x, y: position.y },
        size: { width: ann.arrow ? 0.05 : 0.15, height: ann.arrow ? 0.08 : 0.04 },
        ...(ann.style ? { style: ann.style } : {}),
        ...(ann.arrow ? { arrow: { direction: ann.arrow, ...(ann.style?.color ? { color: ann.style.color } : {}) } } : {}),
      }
      session._annotations.push(annotation)
    }
  }

  return { vars: ctx.vars }
}

function describeStep(step: Step): string {
  switch (step.action) {
    case 'navigate': return `navigate to ${step.url}`
    case 'click': return `click "${step.target}"`
    case 'fill': return `fill "${step.target}"`
    case 'select': return `select "${step.value}" in "${step.target}"`
    case 'press': return `press ${step.key}`
    case 'wait': return step.for ? `wait for "${step.for}"` : `wait ${step.ms}ms`
    case 'assert': return `assert "${step.target}" is ${step.state ?? 'visible'}`
    case 'screenshot': return `screenshot "${step.name}"`
    case 'save': return `save ${step.name} from ${step.from}`
    case 'input': return `input: "${step.message}"`
    case 'pause': return 'pause recording'
    case 'resume': return 'resume recording'
    case 'exec': return step.description ?? 'exec'
  }
}
