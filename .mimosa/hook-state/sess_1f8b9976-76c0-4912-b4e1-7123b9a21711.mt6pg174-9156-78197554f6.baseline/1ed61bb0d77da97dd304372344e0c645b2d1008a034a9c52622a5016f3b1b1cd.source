(function () {
  "use strict";

  // Payloads carry only the renderer-allowed fields; project binding,
  // compatibility, timestamps, evidence, ids, digests, and paths are derived
  // Host-side and must never appear here.
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function requireInvoke(tauri) {
    if (!tauri?.core || typeof tauri.core.invoke !== "function") {
      throw new Error("HARNESS_NOT_CONNECTED");
    }
    return tauri.core;
  }

  function requireSession(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("HARNESS_SESSION_REQUIRED");
    }
  }

  function isNonBlankText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  async function inspectHarnessForSession(tauri, sessionId) {
    requireInvoke(tauri);
    requireSession(sessionId);
    return tauri.core.invoke("inspect_harness", { sessionId });
  }

  async function previewHarnessMemoryForSession(tauri, sessionId, payload) {
    requireInvoke(tauri);
    requireSession(sessionId);
    if (!isRecord(payload)) throw new Error("HARNESS_INVALID_REQUEST");
    const keys = Object.keys(payload);
    if (payload.operation === "memory.add") {
      if (keys.length !== 3 || !["operation", "title", "content"].every((key) => keys.includes(key))) {
        throw new Error("HARNESS_INVALID_REQUEST");
      }
    } else if (payload.operation === "memory.replace") {
      if (keys.length !== 4 || !["operation", "title", "content", "targetId"].every((key) => keys.includes(key))) {
        throw new Error("HARNESS_INVALID_REQUEST");
      }
      if (!isNonBlankText(payload.targetId)) throw new Error("HARNESS_INVALID_REQUEST");
    } else {
      throw new Error("HARNESS_INVALID_REQUEST");
    }
    if (!isNonBlankText(payload.title) || !isNonBlankText(payload.content)) {
      throw new Error("HARNESS_INVALID_REQUEST");
    }
    const args = { sessionId, operation: payload.operation, title: payload.title, content: payload.content };
    if (payload.operation === "memory.replace") args.targetId = payload.targetId;
    return tauri.core.invoke("preview_harness_memory", args);
  }

  async function applyHarnessMemoryForSession(tauri, sessionId, preview, approval) {
    requireInvoke(tauri);
    requireSession(sessionId);
    if (!isRecord(preview) || !isRecord(approval)) throw new Error("HARNESS_INVALID_REQUEST");
    const approvalKeys = Object.keys(approval);
    if (approvalKeys.length !== 2 || !approvalKeys.includes("approvedBy") || !approvalKeys.includes("reason")) {
      throw new Error("HARNESS_INVALID_REQUEST");
    }
    if (!isNonBlankText(approval.approvedBy) || !isNonBlankText(approval.reason)) {
      throw new Error("HARNESS_INVALID_REQUEST");
    }
    return tauri.core.invoke("apply_harness_memory", {
      sessionId,
      preview,
      approvedBy: approval.approvedBy,
      reason: approval.reason
    });
  }

  async function rollbackHarnessForSession(tauri, sessionId, reason) {
    requireInvoke(tauri);
    requireSession(sessionId);
    if (!isNonBlankText(reason)) throw new Error("HARNESS_INVALID_REQUEST");
    return tauri.core.invoke("rollback_harness", { sessionId, reason });
  }

  window.inspectHarnessForSession = inspectHarnessForSession;
  window.previewHarnessMemoryForSession = previewHarnessMemoryForSession;
  window.applyHarnessMemoryForSession = applyHarnessMemoryForSession;
  window.rollbackHarnessForSession = rollbackHarnessForSession;
})();
