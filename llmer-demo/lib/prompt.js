import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pauseRecording, resumeRecording } from './browser.js';
const WAITING_FILE = '.waiting-for-input';
const VALUE_FILE = '.input-value';
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
export async function requestInput(outputDir, message, optionsOrTimeout = 300_000) {
    const opts = typeof optionsOrTimeout === 'number'
        ? { timeoutMs: optionsOrTimeout }
        : optionsOrTimeout;
    const { session, timeoutMs = 300_000 } = opts;
    const waitingPath = join(outputDir, WAITING_FILE);
    const valuePath = join(outputDir, VALUE_FILE);
    // Clean up stale value file
    if (existsSync(valuePath))
        unlinkSync(valuePath);
    // Signal that we need input
    writeFileSync(waitingPath, message);
    if (session)
        pauseRecording(session);
    try {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (existsSync(valuePath)) {
                const value = readFileSync(valuePath, 'utf-8').trim();
                if (value.length > 0) {
                    if (existsSync(waitingPath))
                        unlinkSync(waitingPath);
                    if (existsSync(valuePath))
                        unlinkSync(valuePath);
                    return value;
                }
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        if (existsSync(waitingPath))
            unlinkSync(waitingPath);
        throw new Error(`Input not provided within ${timeoutMs / 1000}s`);
    }
    finally {
        if (session)
            resumeRecording(session);
    }
}
/**
 * Provide input to a waiting script.
 * Call this from the skill/CLI side after getting the value from the user.
 */
export function provideInput(outputDir, value) {
    writeFileSync(join(outputDir, VALUE_FILE), value);
}
/**
 * Check if a script is waiting for input. Returns the prompt message or null.
 */
export function checkWaiting(outputDir) {
    const waitingPath = join(outputDir, WAITING_FILE);
    if (existsSync(waitingPath)) {
        return readFileSync(waitingPath, 'utf-8').trim();
    }
    return null;
}
//# sourceMappingURL=prompt.js.map