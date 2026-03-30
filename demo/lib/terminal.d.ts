/**
 * Terminal recording module — parallel to browser.ts.
 *
 * Launches xterm.js in Playwright connected to a real PTY via node-pty,
 * then records the terminal session as video using the existing pipeline.
 */
import { type Server } from 'http';
import { type WebSocket } from 'ws';
import { type TerminalTheme } from './terminal-page.js';
import type { RecordingSession } from './browser.js';
import type { DesktopFrameOptions } from './frame.js';
import type { IPty } from 'node-pty';
export interface TerminalRecordingOptions {
    /** Output directory for video, screenshots. Created if missing. */
    outputDir: string;
    /** Terminal canvas pixel size. Default: 960x600 */
    viewport?: {
        width: number;
        height: number;
    };
    /** Run headed (default true). */
    headed?: boolean;
    /** Wrap video in a desktop frame. Default: true (macOS-terminal style). Pass false to disable. */
    desktopFrame?: boolean | DesktopFrameOptions;
    /** Path to scenario file — stored in manifest for cache invalidation. */
    scenarioPath?: string;
    /** Path to target file — stored in manifest for cache invalidation. */
    targetPath?: string;
    /** Shell to use. Default: user's SHELL env or '/bin/zsh'. */
    shell?: string;
    /** Working directory for the PTY. Default: process.cwd() */
    cwd?: string;
    /** Extra environment variables for the PTY. */
    env?: Record<string, string>;
    /** xterm.js color theme. Pass a name ('dark-plus', 'dracula', 'monokai') or a theme object. */
    theme?: TerminalTheme | string;
    /** Font size in px. Default: 14. */
    fontSize?: number;
    /** Font family. Default: 'Menlo, Monaco, "Courier New", monospace'. */
    fontFamily?: string;
    /** Typing speed in ms per character. Default: 50. */
    typingSpeed?: number;
}
export interface TerminalSession extends RecordingSession {
    /** Type text character-by-character with visual delay. */
    type(text: string, opts?: {
        delay?: number;
    }): Promise<void>;
    /** Send a keystroke (Enter, Tab, Ctrl+C, etc.). */
    press(key: string): Promise<void>;
    /** Type a command, press Enter, and wait for the prompt to return. */
    exec(command: string, opts?: {
        timeout?: number;
    }): Promise<void>;
    /** Wait for text matching a pattern to appear in the terminal buffer. */
    waitForOutput(pattern: string | RegExp, opts?: {
        timeout?: number;
    }): Promise<void>;
    /** Wait for the shell prompt to return (command finished). */
    waitForPrompt(opts?: {
        timeout?: number;
    }): Promise<void>;
    /** Clear the terminal screen. */
    clear(): Promise<void>;
    /** @internal typing speed in ms per character */
    _typingSpeed: number;
    /** @internal node-pty process */
    _pty: IPty;
    /** @internal HTTP server */
    _server: Server;
    /** @internal WebSocket connection to xterm.js */
    _ws: WebSocket | null;
    /** @internal prompt marker for detection */
    _promptMarker: string;
    /** @internal cleanup function — called before finalize */
    _cleanup: () => Promise<void>;
}
/**
 * Launch a terminal session with Playwright recording.
 * Starts xterm.js in a browser, connected to a real PTY via node-pty + WebSocket.
 */
export declare function launchTerminal(options: TerminalRecordingOptions): Promise<TerminalSession>;
//# sourceMappingURL=terminal.d.ts.map