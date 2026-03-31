import type { ZoomRegion, GifOptions, SpeedRegion } from './types.js';
/**
 * Click visualization script injected into every page via addInitScript.
 * Draws a red expanding/fading circle at each click point — captured in video.
 */
export declare const CLICK_VIS_SCRIPT = "\n  document.addEventListener('click', (e) => {\n    const dot = document.createElement('div');\n    Object.assign(dot.style, {\n      position: 'fixed',\n      left: (e.clientX - 15) + 'px',\n      top: (e.clientY - 15) + 'px',\n      width: '30px',\n      height: '30px',\n      borderRadius: '50%',\n      background: 'rgba(255, 50, 50, 0.45)',\n      border: '2.5px solid rgba(255, 50, 50, 0.8)',\n      pointerEvents: 'none',\n      zIndex: '999999',\n      transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',\n      transform: 'scale(1)',\n      opacity: '1',\n    });\n    document.body.appendChild(dot);\n    requestAnimationFrame(() => {\n      dot.style.opacity = '0';\n      dot.style.transform = 'scale(2.5)';\n    });\n    setTimeout(() => dot.remove(), 1200);\n  }, true);\n";
/**
 * Keystroke visualization script for terminal recordings.
 * Shows typed keys in a floating overlay at bottom-right, fades after 1.5s.
 * Embedded in terminal-page.ts by default; exported here for custom pages.
 */
export declare const KEYSTROKE_VIS_SCRIPT = "\n  (function() {\n    let overlay = document.getElementById('keystroke-overlay');\n    if (!overlay) {\n      overlay = document.createElement('div');\n      overlay.id = 'keystroke-overlay';\n      Object.assign(overlay.style, {\n        position: 'fixed', bottom: '16px', right: '16px',\n        fontFamily: 'Menlo, Monaco, monospace', fontSize: '13px',\n        color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.55)',\n        borderRadius: '6px', padding: '4px 10px', pointerEvents: 'none',\n        zIndex: '999999', opacity: '0', transition: 'opacity 0.3s ease-out',\n        maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden',\n        textOverflow: 'ellipsis',\n      });\n      document.body.appendChild(overlay);\n    }\n    let clearTimer = null;\n    let keyBuffer = '';\n    function showKeystroke(text) {\n      keyBuffer += text;\n      overlay.textContent = keyBuffer;\n      overlay.style.opacity = '1';\n      if (clearTimer) clearTimeout(clearTimer);\n      clearTimer = setTimeout(() => {\n        overlay.style.opacity = '0';\n        setTimeout(() => { keyBuffer = ''; }, 300);\n      }, 1500);\n    }\n    document.addEventListener('keydown', (e) => {\n      if (e.key === 'Enter') showKeystroke('\\u23CE');\n      else if (e.key === 'Tab') showKeystroke('\\u21E5');\n      else if (e.key === 'Backspace') showKeystroke('\\u232B');\n      else if (e.key === 'Escape') showKeystroke('Esc');\n      else if (e.ctrlKey && e.key.length === 1) showKeystroke('Ctrl+' + e.key.toUpperCase());\n      else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) showKeystroke(e.key);\n    }, true);\n  })();\n";
/**
 * Convert a webm video to mp4 using ffmpeg.
 * Requires ffmpeg to be installed and on PATH.
 */
export declare function convertToMp4(webmPath: string, mp4Path: string): void;
/**
 * Convert an mp4 to an animated GIF using ffmpeg two-pass palette method.
 * Produces high-quality dithered output with reasonable file sizes.
 */
export declare function convertToGif(mp4Path: string, gifPath: string, options?: GifOptions): void;
/**
 * Convert webm to mp4 with zoom regions applied via ffmpeg zoompan filter.
 * Generates per-frame zoom/pan expressions from the zoom region data.
 */
export declare function convertToMp4WithZoom(webmPath: string, mp4Path: string, zoomRegions: ZoomRegion[], viewport: {
    width: number;
    height: number;
}, pauses?: {
    start: number;
    end: number;
}[]): void;
/**
 * Composite a recorded MP4 onto a desktop frame PNG using ffmpeg overlay.
 */
export declare function compositeWithFrame(mp4Path: string, framePngPath: string, outputPath: string, contentX: number, contentY: number): void;
/**
 * Convert webm to mp4, trimming out pause segments (e.g. idle time waiting for user input).
 * Uses ffmpeg trim + concat filters to splice out the paused ranges.
 */
export declare function convertToMp4WithTrim(webmPath: string, mp4Path: string, pauses: {
    start: number;
    end: number;
}[]): void;
/**
 * Convert webm to mp4 with speed regions applied via ffmpeg setpts + concat.
 * Each segment between speed boundaries gets its own setpts factor.
 * Also handles pause trimming — paused segments are removed before speed is applied.
 */
export declare function convertToMp4WithSpeed(webmPath: string, mp4Path: string, speedRegions: SpeedRegion[], pauses?: {
    start: number;
    end: number;
}[]): void;
//# sourceMappingURL=recorder.d.ts.map