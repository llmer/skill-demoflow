/**
 * Terminal recording module — parallel to browser.ts.
 *
 * Launches xterm.js in Playwright connected to a real PTY via node-pty,
 * then records the terminal session as video using the existing pipeline.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'http';
import { mkdirSync } from 'fs';
import { WebSocketServer } from 'ws';
import { generateTerminalHtml } from './terminal-page.js';
async function loadNodePty() {
    try {
        return await import('node-pty');
    }
    catch {
        throw new Error('node-pty is required for terminal recording but not installed.\n' +
            'Install it with: npm install node-pty');
    }
}
// Unique marker injected into PS1 for reliable prompt detection
const PROMPT_MARKER = '\x1b]7;DEMOFLOW_PROMPT\x07';
// ── Key mapping ──────────────────────────────────────────────────────────────
const KEY_MAP = {
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
};
function resolveKey(key) {
    // Handle Ctrl+<char>
    const ctrlMatch = key.match(/^Ctrl\+(.)/i);
    if (ctrlMatch) {
        const char = ctrlMatch[1].toUpperCase();
        return String.fromCharCode(char.charCodeAt(0) - 64);
    }
    return KEY_MAP[key] ?? key;
}
// ── Sleep helper ─────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ── Launch ───────────────────────────────────────────────────────────────────
/**
 * Launch a terminal session with Playwright recording.
 * Starts xterm.js in a browser, connected to a real PTY via node-pty + WebSocket.
 */
export async function launchTerminal(options) {
    const nodePty = await loadNodePty();
    const { outputDir, viewport = { width: 960, height: 600 }, headed = true, desktopFrame = true, scenarioPath, targetPath, shell = process.env.SHELL || '/bin/zsh', cwd = process.cwd(), env: extraEnv = {}, theme, fontSize = 14, fontFamily, typingSpeed = 50, } = options;
    const frameOptions = desktopFrame === false ? null :
        desktopFrame === true ? { style: 'macos-terminal' } :
            desktopFrame;
    mkdirSync(outputDir, { recursive: true });
    // ── Start HTTP + WebSocket server ──────────────────────────────────────
    let ptyProcess = null;
    let activeWs = null;
    const wss = new WebSocketServer({ noServer: true });
    const server = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateTerminalHtml({
            fontSize,
            fontFamily,
            theme,
            wsPort: server.address().port,
        }));
    });
    server.on('upgrade', (_req, socket, head) => {
        wss.handleUpgrade(_req, socket, head, (ws) => {
            wss.emit('connection', ws, _req);
        });
    });
    // PTY environment — inject prompt marker
    const ptyEnv = {
        ...process.env,
        ...extraEnv,
        TERM: 'xterm-256color',
        DEMOFLOW_PROMPT_MARKER: '1',
    };
    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const serverPort = server.address().port;
    // Handle WebSocket connections — bridge to PTY
    wss.on('connection', (ws) => {
        activeWs = ws;
        // Spawn PTY on first WebSocket connection
        if (!ptyProcess) {
            ptyProcess = nodePty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: 120,
                rows: 35,
                cwd,
                env: ptyEnv,
            });
            ptyProcess.onData((data) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(data);
                }
            });
        }
        ws.on('message', (msg) => {
            const str = msg.toString();
            // Handle resize messages from xterm.js
            try {
                const parsed = JSON.parse(str);
                if (parsed.type === 'resize' && ptyProcess) {
                    ptyProcess.resize(parsed.cols, parsed.rows);
                    return;
                }
            }
            catch {
                // Not JSON, treat as terminal input
            }
            if (ptyProcess) {
                ptyProcess.write(str);
            }
        });
        ws.on('close', () => {
            activeWs = null;
        });
    });
    // ── Launch Playwright ──────────────────────────────────────────────────
    const browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({
        recordVideo: {
            dir: outputDir,
            size: viewport,
        },
        viewport,
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${serverPort}`);
    // Wait for xterm.js to initialize and connect
    await page.waitForFunction(() => typeof window.__demoflow_getBuffer === 'function', null, { timeout: 10000 });
    // Give xterm.js a moment to render the initial prompt
    await sleep(500);
    // ── Build session ──────────────────────────────────────────────────────
    const session = {
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
        _pty: null, // set below after PTY is confirmed
        _server: server,
        _ws: activeWs,
        _promptMarker: PROMPT_MARKER,
        async type(text, opts) {
            const delay = opts?.delay ?? session._typingSpeed;
            for (const char of text) {
                if (ptyProcess)
                    ptyProcess.write(char);
                await sleep(delay);
            }
        },
        async press(key) {
            if (ptyProcess)
                ptyProcess.write(resolveKey(key));
            await sleep(50);
        },
        async exec(command, opts) {
            await session.type(command);
            await sleep(100);
            await session.press('Enter');
            await session.waitForPrompt(opts);
        },
        async waitForOutput(pattern, opts) {
            const timeout = opts?.timeout ?? 30000;
            const regex = typeof pattern === 'string' ? new RegExp(escapeRegExp(pattern)) : pattern;
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const buffer = await page.evaluate(() => window.__demoflow_getBuffer());
                if (regex.test(buffer))
                    return;
                await sleep(250);
            }
            throw new Error(`waitForOutput timed out after ${timeout}ms waiting for: ${pattern}`);
        },
        async waitForPrompt(opts) {
            const timeout = opts?.timeout ?? 30000;
            const start = Date.now();
            // Wait for new prompt by detecting when buffer ends with common prompt characters
            // or the DEMOFLOW_PROMPT marker if PS1 was configured
            await sleep(500); // let command start executing
            while (Date.now() - start < timeout) {
                const buffer = await page.evaluate(() => window.__demoflow_getBuffer());
                const lines = buffer.split('\n').filter((l) => l.trim());
                if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1].trim();
                    // Check for common prompt patterns
                    if (lastLine.endsWith('$ ') ||
                        lastLine.endsWith('% ') ||
                        lastLine.endsWith('> ') ||
                        lastLine.endsWith('# ') ||
                        lastLine.match(/[\$%#>]\s*$/) ||
                        buffer.includes('DEMOFLOW_PROMPT')) {
                        return;
                    }
                }
                await sleep(250);
            }
            throw new Error(`waitForPrompt timed out after ${timeout}ms`);
        },
        async clear() {
            if (ptyProcess)
                ptyProcess.write('clear\r');
            await sleep(300);
        },
        async _cleanup() {
            if (ptyProcess) {
                try {
                    ptyProcess.kill();
                }
                catch { /* already dead */ }
            }
            wss.close();
            await new Promise((resolve) => server.close(() => resolve()));
        },
    };
    // PTY should exist by now (WebSocket connection triggers spawn)
    // Wait a beat for the connection to establish
    if (!ptyProcess) {
        await sleep(1000);
    }
    session._pty = ptyProcess;
    return session;
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=terminal.js.map