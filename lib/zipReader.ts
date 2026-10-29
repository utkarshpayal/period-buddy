import { inflateSync } from "fflate";

/**
 * A small zip reader for data exports, including password-protected ones.
 * Clue's export zip is locked with traditional PKWARE encryption
 * ("ZipCrypto"), which fflate can't open, so entries are read from the
 * central directory here, decrypted when needed, then inflated with fflate.
 * AES-encrypted zips aren't supported. Unit-tested in
 * lib/__tests__/zipReader.test.ts.
 */

export class ZipPasswordError extends Error {
  constructor(public readonly reason: "needed" | "wrong") {
    super(reason === "needed" ? "This zip file needs a password." : "That password didn't open the file.");
  }
}

export class ZipFormatError extends Error {}

export type ZipEntry = {
  name: string;
  size: number;
  encrypted: boolean;
};

type CentralEntry = ZipEntry & {
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  localOffset: number;
  modTime: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crcByte = (crc: number, byte: number) => (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcByte(crc, data[i]);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

function readCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  // End of central directory: searched from the end, past any comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError("Not a zip file.");
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);

  const entries: CentralEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new ZipFormatError("The zip file is damaged.");
    const flags = u16(bytes, at + 8);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    entries.push({
      name: flags & 0x800 ? new TextDecoderLite().decode(nameBytes) : String.fromCharCode(...nameBytes),
      flags,
      method: u16(bytes, at + 10),
      modTime: u16(bytes, at + 12),
      crc: u32(bytes, at + 16),
      compressedSize: u32(bytes, at + 20),
      size: u32(bytes, at + 24),
      localOffset: u32(bytes, at + 42),
      encrypted: Boolean(flags & 1),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** UTF-8 names without relying on TextDecoder (missing on some Hermes builds). */
class TextDecoderLite {
  decode(bytes: Uint8Array): string {
    try {
      return decodeURIComponent(Array.from(bytes, (b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

/** Traditional PKWARE decryption of one entry's data (12-byte header first). */
function zipCryptoDecrypt(data: Uint8Array, password: string, checkByte: number): Uint8Array | null {
  let k0 = 0x12345678;
  let k1 = 0x23456789;
  let k2 = 0x34567890;
  const update = (byte: number) => {
    k0 = crcByte(k0, byte);
    k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    k2 = crcByte(k2, k1 >>> 24);
  };
  for (const byte of new TextEncoderLite().encode(password)) update(byte);

  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const temp = (k2 | 2) & 0xffff;
    const plain = data[i] ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    out[i] = plain;
    update(plain);
  }
  // The header's last byte is a quick password check.
  return out[11] === checkByte ? out.subarray(12) : null;
}

class TextEncoderLite {
  encode(text: string): Uint8Array {
    return new Uint8Array(Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0)));
  }
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  return readCentralDirectory(bytes).map(({ name, size, encrypted }) => ({ name, size, encrypted }));
}

/**
 * The files whose names pass `filter`, as bytes. Throws ZipPasswordError
 * when one is encrypted and the password is missing or wrong.
 */
export function readZip(
  bytes: Uint8Array,
  filter: (entry: ZipEntry) => boolean,
  password?: string,
): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of readCentralDirectory(bytes)) {
    if (!filter(entry)) continue;
    const at = entry.localOffset;
    if (u32(bytes, at) !== 0x04034b50) throw new ZipFormatError("The zip file is damaged.");
    const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
    let data = bytes.subarray(start, start + entry.compressedSize);

    if (entry.encrypted) {
      if (!password) throw new ZipPasswordError("needed");
      // With a data descriptor (flag 8) the check byte is the time's high byte.
      const check = entry.flags & 0x8 ? entry.modTime >>> 8 : entry.crc >>> 24;
      const plain = zipCryptoDecrypt(data, password, check);
      if (!plain) throw new ZipPasswordError("wrong");
      data = plain;
    }

    let content: Uint8Array;
    try {
      if (entry.method === 0) content = data;
      else if (entry.method === 8) content = inflateSync(data, { out: new Uint8Array(entry.size) });
      else throw new ZipFormatError("This zip file uses a format the app can't open.");
    } catch (err) {
      if (err instanceof ZipFormatError) throw err;
      // A wrong password passes the one-byte check about 1 time in 256.
      if (entry.encrypted) throw new ZipPasswordError("wrong");
      throw new ZipFormatError("The zip file is damaged.");
    }
    if (crc32(content) !== entry.crc) {
      if (entry.encrypted) throw new ZipPasswordError("wrong");
      throw new ZipFormatError("The zip file is damaged.");
    }
    out[entry.name] = content;
  }
  return out;
}
