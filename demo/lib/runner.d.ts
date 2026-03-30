import type { Page } from '@playwright/test';
import type { RecordingSession } from './browser.js';
export type Step = {
    action: 'navigate';
    url: string;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    description?: string;
} | {
    action: 'click';
    target: string;
    description?: string;
} | {
    action: 'fill';
    target: string;
    value: string;
    clear?: boolean;
    description?: string;
} | {
    action: 'select';
    target: string;
    value: string;
    description?: string;
} | {
    action: 'press';
    key: string;
    description?: string;
} | {
    action: 'wait';
    ms?: number;
    for?: string;
    description?: string;
} | {
    action: 'assert';
    target: string;
    state?: 'visible' | 'hidden' | 'attached';
    description?: string;
} | {
    action: 'screenshot';
    name: string;
    description?: string;
} | {
    action: 'save';
    name: string;
    from: 'url' | 'text' | 'value';
    target?: string;
    pattern?: string;
    description?: string;
} | {
    action: 'input';
    message: string;
    saveAs?: string;
    description?: string;
} | {
    action: 'pause';
    description?: string;
} | {
    action: 'resume';
    description?: string;
} | {
    action: 'exec';
    fn: (ctx: StepContext) => Promise<void>;
    description?: string;
};
export interface StepContext {
    page: Page;
    session: RecordingSession;
    vars: Record<string, string>;
    outputDir: string;
}
export interface RunOptions {
    /** Delay in ms between steps for video readability. Default: 500 */
    actionDelay?: number;
    /** Timeout in ms for element resolution. Default: 30000 */
    actionTimeout?: number;
    /** Take a screenshot when a step fails. Default: true */
    screenshotOnError?: boolean;
    /** Progress callback */
    onStep?: (index: number, step: Step, status: 'start' | 'done' | 'error') => void;
}
/**
 * Execute an array of declarative steps against a recording session.
 *
 * Handles selector resolution, waits, inter-step delays, error screenshots,
 * and variable interpolation so the generated script only needs to declare
 * what should happen — not how.
 */
export declare function runSteps(session: RecordingSession, steps: Step[], options?: RunOptions): Promise<{
    vars: Record<string, string>;
}>;
//# sourceMappingURL=runner.d.ts.map