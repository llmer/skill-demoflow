import type { RecordingSession } from './browser.js';
export interface RequestInputOptions {
    /** Recording session — if provided, video is automatically paused while waiting */
    session?: RecordingSession;
    /** Timeout in ms (default 300000) */
    timeoutMs?: number;
}
/**
 * Request input from an external source (e.g. a Claude Code skill asking the user).
 *
 * Writes a signal file and polls for a response file.
 * The caller on the other end should call `provideInput()` or write directly
 * to `{outputDir}/.input-value`.
 *
 * If a recording session is provided, the video is automatically paused while
 * waiting and resumed when input arrives, so idle time is trimmed from the final video.
 */
export declare function requestInput(outputDir: string, message: string, optionsOrTimeout?: RequestInputOptions | number): Promise<string>;
/**
 * Provide input to a waiting script.
 * Call this from the skill/CLI side after getting the value from the user.
 */
export declare function provideInput(outputDir: string, value: string): void;
/**
 * Check if a script is waiting for input. Returns the prompt message or null.
 */
export declare function checkWaiting(outputDir: string): string | null;
//# sourceMappingURL=prompt.d.ts.map