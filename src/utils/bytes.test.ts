import { describe, expect, it } from 'vitest';
import { decodeBase64, decodeText, hexDump, recoveredFileName } from './bytes';

const bytes = (...values: number[]) => Uint8Array.from(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

describe('decodeBase64', () => {
  it('round-trips binary content exactly', () => {
    expect(Array.from(decodeBase64('AP9/gA==')!)).toEqual([0x00, 0xff, 0x7f, 0x80]);
  });

  it('returns null for malformed input instead of throwing', () => {
    expect(decodeBase64('not base64!')).toBeNull();
  });
});

describe('decodeText', () => {
  it('decodes plain UTF-8 text, including newlines and tabs', () => {
    expect(decodeText(utf8('line one\n\tline two\r\n'))).toBe('line one\n\tline two\r\n');
  });

  it('decodes UTF-16LE when it carries a BOM, as Windows tools often write', () => {
    const text = 'hidden';
    const encoded = new Uint8Array(2 + text.length * 2);
    encoded.set([0xff, 0xfe]);
    [...text].forEach((char, i) => encoded.set([char.charCodeAt(0), 0], 2 + i * 2));
    expect(decodeText(encoded)).toBe('hidden');
  });

  it('refuses binary content rather than rendering mojibake', () => {
    expect(decodeText(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03))).toBeNull(); // PE header
  });

  it('refuses invalid UTF-8', () => {
    expect(decodeText(bytes(0x66, 0x6f, 0xc3))).toBeNull();
  });
});

describe('hexDump', () => {
  it('formats offset, two hex groups and printable ASCII', () => {
    const [line] = hexDump(utf8('ABCDEFGHIJKLMNOP')).split('\n');
    expect(line).toBe(
      '00000000  41 42 43 44 45 46 47 48  49 4a 4b 4c 4d 4e 4f 50  |ABCDEFGHIJKLMNOP|'
    );
  });

  it('replaces non-printable bytes with dots and pads short lines', () => {
    expect(hexDump(bytes(0x00, 0x41, 0x0a))).toBe(
      '00000000  00 41 0a' + ' '.repeat(15) + '  ' + ' '.repeat(23) + '  |.A.|'
    );
  });

  it('stops at the limit', () => {
    expect(hexDump(new Uint8Array(64), 32).split('\n')).toHaveLength(2);
  });
});

describe('recoveredFileName', () => {
  it('prefixes the record number so same-named deleted files cannot collide', () => {
    expect(recoveredFileName(42, 'notes.txt')).toBe('recovered-42-notes.txt');
  });

  it('strips characters Windows will not accept in a filename', () => {
    expect(recoveredFileName(7, 'a:b*c?.txt')).toBe('recovered-7-a_b_c_.txt');
  });
});
