/**
 * Generates the xterm.js HTML page served to Playwright for terminal recording.
 * Analogous to how frame.ts generates desktop frame HTML.
 */
export interface TerminalTheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
}
export declare const TERMINAL_THEMES: Record<string, TerminalTheme>;
export interface TerminalPageOptions {
    fontSize?: number;
    fontFamily?: string;
    theme?: TerminalTheme | string;
    wsPort: number;
}
/**
 * Generate the full HTML page for the xterm.js terminal.
 * Loaded by Playwright, connects to WebSocket for PTY I/O.
 */
export declare function generateTerminalHtml(options: TerminalPageOptions): string;
//# sourceMappingURL=terminal-page.d.ts.map