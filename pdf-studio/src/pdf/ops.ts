import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import type { Annotation } from '../types';
import { pageGeo, rectToPdf, toPdf } from './coords';

export const A4: [number, number] = [595.28, 841.89];

export async function loadDoc(base64: string) {
  return PDFDocument.load(base64, { updateMetadata: false });
}

export async function countPages(base64: string): Promise<number> {
  try {
    const doc = await PDFDocument.load(base64, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/encrypt/i.test(msg)) return 'This PDF is password-protected/encrypted, so it can be viewed but not edited.';
  if (/WinAnsi cannot encode/i.test(msg))
    return 'The built-in font only supports Latin characters. Please remove unsupported characters (e.g. emoji or non-Latin scripts).';
  if (/Failed to parse PDF|No PDF header/i.test(msg)) return 'This file does not look like a valid PDF.';
  return msg;
}

/* ---------------------------------------------------------------- annotations */

export async function applyAnnotations(
  doc: PDFDocument,
  pageIndex: number,
  annots: Annotation[],
  imageData: Record<string, string>,
) {
  const page = doc.getPage(pageIndex);
  const g = pageGeo(page);
  let font: PDFFont | null = null;
  const imgCache: Record<string, Awaited<ReturnType<PDFDocument['embedPng']>>> = {};

  for (const a of annots) {
    switch (a.kind) {
      case 'ink': {
        const color = hexToRgb(a.color);
        if (a.points.length === 1) {
          const p = toPdf(g, a.points[0].x, a.points[0].y);
          page.drawCircle({ x: p.x, y: p.y, size: a.width / 2, color });
          break;
        }
        const d = a.points
          .map((pt, i) => {
            const p = toPdf(g, pt.x, pt.y);
            // drawSvgPath flips the y axis, so feed it -y
            return `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`;
          })
          .join(' ');
        page.drawSvgPath(d, {
          x: 0,
          y: 0,
          borderColor: color,
          borderWidth: a.width,
          borderLineCap: LineCapStyle.Round,
        });
        break;
      }
      case 'highlight': {
        page.drawRectangle({
          ...rectToPdf(g, a.x, a.y, a.w, a.h),
          color: hexToRgb(a.color),
          opacity: 0.4,
          blendMode: BlendMode.Multiply,
        });
        break;
      }
      case 'whiteout': {
        page.drawRectangle({ ...rectToPdf(g, a.x, a.y, a.w, a.h), color: rgb(1, 1, 1) });
        break;
      }
      case 'rect': {
        page.drawRectangle({
          ...rectToPdf(g, a.x, a.y, a.w, a.h),
          borderColor: hexToRgb(a.color),
          borderWidth: a.width,
        });
        break;
      }
      case 'text': {
        if (!font) font = await doc.embedFont(StandardFonts.Helvetica);
        const color = hexToRgb(a.color);
        a.text.split('\n').forEach((line, i) => {
          if (!line) return;
          const p = toPdf(g, a.x, a.y + i * a.size * 1.2);
          page.drawText(line, { x: p.x, y: p.y, size: a.size, font: font!, color, rotate: degrees(g.rot) });
        });
        break;
      }
      case 'image': {
        const data = imageData[a.uri];
        if (!data) throw new Error('Image data missing');
        let img = imgCache[a.uri];
        if (!img) {
          img = a.mime === 'png' ? await doc.embedPng(data) : await doc.embedJpg(data);
          imgCache[a.uri] = img;
        }
        // bottom-left corner of the image as displayed
        const p = toPdf(g, a.x, a.y + a.h);
        page.drawImage(img, { x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(g.rot) });
        break;
      }
    }
  }
}

/* ---------------------------------------------------------------- page operations */

export function rotatePages(doc: PDFDocument, indices: number[], delta: number) {
  for (const i of indices) {
    const p = doc.getPage(i);
    const cur = p.getRotation().angle || 0;
    p.setRotation(degrees((((cur + delta) % 360) + 360) % 360));
  }
}

export function deletePages(doc: PDFDocument, indices: number[]) {
  if (indices.length >= doc.getPageCount()) throw new Error('A PDF must keep at least one page.');
  [...indices].sort((a, b) => b - a).forEach((i) => doc.removePage(i));
}

export async function duplicatePages(doc: PDFDocument, indices: number[]) {
  for (const i of [...indices].sort((a, b) => b - a)) {
    const [copy] = await doc.copyPages(doc, [i]);
    doc.insertPage(i + 1, copy);
  }
}

export async function movePage(doc: PDFDocument, from: number, to: number) {
  const count = doc.getPageCount();
  if (to < 0 || to >= count || from === to) return;
  const [copy] = await doc.copyPages(doc, [from]);
  doc.removePage(from);
  doc.insertPage(to, copy);
}

export function insertBlankPage(doc: PDFDocument, index: number) {
  const ref = doc.getPageCount() ? doc.getPage(Math.max(0, Math.min(index - 1, doc.getPageCount() - 1))) : null;
  const size: [number, number] = ref ? [ref.getWidth(), ref.getHeight()] : A4;
  doc.insertPage(index, size);
}

export async function extractPages(doc: PDFDocument, indices: number[]): Promise<string> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, indices);
  pages.forEach((p) => out.addPage(p));
  return out.saveAsBase64();
}

