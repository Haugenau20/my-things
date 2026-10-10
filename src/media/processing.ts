import { photoPath } from '../domain/item';
import type { Photo, PhotoFile } from '../domain/item';

export { MAX_PHOTOS } from '../domain/item';
export function fitWithin(
  width: number,
  height: number,
  edge: number,
): { width: number; height: number } {
  if (![width, height, edge].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error('Invalid image dimensions');
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function dimensions(width: number, height: number) {
  if (!width || !height || width * height > 50000000)
    throw new Error('Use a photo smaller than 50 megapixels.');
  return { width, height };
}
export function sourceDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    if (
      bytes.length < 24 ||
      bytes[12] !== 73 ||
      bytes[13] !== 72 ||
      bytes[14] !== 68 ||
      bytes[15] !== 82
    )
      throw new Error('Invalid PNG header.');
    return dimensions(view.getUint32(16), view.getUint32(20));
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw new Error('Invalid JPEG header.');
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 255) {
        --offset;
        continue;
      }
      if (marker === 216 || marker === 1) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        marker !== undefined &&
        [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)
      ) {
        if (length < 7) throw new Error('Invalid JPEG size.');
        return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
    throw new Error('Could not safely read JPEG dimensions. Select a smaller JPEG or PNG.');
  }
  return null;
}
export async function runBounded<T>(
  values: readonly T[],
  limit: number,
  worker: (value: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency');
  signal?.throwIfAborted();
  let next = 0;
  let failed = false;
  let error: unknown;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (!failed && next < values.length) {
      const value = values[next++]!;
      try {
        signal?.throwIfAborted();
        await worker(value);
      } catch (failure) {
        if (!failed) error = failure;
        failed = true;
      }
    }
  });
  await Promise.all(runners);
  if (failed) throw error;
  signal?.throwIfAborted();
}
export type PreparedPhoto = { photo: Photo; detail: Blob; thumbnail: Blob };
export async function preparePhoto(
  source: File,
  inventory: string,
  item: string,
  id: string,
  signal: AbortSignal,
): Promise<PreparedPhoto> {
  signal.throwIfAborted();
  if (!source.size || source.size > 40 * 1024 * 1024)
    throw new Error('Select a photo smaller than 40 MiB.');
  const header = new Uint8Array(await source.slice(0, 262144).arrayBuffer());
  const originalSize = sourceDimensions(header);
  const heic =
    ['image/heic', 'image/heif'].includes(source.type.toLowerCase()) ||
    /\.(heic|heif)$/i.test(source.name);
  if (!originalSize && !heic)
    throw new Error('Select a JPEG or PNG photo. HEIC requires browser support.');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      heic
        ? 'This browser cannot decode HEIC. Keep the original and select a JPEG or PNG copy.'
        : 'Could not decode this photo. Keep the original and try a smaller JPEG or PNG.',
    );
  }
  try {
    dimensions(image.width, image.height);
    signal.throwIfAborted();
    async function derivative(
      variant: 'detail' | 'thumb',
      edge: number,
      limit: number,
    ): Promise<{ blob: Blob; metadata: PhotoFile }> {
      const size = fitWithin(image.width, image.height, edge);
      const canvas = document.createElement('canvas');
      Object.assign(canvas, size);
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image processing is unavailable.');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size.width, size.height);
        context.drawImage(image, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('JPEG encoding failed.'))),
            'image/jpeg',
            0.85,
          ),
        );
        signal.throwIfAborted();
        if (blob.type !== 'image/jpeg' || !blob.size || blob.size > limit)
          throw new Error('Optimized photo is too large. Select a smaller source photo.');
        return {
          blob,
          metadata: {
            storagePath: photoPath(inventory, item, id, variant),
            contentType: 'image/jpeg',
            byteSize: blob.size,
            ...size,
            sha256: await sha256(new Uint8Array(await blob.arrayBuffer())),
          },
        };
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const detail = await derivative('detail', 2000, 8388608);
    const thumbnail = await derivative('thumb', 400, 524288);
    return {
      photo: { id, state: 'pending', detail: detail.metadata, thumbnail: thumbnail.metadata },
      detail: detail.blob,
      thumbnail: thumbnail.blob,
    };
  } finally {
    image.close();
  }
}
