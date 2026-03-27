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
 * Convert a webm video to mp4 using ffmpeg.
 * Requires ffmpeg to be installed and on PATH.
 */
export function convertToMp4(webmPath: string, mp4Path: string): void {
  execSync(`ffmpeg -i "${webmPath}" -c:v libx264 -preset fast -y "${mp4Path}"`, {
    stdio: 'pipe',
  })
}
