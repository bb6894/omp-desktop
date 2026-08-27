import { expect, test } from "bun:test";
import { MAX_RPC_FRAME_BYTES, MAX_RPC_REASSEMBLED_BYTES, RpcFrameEncoder } from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-frame";
import { RpcLineDecoder } from "../src/rpc-bridge";

test("decodes split JSONL frames and protocol v2 chunk reassembly", () => {
  const encoder = new RpcFrameEncoder();
  encoder.setProtocolVersion(2);
  const logical = { type: "message_end", message: { role: "assistant", content: "x".repeat(MAX_RPC_FRAME_BYTES + 100) } };
  const wire = [...encoder.encodeFrames(logical)].join("");
  const decoder = new RpcLineDecoder();
  const frames = [
    ...decoder.push(Buffer.from(wire.slice(0, 137))),
    ...decoder.push(Buffer.from(wire.slice(137)))
  ];
  expect(frames).toHaveLength(1);
  expect(frames[0].type).toBe("message_end");
  expect((frames[0].message as { content: string }).content).toHaveLength(MAX_RPC_FRAME_BYTES + 100);
});

test("enforces physical, logical, JSON, and truncation limits", () => {
  const decoder = new RpcLineDecoder();
  expect(() => decoder.push(Buffer.from("{" + "x".repeat(MAX_RPC_FRAME_BYTES) + "}\n"))).toThrow("RPC_FRAME_TOO_LARGE");
  expect(() => new RpcLineDecoder().push(Buffer.from("not-json\n"))).toThrow("RPC_INVALID_JSON");
  expect(() => new RpcLineDecoder().push(Buffer.from("{\"type\":\"rpc_chunk\",\"chunkId\":\"x\",\"index\":0,\"count\":2,\"byteLength\":" + (MAX_RPC_REASSEMBLED_BYTES + 1) + ",\"data\":\"eA==\"}\n"))).toThrow("invalid rpc chunk metadata");
  const truncated = new RpcLineDecoder();
  truncated.push(Buffer.from("{\"type\":\"ready\"}"));
  expect(() => truncated.finish()).toThrow("RPC_TRUNCATED_FRAME");
});

test("rejects chunk sequences interrupted by another frame", () => {
  const decoder = new RpcLineDecoder();
  expect(() => decoder.push(Buffer.from("{\"type\":\"rpc_chunk\",\"chunkId\":\"x\",\"index\":0,\"count\":2,\"byteLength\":1048576,\"data\":\"eA==\"}\n{\"type\":\"ready\"}\n"))).toThrow("rpc chunk sequence interrupted");
});
