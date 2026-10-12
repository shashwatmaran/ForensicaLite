/**
 * Byte-level helpers for recovered content.
 *
 * Recovered bytes are evidence, so they are handled as bytes: decoded once from
 * base64, shown as text only when they actually are text, and downloaded
 * unaltered. Rendering arbitrary binary through a text decoder would show
 * replacement characters and invite the reader to trust a corrupted view.
 */

export const decodeBase64 = (base64: string): Uint8Array | null => {
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

/**
 * Decodes as UTF-8 if the bytes are plausibly text, otherwise returns null.
 *
 * Plausible means: valid UTF-8 (a leading BOM is allowed) and no control
 * characters other than tab, newline, carriage return and form feed. UTF-16
 * text — common for files written by Windows tools — is detected by its BOM.
 */
export const decodeText = (bytes: Uint8Array): string | null => {
  if (bytes.length === 0) return '';

  let text: string;
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    } else {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    }
  } catch {
    return null;
  }

  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text) ? null : text;
};

const toHex = (value: number, width: number) => value.toString(16).padStart(width, '0');

/**
 * A classic 16-bytes-per-line hex dump: offset, hex bytes, printable ASCII.
 * `limit` caps the number of bytes rendered; the caller says so in the UI.
 */
export const hexDump = (bytes: Uint8Array, limit = bytes.length): string => {
  const end = Math.min(bytes.length, limit);
  const lines: string[] = [];

  for (let offset = 0; offset < end; offset += 16) {
    const row = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(row, (b) => toHex(b, 2));
    const left = hex.slice(0, 8).join(' ');
    const right = hex.slice(8).join(' ');
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${toHex(offset, 8)}  ${left.padEnd(23)}  ${right.padEnd(23)}  |${ascii}|`);
  }

  return lines.join('\n');
};

/** Hands the bytes to the browser as a file download. Nothing leaves the machine. */
export const downloadBytes = (bytes: Uint8Array, fileName: string, type = 'application/octet-stream') => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been dispatched, not synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Filename for a recovered artifact. Prefixed with the record number so two
 * deleted files that shared a name cannot collide, and stripped of characters
 * Windows refuses in a filename.
 */
export const recoveredFileName = (recordNumber: number, fileName: string): string => {
  // eslint-disable-next-line no-control-regex
  const safe = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'unnamed';
  return `recovered-${recordNumber}-${safe}`;
};
