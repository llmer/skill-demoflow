/**
 * Click visualization script injected into every page via addInitScript.
 * Draws a red expanding/fading circle at each click point — captured in video.
 */
export declare const CLICK_VIS_SCRIPT = "\n  document.addEventListener('click', (e) => {\n    const dot = document.createElement('div');\n    Object.assign(dot.style, {\n      position: 'fixed',\n      left: (e.clientX - 15) + 'px',\n      top: (e.clientY - 15) + 'px',\n      width: '30px',\n      height: '30px',\n      borderRadius: '50%',\n      background: 'rgba(255, 50, 50, 0.45)',\n      border: '2.5px solid rgba(255, 50, 50, 0.8)',\n      pointerEvents: 'none',\n      zIndex: '999999',\n      transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',\n      transform: 'scale(1)',\n      opacity: '1',\n    });\n    document.body.appendChild(dot);\n    requestAnimationFrame(() => {\n      dot.style.opacity = '0';\n      dot.style.transform = 'scale(2.5)';\n    });\n    setTimeout(() => dot.remove(), 1200);\n  }, true);\n";
/**
 * Convert a webm video to mp4 using ffmpeg.
 * Requires ffmpeg to be installed and on PATH.
 */
export declare function convertToMp4(webmPath: string, mp4Path: string): void;
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
//# sourceMappingURL=recorder.d.ts.map