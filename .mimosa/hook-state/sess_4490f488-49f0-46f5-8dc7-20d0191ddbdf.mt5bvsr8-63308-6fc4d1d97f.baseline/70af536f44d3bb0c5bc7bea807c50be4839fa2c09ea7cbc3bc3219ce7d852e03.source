import { expect, test } from "bun:test";
import { encodeLocalFrame, LocalFrameDecoder, MAX_LOCAL_FRAME_BYTES } from "../src/local-frame";

test("encodes and decodes complete, partial, and coalesced local frames", () => {
  const first = encodeLocalFrame({ type: "one", value: 1 });
  const second = encodeLocalFrame({ type: "two", value: [2] });
  const wire = new Uint8Array(first.byteLength + second.byteLength);
  wire.set(first);
  wire.set(second, first.byteLength);
  const decoder = new LocalFrameDecoder();
  expect(decoder.push(wire.subarray(0, 5))).toEqual([]);
  expect(decoder.push(wire.subarray(5))).toEqual([
    { type: "one", value: 1 },
    { type: "two", value: [2] }
  ]);
  decoder.finish();
});

test("rejects zero, oversized, non-UTF8, non-JSON, and truncated local frames", () => {
  const length = new Uint8Array(4);
  expect(() => new LocalFrameDecoder().push(length)).toThrow("LOCAL_FRAME_SIZE_INVALID");

  new DataView(length.buffer).setUint32(0, MAX_LOCAL_FRAME_BYTES + 1, true);
  expect(() => new LocalFrameDecoder().push(length)).toThrow("LOCAL_FRAME_SIZE_INVALID");

  const invalidUtf8 = new Uint8Array([1, 0, 0, 0, 0xff]);
  expect(() => new LocalFrameDecoder().push(invalidUtf8)).toThrow("LOCAL_FRAME_NOT_UTF8");

  const invalidJson = new TextEncoder().encode("x");
  const invalidJsonFrame = new Uint8Array(4 + invalidJson.byteLength);
  new DataView(invalidJsonFrame.buffer).setUint32(0, invalidJson.byteLength, true);
  invalidJsonFrame.set(invalidJson, 4);
  expect(() => new LocalFrameDecoder().push(invalidJsonFrame)).toThrow("LOCAL_FRAME_NOT_JSON");

  const decoder = new LocalFrameDecoder();
  decoder.push(encodeLocalFrame({ ok: true }).subarray(0, 6));
  expect(() => decoder.finish()).toThrow("LOCAL_FRAME_TRUNCATED");
});

test("rejects values that cannot fit in the local protocol", () => {
  expect(() => encodeLocalFrame(undefined)).toThrow("LOCAL_FRAME_SIZE_INVALID");
  expect(() => encodeLocalFrame({ text: "x".repeat(MAX_LOCAL_FRAME_BYTES) })).toThrow("LOCAL_FRAME_SIZE_INVALID");
});
