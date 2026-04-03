import { launchWithRecording, finalize, runSteps, isCaptureValid, render, type Step } from '../.claude/skills/demo/lib/index.js'
import { spawn } from 'child_process'

const STUDIO_PORT = 3274
const STUDIO_URL = `http://localhost:${STUDIO_PORT}`
const OUTPUT_DIR = 'output/full-workflow'
const SAMPLE_OUTPUT = 'output/sample-app'
const SCENARIO_PATH = '.demoflow/scenarios/full-workflow.md'
const TARGET_PATH = '.demoflow/targets/local.md'

// ── Phase 1: Create a sample recording ──────────────────────────────────────

async function createSampleRecording() {
  console.log('[phase 1] Creating sample recording...')
  const session = await launchWithRecording({
    outputDir: SAMPLE_OUTPUT,
    headed: true,
    slowMo: 80,
    desktopFrame: true,
    viewport: { width: 1280, height: 720 },
  })

  try {
    await runSteps(session, [
      { action: 'navigate', url: 'https://example.com' },
      { action: 'wait', ms: 2000 },
    ] as Step[], {
      onStep: (i, step, status) => console.log(`  [${status}] Step ${i + 1}: ${(step as any).description ?? (step as any).action}`),
    })
  } finally {
    const result = await finalize(session)
    console.log('[phase 1] Sample recording done:', result.mp4Path)
  }
}

// ── Studio server ───────────────────────────────────────────────────────────

function startStudioProcess(): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['-e', `import('./.claude/skills/demo/lib/studio.js').then(m => m.startStudio({ port: ${STUDIO_PORT}, outputDir: 'output' }))`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    })
    let started = false
    child.stdout!.on('data', (data: Buffer) => {
      const text = data.toString()
      process.stdout.write(text)
      if (!started && text.includes('localhost')) {
        started = true
        resolve(child)
      }
    })
    child.stderr!.on('data', (data: Buffer) => {
      const text = data.toString()
      process.stderr.write(text)
      if (!started && text.includes('EADDRINUSE')) {
        reject(new Error('Port already in use'))
      }
    })
    child.on('error', reject)
    setTimeout(() => { if (!started) { started = true; resolve(child) } }, 3000)
  })
}

// ── Phase 2: Record Studio interaction ──────────────────────────────────────

async function recordStudioWorkflow() {
  console.log('[phase 2] Starting Studio server...')
  const studioProcess = await startStudioProcess()
  await new Promise(r => setTimeout(r, 500))

  console.log('[phase 2] Recording Studio interaction...')
  const session = await launchWithRecording({
    outputDir: OUTPUT_DIR,
    headed: true,
    slowMo: 150,
    desktopFrame: true,
    viewport: { width: 1280, height: 720 },
    scenarioPath: SCENARIO_PATH,
    targetPath: TARGET_PATH,
  })

  const steps: Step[] = [
    { action: 'navigate', url: STUDIO_URL, description: 'Open DemoFlow Studio' },
    { action: 'wait', ms: 1500 },

    { action: 'assert', target: 'css:#recording-select', state: 'visible', description: 'Recording dropdown visible' },
    { action: 'wait', ms: 2000, description: 'Pause on macOS frame' },

    // Cycle through frame styles via the vertical style list
    { action: 'click', target: 'css:.style-option[data-style="windows-xp"]', description: 'Select Windows XP frame' },
    { action: 'wait', ms: 2500, description: 'Pause on XP frame' },

    { action: 'click', target: 'css:.style-option[data-style="windows-98"]', description: 'Select Windows 98 frame' },
    { action: 'wait', ms: 2500, description: 'Pause on 98 frame' },

    { action: 'click', target: 'css:.style-option[data-style="vscode"]', description: 'Select VS Code frame' },
    { action: 'wait', ms: 2500, description: 'Pause on VS Code frame' },

    { action: 'click', target: 'css:.style-option[data-style="macos-terminal"]', description: 'Select Terminal frame' },
    { action: 'wait', ms: 2500, description: 'Pause on Terminal frame' },

    { action: 'click', target: 'css:.style-option[data-style="ios"]', description: 'Select iPhone frame' },
    { action: 'wait', ms: 2500, description: 'Pause on iPhone frame' },

    { action: 'click', target: 'css:.style-option[data-style="macos"]', description: 'Back to macOS frame' },
    { action: 'wait', ms: 1500 },

    // Change window title
    { action: 'fill', target: 'css:#title-input', value: 'My App Demo', description: 'Set window title' },
    { action: 'wait', ms: 1000 },

    // Click amber Render button in topbar
    { action: 'click', target: 'Render MP4', description: 'Render to MP4' },

    // Wait for render to complete (status bar turns green)
    { action: 'exec', description: 'Wait for render to finish', fn: async (ctx) => {
      await ctx.page.waitForFunction(() => {
        const el = document.getElementById('status')
        return el && (el.classList.contains('success') || el.classList.contains('error'))
      }, null, { timeout: 120000 })
    }},

    { action: 'wait', ms: 3000, description: 'Show final result' },
  ]

  try {
    await runSteps(session, steps, {
      actionDelay: 300,
      actionTimeout: 120000,
      onStep: (i, step, status) => console.log(`  [${status}] Step ${i + 1}: ${(step as any).description ?? (step as any).action}`),
    })
  } finally {
    const result = await finalize(session, { pageTitle: 'DemoFlow Studio' })
    console.log('[phase 2] Studio recording done:', result.mp4Path)
    console.log('HAR:', result.harPath)
    studioProcess.kill()
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await createSampleRecording()
  await recordStudioWorkflow()
  console.log('\nDONE — Full workflow recorded.')
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
