/**
 * The zoom model behind the toolbar, kept pure so it can be tested without
 * mounting anything.
 *
 * Zoom is a multiplier over the scale the drawing was fitted at: 1 is "as
 * fitted", which is what the toolbar labels 100%. This is the same convention
 * as Paseo's own diagram viewport, where the fit transform has scale 1, so a
 * reader who knows one knows the other. The fitted scale itself depends on
 * where the drawing sits: in the row it is `fitScale` from layout.ts, in the
 * pop-out it is `fitBothScale` below.
 */

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** Paseo zooms by 1.25 in and 0.8 out; the two are exact inverses. */
export const ZOOM_STEP = 1.25;

const EPSILON = 1e-3;

export interface Size {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * Snaps away the floating point residue of a multiply-then-divide, so stepping
 * in and back out lands on exactly the value it started from.
 */
function snap(zoom: number): number {
  return Math.round(zoom * 1e6) / 1e6;
}

export function zoomIn(zoom: number): number {
  return clampZoom(snap(zoom * ZOOM_STEP));
}

export function zoomOut(zoom: number): number {
  return clampZoom(snap(zoom / ZOOM_STEP));
}

export function canZoomIn(zoom: number): boolean {
  return zoom < ZOOM_MAX - EPSILON;
}

export function canZoomOut(zoom: number): boolean {
  return zoom > ZOOM_MIN + EPSILON;
}

export function sameZoom(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * The zoom that shows the whole drawing across the row.
 *
 * The row's own fit stops shrinking at the readability floor and scrolls
 * sideways past it; "fit to view" is the reader asking to see all of it anyway.
 * It never goes above 1, because the default already grows small drawings as
 * far as they should go, and 1 means the request was already satisfied.
 */
export function fitRowZoom(rowScale: number, naturalWidth: number, available: number): number {
  if (!(rowScale > 0) || !(naturalWidth > 0) || !(available > 0)) return 1;
  return Math.min(1, snap(available / (naturalWidth * rowScale)));
}

/**
 * The scale that fits a drawing inside both axes of a viewport, with `padding`
 * kept clear on every side. Unlike the row, the pop-out grows a small drawing
 * as far as the window allows: seeing it large is the point of popping out.
 */
export function fitBothScale(natural: Size, viewport: Size, padding = 0): number {
  const width = viewport.width - padding * 2;
  const height = viewport.height - padding * 2;
  if (!(natural.width > 0) || !(natural.height > 0) || !(width > 0) || !(height > 0)) return 1;
  return Math.min(width / natural.width, height / natural.height);
}

export interface ToolbarState {
  zoomIn: boolean;
  zoomOut: boolean;
  fit: boolean;
  popOut: boolean;
}

/**
 * Which drawing controls are worth pressing right now. A control that would
 * change nothing is shown quiet rather than hidden, so the toolbar keeps its
 * shape and the reader learns where the limits are.
 */
export function toolbarState({
  zoom,
  fitZoom,
  showCode,
}: {
  zoom: number;
  fitZoom: number;
  showCode: boolean;
}): ToolbarState {
  if (showCode) return { zoomIn: false, zoomOut: false, fit: false, popOut: false };
  return {
    zoomIn: canZoomIn(zoom),
    zoomOut: canZoomOut(zoom),
    fit: !sameZoom(zoom, fitZoom),
    popOut: true,
  };
}
