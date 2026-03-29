import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { CLICK_VIS_SCRIPT, compositeWithFrame, convertToMp4, convertToMp4WithTrim } from './recorder.js';
import { renderFrame } from './frame.js';
import { getGitState, getLibHash, hashFile, readManifest, writeManifest } from './manifest.js';
/**
 * Re-render an existing capture to MP4 with optional frame compositing.
 * Reads viewport and pause data from the manifest (or uses defaults).
 * Does NOT require a browser session — works entirely from the WebM on disk.
 */
export async function render(outputDir, options = {}) {
    const manifest = readManifest(outputDir);
    const viewport = manifest?.capture?.viewport ?? { width: 1280, height: 720 };
    const pauses = manifest?.capture?.pauses ?? [];
    const webmPath = join(outputDir, 'recording.webm');
    if (!existsSync(webmPath)) {
        throw new Error(`No recording.webm in ${outputDir} — run a capture first`);
    }
    const mp4Path = join(outputDir, 'recording.mp4');
    // Step 1: WebM → MP4 (with pause trimming)
    try {
        if (pauses.length > 0) {
            convertToMp4WithTrim(webmPath, mp4Path, pauses);
        }
        else {
            convertToMp4(webmPath, mp4Path);
        }
    }
    catch {
        updateRenderManifest(outputDir, manifest, options);
        return { mp4Path: null };
    }
    // Step 2: Frame compositing
    const frameStyle = options.frameStyle ?? 'macos';
    if (frameStyle !== 'none') {
        try {
            const frameOpts = {
                style: frameStyle,
                title: options.title ?? manifest?.capture?.pageTitle,
                url: options.url ?? manifest?.capture?.pageUrl,
                resolution: options.resolution,
                windowOffsetY: options.windowOffsetY,
                wallpaperColor: options.wallpaperColor,
                components: options.components,
            };
            const frame = await renderFrame(outputDir, viewport, frameOpts);
            const framedPath = join(outputDir, 'recording-framed.mp4');
            compositeWithFrame(mp4Path, frame.pngPath, framedPath, frame.contentX, frame.contentY);
            unlinkSync(mp4Path);
            renameSync(framedPath, mp4Path);
            unlinkSync(frame.pngPath);
        }
        catch {
            // Frame compositing failed — keep unframed MP4
        }
    }
    updateRenderManifest(outputDir, manifest, options);
    return { mp4Path };
}
function updateRenderManifest(outputDir, manifest, options) {
    if (!manifest)
        return;
    manifest.render = {
        frameStyle: options.frameStyle ?? 'macos',
        title: options.title,
        url: options.url,
        resolution: options.resolution ?? { width: 1920, height: 1080 },
        windowOffsetY: options.windowOffsetY,
        wallpaperColor: options.wallpaperColor,
        components: options.components,
        timestamp: new Date().toISOString(),
    };
    writeManifest(outputDir, manifest);
}
// ── Recording lifecycle ──────────────────────────────────────────────────────
/**
 * Launch a Chromium browser with full recording enabled:
 * - HAR capture (all network traffic)
 * - Video recording
 * - Click visualization (red dot on every click)
 */
export async function launchWithRecording(options) {
    const { outputDir, viewport = { width: 1280, height: 720 }, headed = true, slowMo = 100, ignoreHTTPSErrors = true, desktopFrame = true, scenarioPath, targetPath, } = options;
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
    return {
        browser, context, page, outputDir,
        _startTime: Date.now(), _pauses: [], _pauseStart: null,
        _frameOptions: frameOptions, _viewport: viewport,
        _scenarioPath: scenarioPath, _targetPath: targetPath,
    };
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
 * Finalize recording: close browser, save manifest, convert + frame.
 * Must be called after the scenario completes (or on error).
 *
 * This captures page metadata, saves the manifest with git state and
 * pause segments, then calls render() to produce the final MP4.
 */
export async function finalize(session) {
    const { page, context, browser, outputDir } = session;
    // Capture page info before closing (needed for frame title/URL)
    let pageUrl;
    let pageTitle;
    try {
        pageUrl = page.url();
        pageTitle = await page.title();
    }
    catch {
        // Page may already be closed
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
        if (originalWebm !== webmPath) {
            renameSync(originalWebm, webmPath);
        }
        // Save manifest with capture info
        const gitState = getGitState();
        const manifest = {
            capture: {
                commitHash: gitState.commitHash,
                dirty: gitState.dirty,
                libHash: getLibHash(),
                viewport: session._viewport,
                pauses: session._pauses,
                pageUrl,
                pageTitle,
                timestamp: new Date().toISOString(),
                ...(session._scenarioPath ? { scenarioHash: hashFile(session._scenarioPath) } : {}),
                ...(session._targetPath ? { targetHash: hashFile(session._targetPath) } : {}),
            },
        };
        writeManifest(outputDir, manifest);
        // Render: convert to MP4 + frame composite
        const frameStyle = session._frameOptions === null
            ? 'none'
            : (session._frameOptions.style ?? 'macos');
        const renderResult = await render(outputDir, {
            frameStyle,
            title: session._frameOptions?.title ?? pageTitle,
            url: session._frameOptions?.url ?? pageUrl,
            resolution: session._frameOptions?.resolution,
        });
        mp4Path = renderResult.mp4Path;
    }
    return { harPath, mp4Path, webmPath };
}
//# sourceMappingURL=browser.js.map