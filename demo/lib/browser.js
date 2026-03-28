import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { CLICK_VIS_SCRIPT, compositeWithFrame, convertToMp4, convertToMp4WithTrim } from './recorder.js';
import { renderFrame } from './frame.js';
/**
 * Launch a Chromium browser with full recording enabled:
 * - HAR capture (all network traffic)
 * - Video recording
 * - Click visualization (red dot on every click)
 */
export async function launchWithRecording(options) {
    const { outputDir, viewport = { width: 1280, height: 720 }, headed = true, slowMo = 100, ignoreHTTPSErrors = true, desktopFrame = true, } = options;
    const frameOptions = desktopFrame === false ? null :
        desktopFrame === true ? {} :
            desktopFrame;
    mkdirSync(outputDir, { recursive: true });
    const browser = await chromium.launch({
        headless: !headed,
        slowMo,
    });
    const context = await browser.newContext({
        recordHar: {
            path: join(outputDir, 'recording.har'),
            mode: 'full',
        },
        recordVideo: {
            dir: outputDir,
            size: viewport,
        },
        ignoreHTTPSErrors,
        viewport,
    });
    const page = await context.newPage();
    await page.addInitScript(CLICK_VIS_SCRIPT);
    return { browser, context, page, outputDir, _startTime: Date.now(), _pauses: [], _pauseStart: null, _frameOptions: frameOptions, _viewport: viewport };
}
/**
 * Mark the start of an idle period (e.g. waiting for user input).
 * The paused segment will be trimmed from the final video.
 */
export function pauseRecording(session) {
    if (session._pauseStart === null) {
        session._pauseStart = (Date.now() - session._startTime) / 1000;
    }
}
/**
 * Mark the end of an idle period. Recording resumes normally.
 */
export function resumeRecording(session) {
    if (session._pauseStart !== null) {
        session._pauses.push({
            start: session._pauseStart,
            end: (Date.now() - session._startTime) / 1000,
        });
        session._pauseStart = null;
    }
}
/**
 * Finalize recording: close browser, rename video, convert to mp4.
 * Must be called after the scenario completes (or on error).
 */
export async function finalize(session) {
    const { page, context, browser, outputDir } = session;
    // Capture page info before closing (needed for frame address bar)
    let pageUrl;
    let pageTitle;
    if (session._frameOptions) {
        try {
            pageUrl = page.url();
            pageTitle = await page.title();
        }
        catch {
            // Page may already be closed
        }
    }
    await page.close();
    await context.close();
    await browser.close();
    const harPath = join(outputDir, 'recording.har');
    let webmPath = null;
    let mp4Path = null;
    const webmFiles = readdirSync(outputDir).filter((f) => f.endsWith('.webm'));
    if (webmFiles.length > 0) {
        const originalWebm = join(outputDir, webmFiles[0]);
        webmPath = join(outputDir, 'recording.webm');
        renameSync(originalWebm, webmPath);
        mp4Path = join(outputDir, 'recording.mp4');
        try {
            if (session._pauses.length > 0) {
                convertToMp4WithTrim(webmPath, mp4Path, session._pauses);
            }
            else {
                convertToMp4(webmPath, mp4Path);
            }
        }
        catch {
            mp4Path = null;
        }
        // Desktop frame compositing
        if (mp4Path && session._frameOptions) {
            try {
                const frameOpts = {
                    ...session._frameOptions,
                    url: session._frameOptions.url ?? pageUrl,
                    title: session._frameOptions.title ?? pageTitle,
                };
                const frame = await renderFrame(outputDir, session._viewport, frameOpts);
                const framedPath = join(outputDir, 'recording-framed.mp4');
                compositeWithFrame(mp4Path, frame.pngPath, framedPath, frame.contentX, frame.contentY);
                // Replace original with framed version
                unlinkSync(mp4Path);
                renameSync(framedPath, mp4Path);
                unlinkSync(frame.pngPath);
            }
            catch {
                // Frame compositing failed — keep unframed MP4
            }
        }
    }
    return { harPath, mp4Path, webmPath };
}
//# sourceMappingURL=browser.js.map