export async function mergeDocuments(base64s: string[]): Promise<{ b64: string; pages: number }> {
  const out = await PDFDocument.create();
  for (const b64 of base64s) {
    const src = await loadDoc(b64);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return { b64: await out.saveAsBase64(), pages: out.getPageCount() };
}

export async function appendDocument(doc: PDFDocument, otherB64: string) {
  const src = await loadDoc(otherB64);
  const pages = await doc.copyPages(src, src.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
}

export type ImageInput = { b64: string; mime: 'png' | 'jpg' };

async function addImagePage(doc: PDFDocument, img: ImageInput, index?: number) {
  const embedded = img.mime === 'png' ? await doc.embedPng(img.b64) : await doc.embedJpg(img.b64);
  const landscape = embedded.width > embedded.height;
  const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
  const margin = 24;
  const s = Math.min((pw - 2 * margin) / embedded.width, (ph - 2 * margin) / embedded.height);
  const w = embedded.width * s;
  const h = embedded.height * s;
  const page = index === undefined ? doc.addPage([pw, ph]) : doc.insertPage(index, [pw, ph]);
  page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
}

export async function imagesToPdf(images: ImageInput[]): Promise<{ b64: string; pages: number }> {
  const doc = await PDFDocument.create();
  for (const img of images) await addImagePage(doc, img);
  return { b64: await doc.saveAsBase64(), pages: doc.getPageCount() };
}

export async function appendImages(doc: PDFDocument, images: ImageInput[]) {
  for (const img of images) await addImagePage(doc, img);
}

export async function createBlank(pages = 1): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage(A4);
  return doc.saveAsBase64();
}

/* ---------------------------------------------------------------- stamping */

export type PageNumberFormat = 'n' | 'page-n' | 'page-n-of-t';

export async function addPageNumbers(
  doc: PDFDocument,
  format: PageNumberFormat,
  position: 'center' | 'right' = 'center',
  size = 10,
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const total = doc.getPageCount();
  doc.getPages().forEach((page: PDFPage, i) => {
    const g = pageGeo(page);
    const label = format === 'n' ? `${i + 1}` : format === 'page-n' ? `Page ${i + 1}` : `Page ${i + 1} of ${total}`;
    const tw = font.widthOfTextAtSize(label, size);
    const margin = 22;
    const dx = position === 'center' ? (g.dispW - tw) / 2 : g.dispW - margin - tw;
    const dy = g.dispH - margin;
    const p = toPdf(g, dx, dy);
    page.drawText(label, { x: p.x, y: p.y, size, font, color: rgb(0.25, 0.25, 0.25), rotate: degrees(g.rot) });
  });
}

export async function addWatermark(doc: PDFDocument, text: string, opacity = 0.15) {
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const unit = font.widthOfTextAtSize(text, 1);
  doc.getPages().forEach((page) => {
    const g = pageGeo(page);
    const diag = Math.sqrt(g.dispW ** 2 + g.dispH ** 2);
    const size = Math.min(120, (diag * 0.7) / unit);
    const tw = unit * size;
    const capH = size * 0.7;
    const u = Math.SQRT1_2;
    // text runs up-right at 45° in display space, centred on the page
    const cx = g.dispW / 2;
    const cy = g.dispH / 2;
    const sx = cx - u * (tw / 2) + u * (capH / 2);
    const sy = cy + u * (tw / 2) + u * (capH / 2);
    const p = toPdf(g, sx, sy);
    page.drawText(text, {
      x: p.x,
      y: p.y,
      size,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity,
      rotate: degrees(g.rot + 45),
    });
  });
}

/* ---------------------------------------------------------------- metadata & info */

export type Metadata = { title: string; author: string; subject: string; keywords: string };

export function getMetadata(doc: PDFDocument): Metadata {
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
  };
}

export function setMetadata(doc: PDFDocument, m: Metadata) {
  doc.setTitle(m.title);
  doc.setAuthor(m.author);
  doc.setSubject(m.subject);
  doc.setKeywords(m.keywords.split(',').map((k) => k.trim()).filter(Boolean));
  doc.setModificationDate(new Date());
  doc.setProducer('PDF Studio');
}

export type PageInfo = { width: number; height: number; rotation: number };

export function getPageInfo(doc: PDFDocument): PageInfo[] {
  return doc.getPages().map((p) => {
    const g = pageGeo(p);
    return { width: g.dispW, height: g.dispH, rotation: g.rot };
  });
}

/** "1-3, 5, 8-10" -> zero-based sorted unique indices */
export function parseRanges(input: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid range "${part}"`);
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`Pages must be between 1 and ${total}`);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i - 1);
  }
  if (!out.size) throw new Error('Enter at least one page');
  return [...out].sort((x, y) => x - y);
}
