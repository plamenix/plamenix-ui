/**
 * Magic-byte sniffer for BLOB previews.
 *
 * The driver ships every BLOB as a lower-case hex string (`ColumnValue::Blob`
 * in plamenix-db). The viewer decodes those bytes, picks a default tab
 * (text / image / hex), and chooses a MIME label. The sniff intentionally
 * covers only the popular formats — exotic types fall through to hex.
 */

/** Result of sniffing a BLOB's leading bytes. */
export interface BlobMime {
  /** Best-guess MIME type. `application/octet-stream` when unknown. */
  mime: string;
  /** Tab the viewer should default to. */
  defaultTab: 'hex' | 'text' | 'preview';
  /** Human-readable label for the format chip in the viewer header. */
  label: string;
}

/** Decodes the driver's hex-encoded BLOB string into a `Uint8Array`.
 *  Tolerates odd-length input by ignoring the trailing nibble — Firebird
 *  never produces odd-length blobs in practice, this is just defensive. */
export function decodeHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Re-encodes a byte array to a base64 string suitable for a
 *  `data:` URI. Chunked through `String.fromCharCode` so very large
 *  blobs don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

const IMAGE_SIGS: { sig: number[]; mime: string; label: string }[] = [
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png', label: 'PNG' },
  { sig: [0xff, 0xd8, 0xff], mime: 'image/jpeg', label: 'JPEG' },
  { sig: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif', label: 'GIF' },
  { sig: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif', label: 'GIF' },
  { sig: [0x42, 0x4d], mime: 'image/bmp', label: 'BMP' },
  { sig: [0x00, 0x00, 0x01, 0x00], mime: 'image/x-icon', label: 'ICO' },
];

const OTHER_SIGS: { sig: number[]; mime: string; label: string }[] = [
  { sig: [0x25, 0x50, 0x44, 0x46, 0x2d], mime: 'application/pdf', label: 'PDF' },
  { sig: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip', label: 'ZIP' },
  { sig: [0x1f, 0x8b], mime: 'application/gzip', label: 'GZIP' },
  { sig: [0x7f, 0x45, 0x4c, 0x46], mime: 'application/x-elf', label: 'ELF' },
  { sig: [0x4d, 0x5a], mime: 'application/x-msdownload', label: 'EXE' },
  { sig: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00], mime: 'application/x-sqlite3', label: 'SQLite' },
];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAIL = [0x57, 0x45, 0x42, 0x50];

function looksLikeWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (!startsWith(bytes, WEBP_RIFF)) return false;
  for (let i = 0; i < 4; i++) if (bytes[8 + i] !== WEBP_TAIL[i]) return false;
  return true;
}

/** Returns `true` when the bytes parse as UTF-8 (allowing an optional
 *  BOM and rejecting NULL bytes — Firebird stores binary BLOBs that
 *  occasionally contain accidental ASCII runs, but those almost always
 *  carry a NULL within the first 256 bytes). */
function looksLikeUtf8(bytes: Uint8Array): boolean {
  const slice = bytes.subarray(0, Math.min(bytes.length, 2048));
  if (slice.length === 0) return false;
  let i = 0;
  if (slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) i = 3;
  for (; i < slice.length; i++) {
    const b = slice[i]!;
    if (b === 0x00) return false;
    if (b < 0x80) continue;
    let extras: number;
    if ((b & 0xe0) === 0xc0) extras = 1;
    else if ((b & 0xf0) === 0xe0) extras = 2;
    else if ((b & 0xf8) === 0xf0) extras = 3;
    else return false;
    for (let j = 0; j < extras; j++) {
      const next = slice[++i];
      if (next === undefined || (next & 0xc0) !== 0x80) return false;
    }
  }
  return true;
}

/** Decides which preview tab to default to + the MIME chip label. */
export function sniffBlob(bytes: Uint8Array): BlobMime {
  if (bytes.length === 0) {
    return { mime: 'application/octet-stream', defaultTab: 'hex', label: 'empty' };
  }
  for (const entry of IMAGE_SIGS) {
    if (startsWith(bytes, entry.sig)) {
      return { mime: entry.mime, defaultTab: 'preview', label: entry.label };
    }
  }
  if (looksLikeWebp(bytes)) {
    return { mime: 'image/webp', defaultTab: 'preview', label: 'WEBP' };
  }
  for (const entry of OTHER_SIGS) {
    if (startsWith(bytes, entry.sig)) {
      const defaultTab = entry.mime === 'application/pdf' ? 'preview' : 'hex';
      return { mime: entry.mime, defaultTab, label: entry.label };
    }
  }
  if (looksLikeUtf8(bytes)) {
    return { mime: 'text/plain', defaultTab: 'text', label: 'text' };
  }
  return { mime: 'application/octet-stream', defaultTab: 'hex', label: 'binary' };
}
