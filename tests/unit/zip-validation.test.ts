import { expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { indexZip, readZipMember } from '../../src/backup/zip';

const signal = () => new AbortController().signal;
const bytes = new TextEncoder().encode('Synthetic payload');
const file = (payload: Uint8Array<ArrayBuffer>) => new File([payload], 'synthetic.zip');
it('reads stored and DEFLATE members with a strict size/CRC bound', async () => {
  for (const level of [0, 6] as const) {
    const source = file(zipSync({ 'items.json': bytes }, { level }));
    const index = await indexZip(source, signal());
    expect(await readZipMember(index, 'items.json', 100, signal())).toEqual(bytes);
    await expect(readZipMember(index, 'items.json', 2, signal())).rejects.toThrow(/size/i);
  }
});
it('rejects traversal, duplicate paths, symlinks, and corrupted member bytes', async () => {
  await expect(indexZip(file(zipSync({ '../items.json': bytes })), signal())).rejects.toThrow(
    /path/i,
  );
  await expect(
    indexZip(file(zipSync({ 'items.json': [bytes, { os: 3, attrs: 0xa1ff0000 }] })), signal()),
  ).rejects.toThrow(/symlink/i);
  const corrupted = zipSync({ 'items.json': bytes }, { level: 0 });
  corrupted[40] = corrupted[40]! ^ 255;
  const index = await indexZip(file(corrupted), signal());
  await expect(readZipMember(index, 'items.json', 100, signal())).rejects.toThrow(/CRC/i);
});
it('rejects truncated and canceled archives before providing an index', async () => {
  await expect(indexZip(file(new Uint8Array(20)), signal())).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    indexZip(file(zipSync({ 'items.json': bytes })), controller.signal),
  ).rejects.toThrow();
});
it('rejects duplicate paths and an underdeclared compressed expansion before accepting its bytes', async () => {
  const repeated = zipSync({ 'items.json': bytes, 'rooms.json': bytes });
  const from = new TextEncoder().encode('rooms.json');
  const to = new TextEncoder().encode('items.json');
  for (let index = 0; index <= repeated.length - from.length; index++) {
    if (from.every((value, offset) => repeated[index + offset] === value)) repeated.set(to, index);
  }
  await expect(indexZip(file(repeated), signal())).rejects.toThrow(/Duplicate/);
  const expansion = zipSync({ 'items.json': new Uint8Array(1024 * 1024) }, { level: 9 });
  const view = new DataView(expansion.buffer);
  view.setUint32(22, 1, true);
  for (let offset = 0; offset < expansion.length - 46; offset++)
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, 1, true);
      break;
    }
  const index = await indexZip(file(expansion), signal());
  await expect(readZipMember(index, 'items.json', 100, signal())).rejects.toThrow(
    /Decompressed ZIP size/,
  );
});
