export { launchWithRecording, finalize, pauseRecording, resumeRecording, render } from './browser.js'
export type { RecordingOptions, RecordingSession, RecordingResult, PauseSegment, RenderOptions, RenderResult } from './browser.js'

export { CLICK_VIS_SCRIPT, convertToMp4, compositeWithFrame } from './recorder.js'

export { generateFrameHtml, renderFrame } from './frame.js'
export type { DesktopFrameOptions, FrameRenderResult, FrameComponents } from './frame.js'

export { requestInput, provideInput, checkWaiting } from './prompt.js'

export { readManifest, writeManifest, getGitState, getLibHash, hashFile, isCaptureValid } from './manifest.js'
export type { Manifest, CaptureInfo, RenderInfo, CaptureValidationOptions } from './manifest.js'

export { startStudio } from './studio.js'
export type { StudioOptions } from './studio.js'
