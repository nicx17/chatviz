/**
 * Minimal random-access ZIP reader for WhatsApp exports.
 *
 * Exports with media can be several GB, so the archive is never loaded
 * whole. The central directory is read from the end of the file, and each
 * entry is sliced out of the Blob only when asked for:
 *   - stored entries (most media, which is already compressed) become
 *     zero-copy Blob slices of the original file
 *   - deflated entries are inflated one at a time
 * Zip64 archives (over 4 GB or 65,535 entries) are supported.
 */

import { inflateSync } from 'fflate';

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const MAX_COMMENT = 0xffff;

const INVALID = 'not a valid zip file';
const utf8 = new TextDecoder();

async function readBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u64(dv, at) {
  return Number(dv.getBigUint64(at, true));
}

/**
 * Locates the central directory via the end-of-central-directory record
 * (and the Zip64 record when the classic fields are saturated).
 */
async function readDirectoryLocation(blob) {
  const tailStart = Math.max(0, blob.size - EOCD_SIZE - MAX_COMMENT - ZIP64_LOCATOR_SIZE);
  const tail = await readBytes(blob, tailStart, blob.size);
  const dv = view(tail);

  let at = tail.length - EOCD_SIZE;
  while (at >= 0 && dv.getUint32(at, true) !== EOCD_SIG) at--;
  if (at < 0) throw new Error(INVALID);

  let count = dv.getUint16(at + 10, true);
  let size = dv.getUint32(at + 12, true);
  let offset = dv.getUint32(at + 16, true);

  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const loc = at - ZIP64_LOCATOR_SIZE;
    if (loc < 0 || dv.getUint32(loc, true) !== ZIP64_LOCATOR_SIG) throw new Error(INVALID);
    const recordAt = u64(dv, loc + 8);
    const record = await readBytes(blob, recordAt, recordAt + 56);
    if (record.length < 56 || view(record).getUint32(0, true) !== ZIP64_EOCD_SIG) throw new Error(INVALID);
    count = u64(view(record), 32);
    size = u64(view(record), 40);
    offset = u64(view(record), 48);
  }
  return { offset, size, count };
}

function parseDirectory(bytes, count) {
  const dv = view(bytes);
  const entries = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== CENTRAL_SIG) throw new Error(INVALID);
    const flags = dv.getUint16(at + 8, true);
    const method = dv.getUint16(at + 10, true);
    let compressedSize = dv.getUint32(at + 20, true);
    let size = dv.getUint32(at + 24, true);
    const nameLength = dv.getUint16(at + 28, true);
    const extraLength = dv.getUint16(at + 30, true);
    const commentLength = dv.getUint16(at + 32, true);
    let localOffset = dv.getUint32(at + 42, true);
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // Zip64 extra field: holds only the saturated values, in this order
    const extraEnd = at + 46 + nameLength + extraLength;
    for (let x = at + 46 + nameLength; x + 4 <= extraEnd; x += 4 + dv.getUint16(x + 2, true)) {
      if (dv.getUint16(x, true) !== 0x0001) continue;
      let field = x + 4;
      if (size === 0xffffffff) {
        size = u64(dv, field);
        field += 8;
      }
      if (compressedSize === 0xffffffff) {
        compressedSize = u64(dv, field);
        field += 8;
      }
      if (localOffset === 0xffffffff) localOffset = u64(dv, field);
    }

    entries.push({ name, method, encrypted: (flags & 1) !== 0, compressedSize, size, localOffset });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** Offset of an entry's data (local header name/extra lengths can differ). */
async function dataStart(blob, entry) {
  const header = await readBytes(blob, entry.localOffset, entry.localOffset + 30);
  const dv = view(header);
  if (header.length < 30 || dv.getUint32(0, true) !== LOCAL_SIG) throw new Error(INVALID);
  return entry.localOffset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
}

/**
 * Lists a zip's entries without reading their contents.
 *
 * @param {Blob} blob - The archive (usually the user's File)
 * @returns {Promise<Array<{ name: string, size: number, blob(type?: string): Promise<Blob> }>>}
 * @throws {Error} 'not a valid zip file'
 */
export async function openZip(blob) {
  if (blob.size < EOCD_SIZE) throw new Error(INVALID);
  const { offset, size, count } = await readDirectoryLocation(blob);
  const entries = parseDirectory(await readBytes(blob, offset, offset + size), count);

  return entries.map((entry) => ({
    name: entry.name,
    size: entry.size,
    async blob(type = '') {
      if (entry.encrypted) throw new Error(`${entry.name} is password-protected`);
      const start = await dataStart(blob, entry);
      const data = blob.slice(start, start + entry.compressedSize, type);
      if (entry.method === 0) return data;
      if (entry.method === 8) {
        const out = new Uint8Array(entry.size);
        return new Blob([inflateSync(new Uint8Array(await data.arrayBuffer()), { out })], { type });
      }
      throw new Error(`${entry.name} uses an unsupported compression method`);
    },
  }));
}
