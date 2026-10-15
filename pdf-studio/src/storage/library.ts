import * as FileSystem from 'expo-file-system/legacy';
import type { PDFDocument } from 'pdf-lib';
import type { DocMeta } from '../types';
import { loadDoc } from '../pdf/ops';

const ROOT = FileSystem.documentDirectory + 'library/';
const INDEX = ROOT + 'index.json';
const MAX_VERSIONS = 15; // how many undo steps are kept on disk

const B64 = { encoding: FileSystem.EncodingType.Base64 };

async function ensureDir(dir: string) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function readIndex(): Promise<DocMeta[]> {
  await ensureDir(ROOT);
  const info = await FileSystem.getInfoAsync(INDEX);
  if (!info.exists) return [];
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(INDEX));
  } catch {
    return [];
  }
}

async function writeIndex(list: DocMeta[]) {
  await ensureDir(ROOT);
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(list));
}

async function upsert(meta: DocMeta) {
  const list = await readIndex();
  const i = list.findIndex((d) => d.id === meta.id);
  if (i >= 0) list[i] = meta;
  else list.push(meta);
  await writeIndex(list);
  return meta;
}

const docDir = (id: string) => ROOT + id + '/';
const fileFor = (id: string, v: number) => docDir(id) + `v${v}.pdf`;
export const currentUri = (m: DocMeta) => fileFor(m.id, m.version);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function cleanName(name?: string | null) {
  const n = (name || 'Document')
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return n || 'Document';
}

async function sizeOf(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
}

export async function readBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, B64);
}

export async function writeBase64(uri: string, b64: string) {
  await FileSystem.writeAsStringAsync(uri, b64, B64);
}

/* ---------------------------------------------------------------- queries */

export async function listDocs() {
  return (await readIndex()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string) {
  return (await readIndex()).find((d) => d.id === id) ?? null;
}

/* ---------------------------------------------------------------- create */

export async function importFile(srcUri: string, name: string | null | undefined, pageCount: number) {
  const id = newId();
  await ensureDir(docDir(id));
  const dest = fileFor(id, 0);
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  const now = Date.now();
  return upsert({
    id,
    name: cleanName(name),
    version: 0,
    minVersion: 0,
    createdAt: now,
    updatedAt: now,
    size: await sizeOf(dest),
    pageCount,
  });
}

export async function createFromBase64(b64: string, name: string, pageCount: number) {
  const id = newId();
  await ensureDir(docDir(id));
  const dest = fileFor(id, 0);
  await writeBase64(dest, b64);
  const now = Date.now();
  return upsert({
    id,
    name: cleanName(name),
    version: 0,
    minVersion: 0,
    createdAt: now,
    updatedAt: now,
    size: await sizeOf(dest),
    pageCount,
  });
}

/* ---------------------------------------------------------------- versions */

export async function commitVersion(meta: DocMeta, b64: string, pageCount: number) {
  const v = meta.version + 1;
  const dest = fileFor(meta.id, v);
  await writeBase64(dest, b64);
  // drop versions beyond the undo limit, and any "redo" leftovers
  let minVersion = meta.minVersion;
  while (v - minVersion > MAX_VERSIONS) {
    await FileSystem.deleteAsync(fileFor(meta.id, minVersion), { idempotent: true });
    minVersion++;
  }
  return upsert({ ...meta, version: v, minVersion, updatedAt: Date.now(), size: await sizeOf(dest), pageCount });
}

/** Load the current version, let `mutate` change it, save as a new version. */
export async function editDocument(meta: DocMeta, mutate: (doc: PDFDocument) => Promise<void> | void) {
  const doc = await loadDoc(await readBase64(currentUri(meta)));
  await mutate(doc);
  const out = await doc.saveAsBase64();
  return commitVersion(meta, out, doc.getPageCount());
}

export const canUndo = (m: DocMeta) => m.version > m.minVersion;

export async function undo(meta: DocMeta) {
  if (!canUndo(meta)) return meta;
  await FileSystem.deleteAsync(currentUri(meta), { idempotent: true });
  const prev = { ...meta, version: meta.version - 1, updatedAt: Date.now() };
  prev.size = await sizeOf(currentUri(prev));
  return upsert(prev);
}

/* ---------------------------------------------------------------- manage */

export async function renameDoc(meta: DocMeta, name: string) {
  return upsert({ ...meta, name: cleanName(name), updatedAt: Date.now() });
}

export async function updatePageCount(meta: DocMeta, pageCount: number) {
  if (meta.pageCount === pageCount) return meta;
  return upsert({ ...meta, pageCount });
}

export async function deleteDoc(id: string) {
  await FileSystem.deleteAsync(docDir(id), { idempotent: true });
  await writeIndex((await readIndex()).filter((d) => d.id !== id));
}

/* ---------------------------------------------------------------- export */

/** Copy the current version to a nicely named file in the cache (for sharing). */
export async function exportCopy(meta: DocMeta) {
  const dir = FileSystem.cacheDirectory + 'share/';
  await ensureDir(dir);
  const dest = dir + cleanName(meta.name) + '.pdf';
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: currentUri(meta), to: dest });
  return dest;
}

/** Save to a user-chosen folder (Downloads, Documents, …) through Android's Storage Access Framework. */
export async function saveToDevice(meta: DocMeta): Promise<boolean> {
  const SAF = FileSystem.StorageAccessFramework;
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return false;
  const dest = await SAF.createFileAsync(perm.directoryUri, cleanName(meta.name), 'application/pdf');
  await FileSystem.writeAsStringAsync(dest, await readBase64(currentUri(meta)), B64);
  return true;
}

export async function writeTemp(b64: string, prefix: string) {
  const dir = FileSystem.cacheDirectory + 'tmp/';
  await ensureDir(dir);
  const uri = `${dir}${prefix}_${Date.now()}.pdf`;
  await writeBase64(uri, b64);
  return uri;
}

export async function copyIncoming(uri: string) {
  const dir = FileSystem.cacheDirectory + 'incoming/';
  await ensureDir(dir);
  const dest = `${dir}in_${Date.now()}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
