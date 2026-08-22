import { encodeLocalFrame, LocalFrameDecoder } from "./local-frame";
import type { SessionService } from "./session-service";
import type { HostEvent } from "./contracts";

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
  // Runtime events and command responses share one pipe. Serialize writes so
  // a streaming event can never interleave with a response frame.
  let writeQueue = Promise.resolve();
  const writeFrame = (value: unknown): Promise<void> => {
    const next = writeQueue.then(() => writer.write(encodeLocalFrame(value))).then(() => undefined);
    writeQueue = next.catch(() => undefined);
    return next;
  };
  sessions.setEventSink((event: HostEvent) => {
    void writeFrame(event);
  });
  for await (const chunk of source) {
    for (const request of decoder.push(chunk)) {
      const response = await sessions.dispatch(request);
      await writeFrame(response);
    }
  }
  decoder.finish();
  await writeQueue;
}
