import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5, md5Base64 } from '../../src/media/md5';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const text = (value: string) => new TextEncoder().encode(value);

describe('md5', () => {
  it('matches the RFC 1321 test suite', () => {
    const vectors: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['a', '0cc175b9c0f1b6a831c399e269772661'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        'd174ab98d277d9f5a5611c2c9f419d9f',
      ],
      [
        '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
        '57edf4a22be3c955ac49da2e2107b67a',
      ],
    ];
    for (const [input, expected] of vectors) expect(hex(md5(text(input)))).toBe(expected);
  });

  it('matches Node across block boundaries and photo-sized inputs', () => {
    const sizes = [55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 524288, 3 * 1024 * 1024 + 7];
    for (const size of sizes) {
      const bytes = new Uint8Array(randomBytes(size));
      expect(md5Base64(bytes)).toBe(createHash('md5').update(bytes).digest('base64'));
    }
  });
});
