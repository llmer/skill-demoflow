/**
 * Generates the xterm.js HTML page served to Playwright for terminal recording.
 * Analogous to how frame.ts generates desktop frame HTML.
 */
export const TERMINAL_THEMES = {
    'dark-plus': {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#aeafad',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
    },
    'dracula': {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
    },
    'monokai': {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#f4bf75',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f9f8f5',
    },
};
const DEFAULT_THEME = TERMINAL_THEMES['dark-plus'];
function resolveTheme(theme) {
    if (!theme)
        return DEFAULT_THEME;
    if (typeof theme === 'string')
        return TERMINAL_THEMES[theme] ?? DEFAULT_THEME;
    return { ...DEFAULT_THEME, ...theme };
}
/**
 * Generate the full HTML page for the xterm.js terminal.
 * Loaded by Playwright, connects to WebSocket for PTY I/O.
 */
export function generateTerminalHtml(options) {
    const fontSize = options.fontSize ?? 14;
    const fontFamily = options.fontFamily ?? 'Menlo, Monaco, "Courier New", monospace';
    const theme = resolveTheme(options.theme);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/@xterm/xterm@5/css/xterm.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: ${theme.background ?? '#1e1e1e'}; }
  #terminal { width: 100%; height: 100%; }

  /* Keystroke visualization overlay */
  #keystroke-overlay {
    position: fixed;
    bottom: 16px;
    right: 16px;
    font-family: ${JSON.stringify(fontFamily)};
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.55);
    border-radius: 6px;
    padding: 4px 10px;
    pointer-events: none;
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.3s ease-out;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
</head>
<body>
<div id="terminal"></div>
<div id="keystroke-overlay"></div>

<script src="https://unpkg.com/@xterm/xterm@5/lib/xterm.js"></script>
<script src="https://unpkg.com/@xterm/addon-fit@0/lib/addon-fit.js"></script>
<script src="https://unpkg.com/@xterm/addon-webgl@0/lib/addon-webgl.js"></script>
<script>
(function() {
  const theme = ${JSON.stringify(theme)};
  const term = new Terminal({
    fontSize: ${fontSize},
    fontFamily: ${JSON.stringify(fontFamily)},
    theme: theme,
    cursorBlink: true,
    cursorStyle: 'block',
    allowProposedApi: true,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  try {
    const webglAddon = new WebglAddon.WebglAddon();
    term.loadAddon(webglAddon);
  } catch (e) {
    // WebGL not available, fall back to canvas renderer
  }

  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  // Connect to PTY via WebSocket
  const ws = new WebSocket('ws://localhost:${options.wsPort}');
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    // Send initial size
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  };

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      term.write(event.data);
    } else {
      term.write(new Uint8Array(event.data));
    }
  };

  ws.onclose = () => {
    term.write('\\r\\n[Session ended]');
  };

  term.onData((data) => {
    ws.send(data);
  });

  term.onResize(({ cols, rows }) => {
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  });

  window.addEventListener('resize', () => fitAddon.fit());

  // Expose terminal buffer for waitForOutput polling
  window.__demoflow_getBuffer = () => {
    const buf = term.buffer.active;
    const lines = [];
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\\n');
  };

  // Keystroke visualization
  const overlay = document.getElementById('keystroke-overlay');
  let clearTimer = null;
  let keyBuffer = '';

  function showKeystroke(text) {
    keyBuffer += text;
    overlay.textContent = keyBuffer;
    overlay.style.opacity = '1';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => { keyBuffer = ''; }, 300);
    }, 1500);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') showKeystroke('\u23CE');
    else if (e.key === 'Tab') showKeystroke('\u21E5');
    else if (e.key === 'Backspace') showKeystroke('\u232B');
    else if (e.key === 'Escape') showKeystroke('Esc');
    else if (e.ctrlKey && e.key.length === 1) showKeystroke('Ctrl+' + e.key.toUpperCase());
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) showKeystroke(e.key);
  }, true);
})();
</script>
</body>
</html>`;
}
//# sourceMappingURL=terminal-page.js.map