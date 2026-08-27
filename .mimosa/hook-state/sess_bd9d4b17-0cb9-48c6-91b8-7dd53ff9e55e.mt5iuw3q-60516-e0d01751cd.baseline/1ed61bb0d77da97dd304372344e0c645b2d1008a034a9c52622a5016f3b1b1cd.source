(function () {
  "use strict";

  async function inspectHarnessForSession(tauri, sessionId) {
    if (!tauri?.core || typeof tauri.core.invoke !== "function" || typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("HARNESS_NOT_CONNECTED");
    }
    return tauri.core.invoke("inspect_harness", { sessionId });
  }

  window.inspectHarnessForSession = inspectHarnessForSession;
})();
