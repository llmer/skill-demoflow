export { getDevicePreset, listDevicePresets, DEVICE_PRESETS } from './devices.js';
export { launchWithRecording, finalize, pauseRecording, resumeRecording, render } from './browser.js';
export { launchTerminal } from './terminal.js';
export { CLICK_VIS_SCRIPT, KEYSTROKE_VIS_SCRIPT, convertToMp4, compositeWithFrame, convertToGif, convertToMp4WithZoom, convertToMp4WithSpeed } from './recorder.js';
export { generateFrameHtml, renderFrame } from './frame.js';
export { TERMINAL_THEMES } from './terminal-page.js';
export { requestInput, provideInput, checkWaiting } from './prompt.js';
export { readManifest, writeManifest, getGitState, getLibHash, hashFile, isCaptureValid } from './manifest.js';
export { startStudio } from './studio.js';
export { runSteps } from './runner.js';
export { computeZoomAtTime, findDominantRegion, generateAutoZoomRegions, clampFocusToScale, computeRegionStrength } from './zoom.js';
export { CURSOR_SAMPLE_SCRIPT, collectCursorSamples, saveCursorTelemetry, loadCursorTelemetry, detectDwellCandidates, suggestZoomRegions } from './cursor.js';
export { generateAnnotationDrawCode, generateAnnotationsDrawCode, getVisibleAnnotations } from './annotations.js';
export { renderWithAnnotations } from './render-page.js';
//# sourceMappingURL=index.js.map