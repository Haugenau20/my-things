import { Inflate } from 'fflate';
import { EXPORT_PART_BYTES, EXPORT_METADATA_BYTES } from './export';

const MAX_ZIP_BYTES = EXPORT_PART_BYTES + 16 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;
const MAX_MEMBERS = 20007;
const metadata = new Set([
  'manifest.json',
  'inventory.json',
  'rooms.json',
  'boxes.json',
  'items.json',
  'items.csv',
  'EXPORT_README.txt',
]);
export function allowedPayloadPath(path: string): boolean {
  return (
    metadata.has(path) ||
    /^photos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/(detail|thumb)\.jpg$/.test(path)
  );
}
export type ZipMember = {
  path: string;
  size: number;
  compressedSize: number;
  method: number;
  crc: number;
  offset: number;
  dataOffset: number;
  end: number;
};
export type ZipIndex = { file: File; members: Map<string, ZipMember> };
async function bytes(file: File, start: number, length: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(length) ||
    start < 0 ||
    length < 0 ||
    start + length > file.size
  )
    throw new Error('Truncated or invalid ZIP range.');
  const result = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
  signal.throwIfAborted();
  return result;
}
function view(data: Uint8Array<ArrayBuffer>) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function pathBytes(data: Uint8Array): string {
  // Export paths are ASCII. Alternate legacy/Unicode path interpretations are unsupported.
  if (data.some((value) => value > 127)) throw new Error('Unsupported ZIP path encoding.');
  const path = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (!allowedPayloadPath(path)) throw new Error('Unexpected or unsafe ZIP path.');
  return path;
}
function pathLimit(path: string): number {
  if (path === 'manifest.json') return 16 * 1024 * 1024;
  if (metadata.has(path)) return EXPORT_METADATA_BYTES;
  return path.endsWith('/detail.jpg') ? 8388608 : 524288;
}
export async function indexZip(file: File, signal: AbortSignal): Promise<ZipIndex> {
  signal.throwIfAborted();
  if (file.size < 22 || file.size > MAX_ZIP_BYTES)
    throw new Error('ZIP size exceeds the supported bounds.');
  const tailOffset = Math.max(0, file.size - 65557);
  const tail = await bytes(file, tailOffset, file.size - tailOffset, signal);
  const tailView = view(tail);
  let end = -1;
  for (let index = tail.length - 22; index >= 0; --index) {
    if (
      tailView.getUint32(index, true) === 0x06054b50 &&
      index + 22 + tailView.getUint16(index + 20, true) === tail.length
    ) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('ZIP end record is missing.');
  const count = tailView.getUint16(end + 10, true);
  const directorySize = tailView.getUint32(end + 12, true);
  const directoryOffset = tailView.getUint32(end + 16, true);
  if (
    tailView.getUint16(end + 4, true) !== 0 ||
    tailView.getUint16(end + 6, true) !== 0 ||
    tailView.getUint16(end + 8, true) !== count ||
    tailView.getUint16(end + 20, true) !== 0 ||
    count < 1 ||
    count > MAX_MEMBERS ||
    directorySize > MAX_DIRECTORY_BYTES ||
    directoryOffset + directorySize !== tailOffset + end
  )
    throw new Error('Unsupported multi-disk, ZIP64, or invalid ZIP directory.');
  const directory = await bytes(file, directoryOffset, directorySize, signal);
  const directoryView = view(directory);
  const members = new Map<string, ZipMember>();
  let cursor = 0;
  let totalSize = 0;
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    if (cursor + 46 > directory.length || directoryView.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('Invalid ZIP central header.');
    const flags = directoryView.getUint16(cursor + 8, true);
    const method = directoryView.getUint16(cursor + 10, true);
    const crc = directoryView.getUint32(cursor + 16, true);
    const compressedSize = directoryView.getUint32(cursor + 20, true);
    const size = directoryView.getUint32(cursor + 24, true);
    const nameLength = directoryView.getUint16(cursor + 28, true);
    const extraLength = directoryView.getUint16(cursor + 30, true);
    const commentLength = directoryView.getUint16(cursor + 32, true);
    const mode = directoryView.getUint32(cursor + 38, true) >>> 16;
    if ((directoryView.getUint32(cursor + 38, true) & 0x10) !== 0)
      throw new Error('ZIP directories are unsupported.');
    const offset = directoryView.getUint32(cursor + 42, true);
    if ((mode & 0xf000) === 0xa000) throw new Error('ZIP symlink is prohibited.');
    if (![0, 0x8000].includes(mode & 0xf000)) throw new Error('Unsupported ZIP member type.');
    if (
      (flags & ~0x080e) !== 0 ||
      ![0, 8].includes(method) ||
      extraLength !== 0 ||
      commentLength !== 0 ||
      directoryView.getUint16(cursor + 34, true) !== 0 ||
      cursor + 46 + nameLength > directory.length ||
      offset >= directoryOffset ||
      [size, compressedSize, offset].includes(0xffffffff)
    )
      throw new Error('Unsupported encrypted, extended, or invalid ZIP member.');
    const path = pathBytes(directory.subarray(cursor + 46, cursor + 46 + nameLength));
    if (members.has(path)) throw new Error('Duplicate ZIP path.');
    if (size > pathLimit(path) || (method === 0 && size !== compressedSize))
      throw new Error('ZIP member size exceeds its supported limit.');
    totalSize += size;
    if (totalSize > EXPORT_PART_BYTES)
      throw new Error('ZIP payload size exceeds its supported limit.');
    const local = await bytes(file, offset, 30, signal);
    const localView = view(local);
    if (
      localView.getUint32(0, true) !== 0x04034b50 ||
      localView.getUint16(6, true) !== flags ||
      localView.getUint16(8, true) !== method ||
      localView.getUint16(26, true) !== nameLength ||
      localView.getUint16(28, true) !== 0
    )
      throw new Error('ZIP local header differs from its directory.');
    const localName = await bytes(file, offset + 30, nameLength, signal);
    if (pathBytes(localName) !== path)
      throw new Error('ZIP local path differs from its directory.');
    const dataOffset = offset + 30 + nameLength;
    let memberEnd = dataOffset + compressedSize;
    if (memberEnd > directoryOffset) throw new Error('ZIP data overlaps its directory.');
    if (flags & 8) {
      if (
        ![0, crc].includes(localView.getUint32(14, true)) ||
        ![0, compressedSize].includes(localView.getUint32(18, true)) ||
        ![0, size].includes(localView.getUint32(22, true))
      )
        throw new Error('ZIP streamed local sizes differ from its directory.');
      const descriptor = await bytes(
        file,
        memberEnd,
        Math.min(16, directoryOffset - memberEnd),
        signal,
      );
      const descriptorView = view(descriptor);
      if (descriptor.length < 12) throw new Error('Missing ZIP data descriptor.');
      const shift = descriptorView.getUint32(0, true) === 0x08074b50 ? 4 : 0;
      if (
        descriptor.length < shift + 12 ||
        descriptorView.getUint32(shift, true) !== crc ||
        descriptorView.getUint32(shift + 4, true) !== compressedSize ||
        descriptorView.getUint32(shift + 8, true) !== size
      )
        throw new Error('ZIP data descriptor differs from its directory.');
      memberEnd += shift + 12;
    } else if (
      localView.getUint32(14, true) !== crc ||
      localView.getUint32(18, true) !== compressedSize ||
      localView.getUint32(22, true) !== size
    )
      throw new Error('ZIP local sizes or CRC differ from its directory.');
    members.set(path, {
      path,
      size,
      compressedSize,
      method,
      crc,
      offset,
      dataOffset,
      end: memberEnd,
    });
    cursor += 46 + nameLength;
  }
  if (cursor !== directory.length) throw new Error('Unexpected ZIP directory content.');
  const ordered = [...members.values()].sort((a, b) => a.offset - b.offset);
  let previousEnd = 0;
  for (const member of ordered) {
    if (member.offset !== previousEnd)
      throw new Error('ZIP contains overlapping, hidden, or prefixed content.');
    previousEnd = member.end;
  }
  if (previousEnd !== directoryOffset) throw new Error('Unexpected unindexed ZIP data.');
  return { file, members };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function readZipMember(
  index: ZipIndex,
  path: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  const member = index.members.get(path);
  if (!member) throw new Error('Required ZIP member is missing.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || member.size > maxBytes)
    throw new Error('ZIP member size exceeds the requested limit.');
  let output: Uint8Array<ArrayBuffer>;
  if (member.method === 0)
    output = await bytes(index.file, member.dataOffset, member.compressedSize, signal);
  else {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    let finished = false;
    const inflate = new Inflate((chunk, final) => {
      total += chunk.byteLength;
      if (total > member.size || total > maxBytes)
        throw new Error('Decompressed ZIP size exceeds its declared limit.');
      chunks.push(chunk.slice());
      finished ||= final;
    });
    // Small compressed chunks bound a malicious stream's expansion before the callback can reject it.
    for (let offset = 0; offset < member.compressedSize; offset += 1024) {
      signal.throwIfAborted();
      const length = Math.min(1024, member.compressedSize - offset);
      inflate.push(
        await bytes(index.file, member.dataOffset + offset, length, signal),
        offset + length === member.compressedSize,
      );
    }
    if (!finished || total !== member.size) throw new Error('Incomplete ZIP decompression.');
    output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    chunks.length = 0;
  }
  signal.throwIfAborted();
  if (output.length !== member.size || crc32(output) !== member.crc)
    throw new Error('ZIP member CRC or size mismatch.');
  return output;
}
