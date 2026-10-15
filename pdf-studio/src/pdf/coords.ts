import type { PDFPage } from 'pdf-lib';

/**
 * Geometry of a page as it is DISPLAYED (after /Rotate is applied).
 * Display space: origin top-left, x to the right, y down, units = PDF points.
 */
export type PageGeo = {
  rot: 0 | 90 | 180 | 270;
  W: number; // crop box width (unrotated)
  H: number; // crop box height (unrotated)
  ox: number; // crop box origin
  oy: number;
  dispW: number;
  dispH: number;
};

export function pageGeo(page: PDFPage): PageGeo {
  const raw = page.getRotation().angle || 0;
  const rot = ((((Math.round(raw / 90) * 90) % 360) + 360) % 360) as PageGeo['rot'];
  const box = page.getCropBox();
  const W = box.width;
  const H = box.height;
  const swap = rot === 90 || rot === 270;
  return { rot, W, H, ox: box.x, oy: box.y, dispW: swap ? H : W, dispH: swap ? W : H };
}

/** Convert a display-space point to PDF user space. */
export function toPdf(g: PageGeo, dx: number, dy: number): { x: number; y: number } {
  let x: number;
  let y: number;
  switch (g.rot) {
    case 0:
      x = dx;
      y = g.H - dy;
      break;
    case 90:
      x = dy;
      y = dx;
      break;
    case 180:
      x = g.W - dx;
      y = dy;
      break;
    default: // 270
      x = g.W - dy;
      y = g.H - dx;
  }
  return { x: x + g.ox, y: y + g.oy };
}

/** Convert a display-space rectangle to an axis-aligned PDF rectangle. */
export function rectToPdf(g: PageGeo, x: number, y: number, w: number, h: number) {
  const a = toPdf(g, x, y);
  const b = toPdf(g, x + w, y + h);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
