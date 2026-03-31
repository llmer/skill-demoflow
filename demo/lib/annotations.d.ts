/**
 * Annotation rendering utilities.
 *
 * Generates Canvas2D drawing commands for text labels and directional arrows.
 * Used by the render page (render-page.ts) for frame-by-frame compositing,
 * and can also generate standalone SVG/Canvas snippets for Studio preview.
 */
import type { Annotation } from './types.js';
/**
 * Generate JavaScript code that draws an annotation onto a Canvas2D context.
 * The code assumes a `ctx` variable is in scope and the canvas matches the
 * video viewport dimensions.
 *
 * @param annotation The annotation to render
 * @param viewportWidth Video viewport width in pixels
 * @param viewportHeight Video viewport height in pixels
 * @returns JavaScript source string
 */
export declare function generateAnnotationDrawCode(annotation: Annotation, viewportWidth: number, viewportHeight: number): string;
/**
 * Filter annotations that are visible at a given time.
 */
export declare function getVisibleAnnotations(annotations: Annotation[], timeMs: number): Annotation[];
/**
 * Generate the complete draw code for all visible annotations at a given time.
 */
export declare function generateAnnotationsDrawCode(annotations: Annotation[], timeMs: number, viewportWidth: number, viewportHeight: number): string;
//# sourceMappingURL=annotations.d.ts.map