/**
 * Ambient typing for the Tauri v2 global API surface this renderer uses.
 * Mirrors ONLY the call sites characterized in legacy `src/live.js` — the
 * injected seams in `tauri-product-bridge.ts` pin this contract for tests,
 * so nothing else may be assumed about `window.__TAURI__`.
 */
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
      event: {
        listen(
          event: string,
          handler: (event: { payload: unknown }) => void
        ): Promise<() => void>;
      };
    };
  }
}

export {};
