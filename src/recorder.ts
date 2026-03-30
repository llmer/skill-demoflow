import { execSync } from 'child_process'

/**
 * Click visualization script injected into every page via addInitScript.
 * Draws a red expanding/fading circle at each click point — captured in video.
 */
export const CLICK_VIS_SCRIPT = `
  document.addEventListener('click', (e) => {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed',
      left: (e.clientX - 15) + 'px',
      top: (e.clientY - 15) + 'px',
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      background: 'rgba(255, 50, 50, 0.45)',
      border: '2.5px solid rgba(255, 50, 50, 0.8)',
      pointerEvents: 'none',
      zIndex: '999999',
      transition: 'opacity 0.9s ease-out, transform 0.9s ease-out',
      transform: 'scale(1)',
      opacity: '1',
    });
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.opacity = '0';
      dot.style.transform = 'scale(2.5)';
    });
    setTimeout(() => dot.remove(), 1200);
  }, true);
`

/**
 * Keystroke visualization script for terminal recordings.
 * Shows typed keys in a floating overlay at bottom-right, fades after 1.5s.
 * Embedded in terminal-page.ts by default; exported here for custom pages.
 */
export const KEYSTROKE_VIS_SCRIPT = `
  (function() {
    let overlay = document.getElementById('keystroke-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'keystroke-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', bottom: '16px', right: '16px',
        fontFamily: 'Menlo, Monaco, monospace', fontSize: '13px',
        color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.55)',
        borderRadius: '6px', padding: '4px 10px', pointerEvents: 'none',
        zIndex: '999999', opacity: '0', transition: 'opacity 0.3s ease-out',
        maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis',
      });
      document.body.appendChild(overlay);
    }
    let clearTimer = null;
    let keyBuffer = '';
    function showKeystroke(text) {
      keyBuffer += text;
      overlay.textContent = keyBuffer;
      overlay.style.opacity = '1';
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => { keyBuffer = ''; }, 300);
      }, 1500);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') showKeystroke('\\u23CE');
      else if (e.key === 'Tab') showKeystroke('\\u21E5');
      else if (e.key === 'Backspace') showKeystroke('\\u232B');
      else if (e.key === 'Escape') showKeystroke('Esc');
      else if (e.ctrlKey && e.key.length === 1) showKeystroke('Ctrl+' + e.key.toUpperCase());
      else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) showKeystroke(e.key);
    }, true);
  })();
`

/**
 * Convert a webm video to mp4 using ffmpeg.
 * Requires ffmpeg to be installed and on PATH.
 */
export function convertToMp4(webmPath: string, mp4Path: string): void {
  execSync(`ffmpeg -i "${webmPath}" -c:v libx264 -preset fast -y "${mp4Path}"`, {
    stdio: 'pipe',
  })
}

/**
 * Composite a recorded MP4 onto a desktop frame PNG using ffmpeg overlay.
 */
export function compositeWithFrame(
  mp4Path: string,
  framePngPath: string,
  outputPath: string,
  contentX: number,
  contentY: number,
): void {
  execSync(
    `ffmpeg -loop 1 -i "${framePngPath}" -i "${mp4Path}" ` +
    `-filter_complex "[0:v][1:v]overlay=x=${contentX}:y=${contentY}:shortest=1[out]" ` +
    `-map "[out]" -c:v libx264 -preset fast -y "${outputPath}"`,
    { stdio: 'pipe' },
  )
}

/**
 * Convert webm to mp4, trimming out pause segments (e.g. idle time waiting for user input).
 * Uses ffmpeg trim + concat filters to splice out the paused ranges.
 */
export function convertToMp4WithTrim(
  webmPath: string,
  mp4Path: string,
  pauses: { start: number; end: number }[],
): void {
  // Build keep-segments from the gaps between pauses
  const sorted = [...pauses].sort((a, b) => a.start - b.start)
  const keeps: { start: number; end: string }[] = []
  let cursor = 0

  for (const pause of sorted) {
    if (pause.start > cursor) {
      keeps.push({ start: cursor, end: pause.start.toFixed(3) })
    }
    cursor = pause.end
  }
  // Final segment from last pause end to video end (no end = rest of video)
  keeps.push({ start: cursor, end: '' })

  if (keeps.length === 1 && keeps[0].start === 0 && keeps[0].end === '') {
    // Nothing to trim, fall back to simple conversion
    return convertToMp4(webmPath, mp4Path)
  }

  const trims = keeps.map((k, i) => {
    const endArg = k.end ? `:end=${k.end}` : ''
    return `[0:v]trim=start=${k.start.toFixed(3)}${endArg},setpts=PTS-STARTPTS[v${i}]`
  })
  const concatInputs = keeps.map((_, i) => `[v${i}]`).join('')
  const filter = `${trims.join('; ')}; ${concatInputs}concat=n=${keeps.length}:v=1:a=0[out]`

  execSync(
    `ffmpeg -i "${webmPath}" -filter_complex "${filter}" -map "[out]" -c:v libx264 -preset fast -y "${mp4Path}"`,
    { stdio: 'pipe' },
  )
}
