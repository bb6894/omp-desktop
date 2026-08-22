import { encodeLocalFrame, LocalFrameDecoder } from "./local-frame";
import type { SessionService } from "./session-service";

export type LocalByteWriter = {
  write(bytes: Uint8Array): unknown;
};

/** Serves a bounded, ordered local protocol; a malformed frame stops dispatch before OMP is called. */
export async function serveLocalHost(
  source: AsyncIterable<Uint8Array>,
  writer: LocalByteWriter,
  sessions: SessionService
): Promise<void> {
  const decoder = new LocalFrameDecoder();
  for await (const chunk of source) {
    for (const request of decoder.push(chunk)) {
      const response = await sessions.dispatch(request);
      await writer.write(encodeLocalFrame(response));
    }
  }
  decoder.finish();
}
