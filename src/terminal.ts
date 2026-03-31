/**
 * Terminal recording module — parallel to browser.ts.
 *
 * Launches xterm.js in Playwright connected to a real PTY via node-pty,
 * then records the terminal session as video using the existing pipeline.
 */

import { chromium } from '@playwright/test'
import { createServer, type Server } from 'http'
import { mkdirSync } from 'fs'
import { WebSocketServer, type WebSocket } from 'ws'
import { generateTerminalHtml, type TerminalTheme } from './terminal-page.js'
import type { RecordingSession } from './browser.js'
import type { DesktopFrameOptions } from './frame.js'

// node-pty is an optional peer dependency — import dynamically
import type { IPty } from 'node-pty'

type NodePtyModule = typeof import('node-pty')

async function loadNodePty(): Promise<NodePtyModule> {
  try {
    return await import('node-pty')
  } catch {
    throw new Error(
      'node-pty is required for terminal recording but not installed.\n' +
      'Install it with: npm install node-pty',
    )
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TerminalRecordingOptions {
  /** Output directory for video, screenshots. Created if missing. */
  outputDir: string
  /** Terminal canvas pixel size. Default: 960x600 */
  viewport?: { width: number; height: number }
  /** Run headed (default true). */
  headed?: boolean
  /** Wrap video in a desktop frame. Default: true (macOS-terminal style). Pass false to disable. */
  desktopFrame?: boolean | DesktopFrameOptions
  /** Path to scenario file — stored in manifest for cache invalidation. */
  scenarioPath?: string
  /** Path to target file — stored in manifest for cache invalidation. */
  targetPath?: string
  /** Shell to use. Default: user's SHELL env or '/bin/zsh'. */
  shell?: string
  /** Working directory for the PTY. Default: process.cwd() */
  cwd?: string
  /** Extra environment variables for the PTY. */
  env?: Record<string, string>
  /** xterm.js color theme. Pass a name ('dark-plus', 'dracula', 'monokai') or a theme object. */
  theme?: TerminalTheme | string
  /** Font size in px. Default: 14. */
  fontSize?: number
  /** Font family. Default: 'Menlo, Monaco, "Courier New", monospace'. */
  fontFamily?: string
  /** Typing speed in ms per character. Default: 50. */
  typingSpeed?: number
}

export interface TerminalSession extends RecordingSession {
  /** Type text character-by-character with visual delay. */
  type(text: string, opts?: { delay?: number }): Promise<void>
  /** Send a keystroke (Enter, Tab, Ctrl+C, etc.). */
  press(key: string): Promise<void>
  /** Type a command, press Enter, and wait for the prompt to return. */
  exec(command: string, opts?: { timeout?: number }): Promise<void>
  /** Wait for text matching a pattern to appear in the terminal buffer. */
  waitForOutput(pattern: string | RegExp, opts?: { timeout?: number }): Promise<void>
  /** Wait for the shell prompt to return (command finished). */
  waitForPrompt(opts?: { timeout?: number }): Promise<void>
  /** Clear the terminal screen. */
  clear(): Promise<void>

  /** @internal typing speed in ms per character */
  _typingSpeed: number
  /** @internal node-pty process */
  _pty: IPty
  /** @internal HTTP server */
  _server: Server
  /** @internal WebSocket connection to xterm.js */
  _ws: WebSocket | null
  /** @internal prompt marker for detection */
  _promptMarker: string
  /** @internal cleanup function — called before finalize */
  _cleanup: () => Promise<void>
}

// Unique marker injected into PS1 for reliable prompt detection
const PROMPT_MARKER = '\x1b]7;DEMOFLOW_PROMPT\x07'

// ── Key mapping ──────────────────────────────────────────────────────────────

const KEY_MAP: Record<string, string> = {
  'Enter': '\r',
  'Tab': '\t',
  'Escape': '\x1b',
  'Backspace': '\x7f',
  'Space': ' ',
  'Up': '\x1b[A',
  'Down': '\x1b[B',
  'Right': '\x1b[C',
  'Left': '\x1b[D',
  'Home': '\x1b[H',
  'End': '\x1b[F',
  'Delete': '\x1b[3~',
  'PageUp': '\x1b[5~',
  'PageDown': '\x1b[6~',
}

function resolveKey(key: string): string {
  // Handle Ctrl+<char>
  const ctrlMatch = key.match(/^Ctrl\+(.)/i)
  if (ctrlMatch) {
    const char = ctrlMatch[1].toUpperCase()
    return String.fromCharCode(char.charCodeAt(0) - 64)
  }
  return KEY_MAP[key] ?? key
}

// ── Sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Launch ───────────────────────────────────────────────────────────────────

/**
 * Launch a terminal session with Playwright recording.
 * Starts xterm.js in a browser, connected to a real PTY via node-pty + WebSocket.
 */
export async function launchTerminal(
  options: TerminalRecordingOptions,
): Promise<TerminalSession> {
  const nodePty = await loadNodePty()

  const {
    outputDir,
    viewport = { width: 960, height: 600 },
    headed = true,
    desktopFrame = true,
    scenarioPath,
    targetPath,
    shell = process.env.SHELL || '/bin/zsh',
    cwd = process.cwd(),
    env: extraEnv = {},
    theme,
    fontSize = 14,
    fontFamily,
    typingSpeed = 50,
  } = options

  const frameOptions: DesktopFrameOptions | null =
    desktopFrame === false ? null :
    desktopFrame === true ? { style: 'macos-terminal' } :
    desktopFrame

  mkdirSync(outputDir, { recursive: true })

  // ── Start HTTP + WebSocket server ──────────────────────────────────────

  let ptyProcess: IPty | null = null
  let activeWs: WebSocket | null = null

  const wss = new WebSocketServer({ noServer: true })
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(generateTerminalHtml({
      fontSize,
      fontFamily,
      theme,
      wsPort: (server.address() as { port: number }).port,
    }))
  })

  server.on('upgrade', (_req, socket, head) => {
    wss.handleUpgrade(_req, socket, head, (ws) => {
      wss.emit('connection', ws, _req)
    })
  })

  // PTY environment — inject prompt marker
  const ptyEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...extraEnv,
    TERM: 'xterm-256color',
    DEMOFLOW_PROMPT_MARKER: '1',
  }

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const serverPort = (server.address() as { port: number }).port

  // Handle WebSocket connections — bridge to PTY
  wss.on('connection', (ws) => {
    activeWs = ws

    // Spawn PTY on first WebSocket connection
    if (!ptyProcess) {
      ptyProcess = nodePty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 35,
        cwd,
        env: ptyEnv,
      })

      ptyProcess.onData((data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data)
        }
      })
    }

    ws.on('message', (msg) => {
      const str = msg.toString()
      // Handle resize messages from xterm.js
      try {
        const parsed = JSON.parse(str)
        if (parsed.type === 'resize' && ptyProcess) {
          ptyProcess.resize(parsed.cols, parsed.rows)
          return
        }
      } catch {
        // Not JSON, treat as terminal input
      }
      if (ptyProcess) {
        ptyProcess.write(str)
      }
    })

    ws.on('close', () => {
      activeWs = null
    })
  })

  // ── Launch Playwright ──────────────────────────────────────────────────

  const browser = await chromium.launch({ headless: !headed })

  const context = await browser.newContext({
    recordVideo: {
      dir: outputDir,
      size: viewport,
    },
    viewport,
  })

  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${serverPort}`)

  // Wait for xterm.js to initialize and connect
  await page.waitForFunction(() => typeof (window as any).__demoflow_getBuffer === 'function', null, { timeout: 10000 })
  // Give xterm.js a moment to render the initial prompt
  await sleep(500)

  // ── Build session ──────────────────────────────────────────────────────

  const session: TerminalSession = {
    browser,
    context,
    page,
    outputDir,
    _startTime: Date.now(),
    _pauses: [],
    _pauseStart: null,
    _frameOptions: frameOptions,
    _viewport: viewport,
    _scenarioPath: scenarioPath,
    _targetPath: targetPath,
    _elementHits: [],
    _zoomRegions: [],
    _speedRegions: [],
    _annotations: [],
    _effects: {},
    _typingSpeed: typingSpeed,
    _pty: null as any, // set below after PTY is confirmed
    _server: server,
    _ws: activeWs,
    _promptMarker: PROMPT_MARKER,

    async type(text: string, opts?: { delay?: number }) {
      const delay = opts?.delay ?? session._typingSpeed
      for (const char of text) {
        if (ptyProcess) ptyProcess.write(char)
        await sleep(delay)
      }
    },

    async press(key: string) {
      if (ptyProcess) ptyProcess.write(resolveKey(key))
      await sleep(50)
    },

    async exec(command: string, opts?: { timeout?: number }) {
      await session.type(command)
      await sleep(100)
      await session.press('Enter')
      await session.waitForPrompt(opts)
    },

    async waitForOutput(pattern: string | RegExp, opts?: { timeout?: number }) {
      const timeout = opts?.timeout ?? 30000
      const regex = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern)) : pattern
      const start = Date.now()

      while (Date.now() - start < timeout) {
        const buffer = await page.evaluate(() => (window as any).__demoflow_getBuffer())
        if (regex.test(buffer)) return
        await sleep(250)
      }

      throw new Error(`waitForOutput timed out after ${timeout}ms waiting for: ${pattern}`)
    },

    async waitForPrompt(opts?: { timeout?: number }) {
      const timeout = opts?.timeout ?? 30000
      const start = Date.now()

      // Wait for new prompt by detecting when buffer ends with common prompt characters
      // or the DEMOFLOW_PROMPT marker if PS1 was configured
      await sleep(500) // let command start executing

      while (Date.now() - start < timeout) {
        const buffer: string = await page.evaluate(() => (window as any).__demoflow_getBuffer())
        const lines = buffer.split('\n').filter((l: string) => l.trim())
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1].trim()
          // Check for common prompt patterns
          if (
            lastLine.endsWith('$ ') ||
            lastLine.endsWith('% ') ||
            lastLine.endsWith('> ') ||
            lastLine.endsWith('# ') ||
            lastLine.match(/[\$%#>]\s*$/) ||
            buffer.includes('DEMOFLOW_PROMPT')
          ) {
            return
          }
        }
        await sleep(250)
      }

      throw new Error(`waitForPrompt timed out after ${timeout}ms`)
    },

    async clear() {
      if (ptyProcess) ptyProcess.write('clear\r')
      await sleep(300)
    },

    async _cleanup() {
      if (ptyProcess) {
        try { ptyProcess.kill() } catch { /* already dead */ }
      }
      wss.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }

  // PTY should exist by now (WebSocket connection triggers spawn)
  // Wait a beat for the connection to establish
  if (!ptyProcess) {
    await sleep(1000)
  }
  session._pty = ptyProcess!

  return session
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
