// .fhs session recording format
// header (16 bytes): "FHS1" | u16 version | u16 reserved | f64 startEpochMs
// records: u32 tOffsetMs | u16 len | len bytes raw packet

export const FHS_MAGIC = 'FHS1';
export const FHS_VERSION = 1;
export const FHS_HEADER = 16;

export function encodeHeader(startEpochMs: number): Uint8Array {
  const b = new Uint8Array(FHS_HEADER);
  const v = new DataView(b.buffer);
  for (let i = 0; i < 4; i++) b[i] = FHS_MAGIC.charCodeAt(i);
  v.setUint16(4, FHS_VERSION, true);
  v.setFloat64(8, startEpochMs, true);
  return b;
}

export function encodeRecord(tOffsetMs: number, packet: Uint8Array): Uint8Array {
  const b = new Uint8Array(6 + packet.byteLength);
  const v = new DataView(b.buffer);
  v.setUint32(0, Math.max(0, Math.round(tOffsetMs)), true);
  v.setUint16(4, packet.byteLength, true);
  b.set(packet, 6);
  return b;
}

export interface FhsRecord {
  t: number;
  packet: Uint8Array;
}

export interface FhsFile {
  startEpochMs: number;
  records: FhsRecord[];
  /** true when the file ended in the middle of a record */
  truncated: boolean;
}

export function decodeFhs(data: Uint8Array): FhsFile {
  if (data.byteLength < FHS_HEADER) throw new Error('File too short');
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== FHS_MAGIC) throw new Error('Not an FHS recording');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const startEpochMs = v.getFloat64(8, true);
  const records: FhsRecord[] = [];
  let o = FHS_HEADER;
  let truncated = false;
  while (o < data.byteLength) {
    if (o + 6 > data.byteLength) {
      truncated = true;
      break;
    }
    const t = v.getUint32(o, true);
    const len = v.getUint16(o + 4, true);
    if (o + 6 + len > data.byteLength) {
      truncated = true;
      break;
    }
    records.push({ t, packet: data.subarray(o + 6, o + 6 + len) });
    o += 6 + len;
  }
  return { startEpochMs, records, truncated };
}
