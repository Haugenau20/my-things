// Web Crypto has no MD5. Cloud Storage reports each object's MD5 (base64) in its metadata, so
// comparing it with the digest of the bytes just sent verifies an upload without downloading it.
// MD5 is used only as Cloud Storage's integrity checksum here, never for security decisions.
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const CONSTANTS = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0,
);

export function md5(bytes: Uint8Array): Uint8Array {
  const length = bytes.length;
  const padded = new Uint8Array((((length + 8) >>> 6) + 1) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  // The message length in bits as a 64-bit little-endian integer.
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(length / 2 ** 29), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; ++index)
      words[index] = view.getUint32(offset + index * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; ++index) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const sum = (a + f + CONSTANTS[index]! + words[g]!) >>> 0;
      const shift = SHIFTS[index]!;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const digest = new Uint8Array(16);
  const output = new DataView(digest.buffer);
  [a0, b0, c0, d0].forEach((value, index) => output.setUint32(index * 4, value, true));
  return digest;
}

/** The digest in the base64 form Cloud Storage uses for `md5Hash`. */
export function md5Base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of md5(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
