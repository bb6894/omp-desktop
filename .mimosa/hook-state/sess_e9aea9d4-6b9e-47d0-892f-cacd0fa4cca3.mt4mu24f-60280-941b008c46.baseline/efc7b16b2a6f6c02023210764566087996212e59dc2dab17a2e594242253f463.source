export const MAX_LOCAL_FRAME_BYTES = 16 * 1024 * 1024;

export class LocalProtocolError extends Error {
  constructor(readonly code: "LOCAL_PROTOCOL_ERROR", message: string) {
    super(message);
    this.name = "LocalProtocolError";
  }
}

function protocolError(message: string): LocalProtocolError {
  return new LocalProtocolError("LOCAL_PROTOCOL_ERROR", message);
}

export function encodeLocalFrame(value: unknown): Uint8Array {
  let payload: Uint8Array;
  try {
    payload = new TextEncoder().encode(JSON.stringify(value));
  } catch {
    throw protocolError("LOCAL_VALUE_NOT_SERIALIZABLE");
  }
  if (payload.byteLength === 0 || payload.byteLength > MAX_LOCAL_FRAME_BYTES) {
    throw protocolError("LOCAL_FRAME_SIZE_INVALID");
  }
  const output = new Uint8Array(4 + payload.byteLength);
  new DataView(output.buffer).setUint32(0, payload.byteLength, true);
  output.set(payload, 4);
  return output;
}

export function decodeLocalFrames(buffer: Uint8Array): { frames: unknown[]; remainder: Uint8Array } {
  let offset = 0;
  const frames: unknown[] = [];
  while (offset + 4 <= buffer.byteLength) {
    const length = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
    if (length === 0 || length > MAX_LOCAL_FRAME_BYTES) throw protocolError("LOCAL_FRAME_SIZE_INVALID");
    const end = offset + 4 + length;
    if (end > buffer.byteLength) break;
    let json: string;
    try {
      json = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offset + 4, end));
    } catch {
      throw protocolError("LOCAL_FRAME_NOT_UTF8");
    }
    try {
      frames.push(JSON.parse(json));
    } catch {
      throw protocolError("LOCAL_FRAME_NOT_JSON");
    }
    offset = end;
  }
  return { frames, remainder: buffer.slice(offset) };
}

export class LocalFrameDecoder {
  private remainder = new Uint8Array();

  push(chunk: Uint8Array): unknown[] {
    const input = new Uint8Array(this.remainder.byteLength + chunk.byteLength);
    input.set(this.remainder);
    input.set(chunk, this.remainder.byteLength);
    const decoded = decodeLocalFrames(input);
    this.remainder = decoded.remainder;
    return decoded.frames;
  }

  finish(): void {
    if (this.remainder.byteLength !== 0) throw protocolError("LOCAL_FRAME_TRUNCATED");
  }
}
