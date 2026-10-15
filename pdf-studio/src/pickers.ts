import * as DocumentPicker from 'expo-document-picker';
import type { ImageInput } from './pdf/ops';
import { readBase64 } from './storage/library';

export type PickedFile = { uri: string; name: string };

export async function pickPdfs(multiple = false): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name ?? 'Document.pdf' }));
}

export type PickedImage = { uri: string; mime: 'png' | 'jpg'; name: string };

export async function pickImages(multiple = true): Promise<PickedImage[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png'],
    multiple,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  return res.assets
    .map((a) => {
      const type = (a.mimeType ?? '').toLowerCase();
      const name = (a.name ?? '').toLowerCase();
      const mime: 'png' | 'jpg' | null =
        type.includes('png') || name.endsWith('.png')
          ? 'png'
          : type.includes('jpeg') || type.includes('jpg') || /\.jpe?g$/.test(name)
            ? 'jpg'
            : null;
      return mime ? { uri: a.uri, mime, name: a.name ?? 'image' } : null;
    })
    .filter((x): x is PickedImage => !!x);
}

export async function loadImages(images: PickedImage[]): Promise<ImageInput[]> {
  const out: ImageInput[] = [];
  for (const img of images) out.push({ b64: await readBase64(img.uri), mime: img.mime });
  return out;
}
