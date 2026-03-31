/**
 * Frame-by-frame compositing engine using a headless Playwright page.
 *
 * Used when annotations or complex zoom transitions require per-frame rendering
 * that can't be expressed via ffmpeg filters alone.
 *
 * Pipeline:
 * 1. Extract frames from source video via ffmpeg (pipe to stdout as raw images)
 * 2. For each frame, load into a Canvas element in the Playwright page
 * 3. Apply zoom transform + draw annotations via Canvas2D
 * 4. Export composited frame
 * 5. Encode all frames back to MP4 via ffmpeg (pipe from stdin)
 */

import { execSync, spawn } from 'child_process'
import { chromium } from '@playwright/test'
import { generateAnnotationsDrawCode } from './annotations.js'
import { computeZoomAtTime } from './zoom.js'
import type { ZoomRegion, Annotation } from './types.js'

export interface RenderPageOptions {
  /** Source video path (WebM or MP4) */
  inputPath: string
  /** Output MP4 path */
  outputPath: string
  /** Video dimensions */
  width: number
  height: number
  /** Zoom regions to apply */
  zoomRegions?: ZoomRegion[]
  /** Annotations to draw */
  annotations?: Annotation[]
  /** Frame rate. Default: auto-detect from source */
  fps?: number
  /** Progress callback (frameIndex, totalFrames) */
  onProgress?: (frame: number, total: number) => void
}

/**
 * Render a video frame-by-frame with annotations and zoom via Canvas2D.
 * This launches a headless Playwright browser, loads each frame into a canvas,
 * applies effects, and pipes composited frames to ffmpeg for encoding.
 */
export async function renderWithAnnotations(options: RenderPageOptions): Promise<void> {
  const { inputPath, outputPath, width, height } = options
  const zoomRegions = options.zoomRegions ?? []
  const annotations = options.annotations ?? []

  // Probe source video
  const probeResult = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,nb_frames,duration -of csv=p=0 "${inputPath}"`,
    { stdio: 'pipe', encoding: 'utf-8' },
  ).trim()
  const parts = probeResult.split(',')
  const [fpsNum, fpsDen] = (parts[0] ?? '30/1').split('/')
  const detectedFps = Math.round(parseInt(fpsNum) / (parseInt(fpsDen) || 1)) || 30
  const fps = options.fps ?? detectedFps
  const rawDuration = parseFloat(parts[2] ?? '0')
  const duration = rawDuration || parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`, { stdio: 'pipe', encoding: 'utf-8' }).trim(),
  ) || 10
  const totalFrames = Math.ceil(duration * fps)

  // Launch headless browser with a canvas page
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width, height })

  // Create the canvas rendering page
  await page.setContent(`<!DOCTYPE html>
<html><head><style>* { margin: 0; } body { overflow: hidden; }</style></head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // Receive frame as base64, apply effects, return composited base64
  window.__renderFrame = async function(frameBase64, zoomTransform, annotationCode) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, ${width}, ${height});

        // Apply zoom transform
        if (zoomTransform && zoomTransform.scale !== 1) {
          ctx.save();
          ctx.translate(zoomTransform.x, zoomTransform.y);
          ctx.scale(zoomTransform.scale, zoomTransform.scale);
          ctx.drawImage(img, 0, 0, ${width}, ${height});
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, 0, ${width}, ${height});
        }

        // Draw annotations
        if (annotationCode) {
          try { eval(annotationCode); } catch(e) { console.error(e); }
        }

        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.src = 'data:image/raw;base64,' + frameBase64;
    });
  };
</script>
</body></html>`)

  // Extract frames from source, composite, and re-encode
  // We process frames in batches to avoid memory issues
  const BATCH_SIZE = 30

  // Start ffmpeg encoder process
  const encoder = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: ['pipe', 'pipe', 'pipe'] })

  const encoderDone = new Promise<void>((resolve, reject) => {
    encoder.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg encoder exited with code ${code}`))
    })
  })

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx += BATCH_SIZE) {
    const batchEnd = Math.min(frameIdx + BATCH_SIZE, totalFrames)
    const batchCount = batchEnd - frameIdx
    const startTime = frameIdx / fps

    // Extract batch of frames as PNG images
    const frameData = execSync(
      `ffmpeg -ss ${startTime.toFixed(4)} -i "${inputPath}" ` +
      `-frames:v ${batchCount} -f image2pipe -vcodec png -`,
      { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 200 * 1024 * 1024 },
    )

    // Split PNG data — each PNG starts with the magic bytes 0x89504E47
    const pngFrames = splitPngs(frameData)

    for (let i = 0; i < pngFrames.length; i++) {
      const currentFrame = frameIdx + i
      const timeMs = (currentFrame / fps) * 1000

      // Compute zoom
      const zoom = zoomRegions.length > 0
        ? computeZoomAtTime(zoomRegions, timeMs, width, height)
        : { scale: 1, x: 0, y: 0 }

      // Generate annotation draw code
      const annotationCode = annotations.length > 0
        ? generateAnnotationsDrawCode(annotations, timeMs, width, height)
        : ''

      // Render frame in browser
      const frameBase64 = pngFrames[i].toString('base64')
      const compositedBase64 = await page.evaluate(
        ({ fb, zt, ac }) => (window as any).__renderFrame(fb, zt, ac),
        { fb: frameBase64, zt: zoom, ac: annotationCode },
      )

      // Decode and pipe to encoder
      const compositedBuffer = Buffer.from(compositedBase64 as string, 'base64')
      encoder.stdin!.write(compositedBuffer)

      options.onProgress?.(currentFrame, totalFrames)
    }
  }

  encoder.stdin!.end()
  await encoderDone
  await browser.close()
}

/**
 * Split a buffer containing multiple concatenated PNG files.
 * PNG magic: 89 50 4E 47 0D 0A 1A 0A
 */
function splitPngs(buffer: Buffer): Buffer[] {
  const magic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const pngs: Buffer[] = []
  let start = 0

  for (let i = 1; i < buffer.length - magic.length; i++) {
    if (buffer.subarray(i, i + magic.length).equals(magic)) {
      pngs.push(buffer.subarray(start, i))
      start = i
    }
  }

  if (start < buffer.length) {
    pngs.push(buffer.subarray(start))
  }

  return pngs
}
