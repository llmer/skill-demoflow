import type { Page } from '@playwright/test';
import type { RecordingSession } from './browser.js';
import type { ZoomDepth, PlaybackSpeed, ArrowDirection } from './types.js';
/** Step-level zoom directive. 'auto' zooms to the interacted element. */
type ZoomDirective = ZoomDepth | 'auto';
/** Step-level annotation directive. */
interface StepAnnotation {
    text?: string;
    arrow?: ArrowDirection;
    position?: 'above' | 'below' | 'left' | 'right' | {
        x: number;
        y: number;
    };
    style?: {
        color?: string;
        backgroundColor?: string;
        fontSize?: number;
        fontWeight?: 'normal' | 'bold';
    };
}
export type Step = {
    action: 'navigate';
    url: string;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    description?: string;
    zoom?: ZoomDirective;
    speed?: PlaybackSpeed;
    annotation?: StepAnnotation;
} | {
    action: 'click';
    target: string;
    description?: string;
    zoom?: ZoomDirective;
    speed?: PlaybackSpeed;
    annotation?: StepAnnotation;
} | {
    action: 'fill';
    target: string;
    value: string;
    clear?: boolean;
    description?: string;
    zoom?: ZoomDirective;
    speed?: PlaybackSpeed;
    annotation?: StepAnnotation;
} | {
    action: 'select';
    target: string;
    value: string;
    description?: string;
    zoom?: ZoomDirective;
    speed?: PlaybackSpeed;
    annotation?: StepAnnotation;
} | {
    action: 'press';
    key: string;
    description?: string;
    zoom?: ZoomDirective;
    speed?: PlaybackSpeed;
    annotation?: StepAnnotation;
} | {
    action: 'wait';
    ms?: number;
    for?: string;
    description?: string;
    speed?: PlaybackSpeed;
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
export {};
//# sourceMappingURL=runner.d.ts.map