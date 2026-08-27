import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductBridgeProvider, useProductBridge } from "./bridge/product-bridge";
import { resolveDefaultBridge } from "./bridge/tauri-product-bridge";
import {
  isForkable,
  newestRecordForProject,
  routesToProject,
  type SessionViewData
} from "./lib/session-lifecycle";
import { loadAppPreferences, resolveStartupSelection, saveAppPreferences } from "./lib/app-preferences";
import {
  emptyTimeline,
  mergeMessagePage,
  reduceTimeline,
  timelineFromMessages,
  type TimelineModel
} from "./lib/event-reducer";
import { attachSessionEvents } from "./lib/event-channel";
import { LeftRail, type RailMode } from "./ui/left-rail";
import { NewSessionPrompt } from "./ui/new-session-prompt";
import { RightPanel } from "./ui/right-panel";
import { Timeline } from "./ui/timeline";
import type { InteractionResponse } from "../../protocol/domain";
import { AskBubble } from "./ui/ask-bubble";
import type {
  WorkbenchState,
  ApprovalGrantOutcome,
  ApprovalRuleLists
} from "./bridge/product-bridge";
import { Composer } from "./ui/composer";
import { ErrorBoundary } from "./ui/error-boundary";
import { SettingsPage } from "./ui/settings-page";
import { WelcomePage } from "./ui/welcome-page";
import { CommandPalette } from "./ui/command-palette";

/** One-line human summary of a slash-command response payload. */
function summarizeCommandResult(data: Record<string, unknown>): string {
  if (typeof data.path === "string") return ` 已导出：${data.path}`;
  if (typeof data.sessionId === "string") return " 新会话已就绪。";
  if (data.usage !== undefined) return "";
  const keys = Object.keys(data);
  return keys.length > 0 ? ` (${keys.slice(0, 3).join(", ")})` : "";
}

type Transport = "tauri";

const STATE_LABEL: Record<SessionViewData["runtimeState"], string> = {
  idle: "空闲",
  running: "运行中",
  "waiting-user": "等待你处理",
  failed: "失败"
};

function Workbench({ transport }: { transport: Transport }) {
  const bridge = useProductBridge();
  const [views, setViews] = useState<SessionViewData[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, TimelineModel>>({});
  const [workbench, setWorkbench] = useState<WorkbenchState | null>(null);
  const [runtimeUpdate, setRuntimeUpdate] = useState<{ version: string; latestVersion: string | null; updateAvailable: boolean } | null>(null);
  const [approvalRules, setApprovalRules] = useState<ApprovalRuleLists | null>(null);
  const [railMode, setRailMode] = useState<RailMode>(null);
  const [railModeSessionId, setRailModeSessionId] = useState<string | null>(null);
  const [forkInput, setForkInput] = useState("");
  const [handoffInput, setHandoffInput] = useState("");

  // Decision B: uuid → Host child route that runs this desktop session.
  // Mirror for callbacks that must read the latest model without re-arming.
  const timelinesRef = useRef<Record<string, TimelineModel>>({});
  const activeRoute = useRef<string | null>(null);
  const routes = useRef(routesToProject());
  const offEvents = useRef<(() => void) | null>(null);
  const restored = useRef(false);
  const lastPrompts = useRef<Record<string, string>>({});
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent) => {
      setNotice(`未处理的拒绝：${String(event.reason?.message ?? event.reason)}`);
    };
    const onError = (event: ErrorEvent) => {
      setNotice(`脚本错误：${event.message}`);
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("error", onError);
    };
  }, []);

  const refresh = useCallback(async (): Promise<SessionViewData[]> => {
    const listing = await bridge.listSessions();
    // Defensive: a Host that omits `views` must never blank the window.
    setViews(Array.isArray(listing.views) ? listing.views : []);
    return Array.isArray(listing.views) ? listing.views : [];
  }, [bridge]);

  useEffect(() => {
    timelinesRef.current = timelines;
  }, [timelines]);

  const hydrate = useCallback(
    async (sessionId: string) => {
      try {
        const page = await bridge.listMessages(sessionId, null, 50);
        setTimelines((prev) => {
          const existing = prev[sessionId];
          return {
            ...prev,
            [sessionId]: existing ? mergeMessagePage(existing, page) : timelineFromMessages(page)
          };
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [bridge]
  );
  const loadWorkbench = useCallback(
    async (routeId: string) => {
      if (transport !== "tauri") return;
      try {
        setWorkbench(await bridge.fetchWorkbenchState(routeId));
      } catch {
        setWorkbench(null);
      }
    },
    [bridge, transport]
  );

  const armEvents = useCallback(
    async (routeId: string, boundId: string) => {
      // Switch discipline: tear the previous listeners down BEFORE arming the
      // next session's; the channel buffers live events while the journaled
      // replay fills anything missed while this session was detached.
      offEvents.current?.();
      const cached = timelinesRef.current[boundId];
      offEvents.current = await attachSessionEvents({
        subscribe: (handlers) => bridge.subscribeEvents(routeId, handlers),
        replay: (afterSeq) => bridge.replayTimeline(routeId, afterSeq),
        lastSeq: cached ? cached.lastSeq : null,
        apply: (event) => {
          setTimelines((prev) => ({
            ...prev,
            [boundId]: reduceTimeline(prev[boundId] ?? emptyTimeline(), event)
          }));
          // Side-band reactions: renames refresh the rail; runtime-side
          // config changes refresh the composer controls.
          if (event.kind === "session.info") void refresh();
          if (event.kind === "config.update") void loadWorkbench(routeId);
          if (event.kind === "runtime.update") {
            const info = (event as { info?: { version: string; latestVersion: string | null; updateAvailable: boolean } }).info;
            if (info) setRuntimeUpdate(info);
          }
          if (event.kind === "runtime.update") void loadWorkbench(routeId);
        },
        onExit: (reason) => setNotice(`会话进程已退出：${reason || "未知原因"}`),
        onDesync: () => void hydrate(boundId)
      });
    },
    [bridge, hydrate, loadWorkbench, refresh]
  );

  const activate = useCallback(
    (routeId: string | null) => {
      activeRoute.current = routeId;
      bridge.setActiveSession(routeId);
    },
    [bridge]
  );


  const refreshRules = useCallback(async () => {
    if (transport !== "tauri") return;
    try {
      setApprovalRules(await bridge.listApprovalRules());
    } catch {
      setApprovalRules(null);
    }
  }, [bridge, transport]);

  const addRule = useCallback(
    (tool: string, scope: "session" | "project", sourceInteractionId: string) => {
      void bridge
        .addApprovalRule(tool, scope, sourceInteractionId)
        .then((outcome: ApprovalGrantOutcome) => {
          if (outcome.created) {
            setNotice(scope === "project" ? `已记住：本项目内自动放行 ${tool}` : `已记住：本会话内自动放行 ${tool}`);
          }
        })
        .then(() => refreshRules())
        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
    },
    [bridge, refreshRules]
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      void bridge
        .removeApprovalRule(ruleId)
        .then(() => refreshRules())
        .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
    },
    [bridge, refreshRules]
  );

  const applySelection = useCallback(
    (sessionId: string, list: readonly SessionViewData[]) => {
      const view = list.find((item) => item.id === sessionId);
      if (!view) return;
      setSelectedId(sessionId);
      saveAppPreferences({ lastProjectPath: view.projectPath, lastSessionId: sessionId });
      if (transport !== "tauri") return;

      const ownedRoute = routes.current.get(sessionId);
      if (ownedRoute) {
        activate(ownedRoute);
        void armEvents(ownedRoute, sessionId);
        void hydrate(sessionId);
        void loadWorkbench(ownedRoute);
        void refreshRules();
      } else if (view.writeMode === "desktop-owned" && activeRoute.current !== null) {
        // A restart restores records before the renderer has a route map. Bind
        // the selected desktop session to the already-running default Host.
        const routeId = activeRoute.current;
        routes.current.set(sessionId, routeId);
        void (async () => {
          try {
            await bridge.openRuntimeSession(sessionId);
            activate(routeId);
            await armEvents(routeId, sessionId);
            await hydrate(sessionId);
            await loadWorkbench(routeId);
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
          }
        })();
      } else {
        // Read-only histories attach no event stream, but retain the control
        // route so fork/continue can still use the dedicated Host command.
        offEvents.current?.();
        offEvents.current = null;
        setWorkbench(null);
        void hydrate(sessionId);
      }
    },
    [activate, armEvents, bridge, hydrate, loadWorkbench, refreshRules, transport]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (transport === "tauri") {
          // lib.rs setup pre-starts the "default" child for this window.
          activate("default");
        }
        const list = await refresh();
        if (cancelled || restored.current) return;
        restored.current = true;
        const selection = resolveStartupSelection(loadAppPreferences(), list);
        if (selection) applySelection(selection, list);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
      offEvents.current?.();
      offEvents.current = null;
    };
  }, [activate, applySelection, bridge, refresh, transport]);

  const createSession = useCallback(
    async (message: string) => {
      if (transport !== "tauri" || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        const projectPath = newProjectPath ?? (views && views.length > 0 ? views[0].projectPath : "");
        if (!projectPath) {
          setNotice("请先选择一个项目文件夹。");
          return;
        }
        // The bridge mints and REGISTERS the route; adopt it as-is.
        const routeId = await bridge.createSession(projectPath);
        activate(routeId);
        await armEvents(routeId, `pending:${routeId}`);
        const startStatus = await bridge.sessionStatus(routeId);
        if (startStatus !== null) {
          routes.current.delete(`pending:${routeId}`);
          setNotice(`子进程启动失败：${startStatus}`);
          setBusy(false);
          return;
        }
        lastPrompts.current[`pending:${routeId}`] = message;
        // First turn persistence is async on the Runtime side — poll briefly.
        let record: SessionViewData | null = null;
        for (let attempt = 0; attempt < 40 && record === null; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const fresh = await refresh();
          record = newestRecordForProject(fresh, projectPath);
        }
        if (record === null) {
          setNotice("会话已发送；回复落盘后稍后会出现在列表中。");
          return;
        }
        for (const key of [...routes.current.keys()]) {
          if (key.startsWith("pending:") && routes.current.get(key) === routeId) {
            routes.current.delete(key);
          }
        }
        await bridge.openRuntimeSession(record.id);
        routes.current.set(record.id, routeId);
        if (lastPrompts.current[`pending:${routeId}`]) {
          lastPrompts.current[record.id] = lastPrompts.current[`pending:${routeId}`];
          delete lastPrompts.current[`pending:${routeId}`];
        }
        setSelectedId(record.id);
        saveAppPreferences({ lastProjectPath: record.projectPath, lastSessionId: record.id });
        await hydrate(record.id);
        await loadWorkbench(routeId);
        setNewProjectPath(null);
        setNotice(null);
      } finally {
        setBusy(false);
      }
    },
    [activate, armEvents, bridge, busy, hydrate, loadWorkbench, newProjectPath, refresh, transport, views]
  );

  const beginNewSession = useCallback(async () => {
    if (transport !== "tauri" || busy) return;
    const existingProject = views?.[0]?.projectPath;
    const projectPath = existingProject ?? (await bridge.openProjectPicker());
    if (!projectPath) return;
    setNewProjectPath(projectPath);
    setComposing(true);
  }, [bridge, busy, transport, views]);

  const continueHistory = useCallback(
    async (sessionId: string) => {
      const view = views?.find((item) => item.id === sessionId);
      if (!view || !isForkable(view)) return;
      setBusy(true);
      setNotice(null);
      try {
        // 1. Fork on the CURRENT route's child (copies bytes into the shared
        //    per-project directory; source stays untouched).
        const child = await bridge.forkSession(sessionId);
        // 2. A dedicated child route owns the continuation (decision B).
        const routeId = await bridge.createSession(view.projectPath);
        // 3. Bind that child's runtime to the forked file — the HOST derives
        //    the path internally (identity rule, T0.3 evidence).
        routes.current.set(child, routeId);
        activate(routeId);
        await bridge.openRuntimeSession(child);
        await armEvents(routeId, child);
        await hydrate(child);
        await loadWorkbench(routeId);
        setSelectedId(child);
        saveAppPreferences({ lastProjectPath: view.projectPath, lastSessionId: child });
        void refresh();
        setNotice(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [activate, armEvents, bridge, hydrate, loadWorkbench, refresh, views]
  );

  const respondInteraction = useCallback(
    async (interactionId: string, response: InteractionResponse) => {
      if (!selectedId) return;
      const route = routes.current.get(selectedId);
      if (!route) return;
      setBusy(true);
      try {
        await bridge.respondInteraction(route, interactionId, response);
        setTimelines((prev) => {
          const model = prev[selectedId];
          if (!model) return prev;
          return {
            ...prev,
            [selectedId]: {
              ...model,
              entries: model.entries.map((entry) =>
                entry.kind === "ask" && entry.id === interactionId
                  ? { ...entry, answered: true }
                  : entry
              )
            }
          };
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [bridge, selectedId]
  );

  const stopSession = useCallback(async () => {
    if (!selectedId) return;
    const route = routes.current.get(selectedId);
    if (!route) return;
    setBusy(true);
    try {
      await bridge.abortSession(route);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [bridge, refresh, selectedId]);

  const retryLastPrompt = useCallback(async () => {
    if (!selectedId) return;
    const last = lastPrompts.current[selectedId];
    const route = routes.current.get(selectedId);
    if (!last || !route) return;
    setBusy(true);
    try {
      await bridge.sendPrompt(route, last);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [bridge, refresh, selectedId]);
  const renameSession = useCallback(
    async (sessionId: string, name: string) => {
      const route = routes.current.get(sessionId);
      if (!route) return;
      try {
        await bridge.renameSession(route, name);
        await refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [bridge, refresh]
  );

  const openForkMode = useCallback((sessionId: string) => {
    setRailMode("fork");
    setRailModeSessionId(sessionId);
    setForkInput("");
    setHandoffInput("");
  }, []);

  const openHandoffMode = useCallback((sessionId: string) => {
    setRailMode("handoff");
    setRailModeSessionId(sessionId);
    setForkInput("");
    setHandoffInput("");
  }, []);

  const cancelRailMode = useCallback(() => {
    setRailMode(null);
    setRailModeSessionId(null);
    setForkInput("");
    setHandoffInput("");
  }, []);

  const confirmFork = useCallback(async () => {
    const sessionId = railModeSessionId;
    const entryId = forkInput.trim();
    if (!sessionId || !entryId) return;
    const route = routes.current.get(sessionId);
    if (!route) return;
    setBusy(true);
    cancelRailMode();
    try {
      const data = await bridge.runAgentCommand(route, { type: "branch", entryId });
      const newId = typeof data.sessionId === "string" ? data.sessionId : null;
      if (newId) {
        await refresh();
        const fresh = await refresh();
        applySelection(newId, fresh);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [bridge, cancelRailMode, forkInput, railModeSessionId, refresh, applySelection]);

  const confirmHandoff = useCallback(async () => {
    const sessionId = railModeSessionId;
    const customInstructions = handoffInput.trim();
    if (!sessionId) return;
    const route = routes.current.get(sessionId);
    if (!route) return;
    setBusy(true);
    cancelRailMode();
    try {
      const cmd = customInstructions.length > 0
        ? { type: "handoff", customInstructions }
        : { type: "handoff" };
      const data = await bridge.runAgentCommand(route, cmd);
      const newId = typeof data.sessionId === "string" ? data.sessionId : null;
      if (newId) {
        await refresh();
        const fresh = await refresh();
        applySelection(newId, fresh);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [bridge, cancelRailMode, handoffInput, railModeSessionId, refresh, applySelection]);


  // Callback for WelcomePage when no session is selected
  const sendPromptForWelcome = useCallback(async (message: string) => {
    if (!selectedId) return;
    const route = routes.current.get(selectedId);
    if (!route) return;
    try {
      await bridge.sendPrompt(route, message);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [bridge, refresh, selectedId]);

  const selected = useMemo(
    () => views?.find((view) => view.id === selectedId) ?? null,
    [views, selectedId]
  );
  const timelineForSelected = selectedId
    ? timelines[selectedId] ?? emptyTimeline()
    : emptyTimeline();
  const readonlySelected = selected?.writeMode === "history-readonly";
  const pendingAsks = timelineForSelected.entries.filter(
    (entry): entry is Extract<typeof entry, { kind: "ask" }> =>
      entry.kind === "ask" && !entry.answered
  );

  const resolveRoute = useCallback(
    (sessionId: string): string | null => routes.current.get(sessionId) ?? null,
    []
  );

  if (views === null) {
    return (
      <div className="workbench-shell workbench-shell--loading" role="status">
        <div className="workbench-loading__mark">OMP</div>
        <span>正在加载会话…</span>
      </div>
    );
  }

  return (
    <div className="workbench-shell">
      <header className="workbench-topbar">
        <div className="workbench-topbar__brand">
          <span className="workbench-topbar__mark">OMP</span>
          <span className="workbench-topbar__divider" aria-hidden="true" />
          <span>桌面工作台</span>
        </div>
        <div className="workbench-topbar__context">
          <span className="workbench-topbar__context-label">项目</span>
          <span className="workbench-topbar__context-value">
            {selected?.projectPath || "尚未选择"}
          </span>
        </div>
        <span className="workbench-topbar__mode">{transport === "tauri" ? "已连接" : "演示数据"}</span>
      </header>
      <div className="workbench">
        <LeftRail
          views={views}
          selectedId={selectedId}
          onSelect={(id) => {
            if (railMode === "fork") openForkMode(id);
            else if (railMode === "handoff") openHandoffMode(id);
            else applySelection(id, views);
          }}
          onContinue={transport === "tauri" ? (id) => void continueHistory(id) : undefined}
          onNewSession={transport === "tauri" ? () => void beginNewSession() : undefined}
          canCreate={transport === "tauri"}
          onRename={transport === "tauri" ? renameSession : undefined}
          mode={railMode}
          modeSessionId={railModeSessionId}
          forkInput={forkInput}
          handoffInput={handoffInput}
          onForkInput={setForkInput}
          onHandoffInput={setHandoffInput}
          onConfirmFork={confirmFork}
          onConfirmHandoff={confirmHandoff}
          onCancel={cancelRailMode}
        />
        <main className="center-session" aria-label="当前会话">
          {composing ? (
            <NewSessionPrompt
              busy={busy}
                    onCancel={() => {
                      setComposing(false);
                      setNewProjectPath(null);
                    }}
                    projectPath={newProjectPath}
              onSubmit={(message) => {
                setComposing(false);
                void createSession(message);
              }}
            />
          ) : selected ? (
            <>
              <header className="center-session__header">
                <div className="center-session__heading">
                  <p className="center-session__eyebrow">当前会话</p>
                  <h1 className="center-session__title">{selected.title}</h1>
                </div>
                <span className={`status-pill status-pill--${selected.runtimeState}`}>
                  <span className="status-pill__dot" aria-hidden="true" />
                  {STATE_LABEL[selected.runtimeState]}
                </span>
              </header>
              <div className="center-session__timeline">
                <Timeline
                  model={timelineForSelected}
                  emptyHint={readonlySelected ? "该来源暂无可展示的历史。" : "发送第一条指令开始这个会话。"}
                />
                {pendingAsks.map((ask) => (
                  <AskBubble
                    key={ask.id}
                    entry={ask}
                    busy={busy}
                    onAnswer={(interactionId, value) => void respondInteraction(interactionId, value)}
                    onAddRule={addRule}
                  />
                ))}
                {selected.runtimeState === "running" && (
                  <button
                    type="button"
                    className="button button--danger center-session__action"
                    disabled={busy}
                    onClick={() => void stopSession()}
                  >
                    停止当前会话
                  </button>
                )}
                {selected.runtimeState === "failed" && lastPrompts.current[selected.id] && (
                  <button
                    type="button"
                    className="button center-session__action"
                    disabled={busy}
                    onClick={() => void retryLastPrompt()}
                  >
                    重试上一条指令
                  </button>
                )}
                {selected.runtimeState === "failed" && (
                  <button
                    type="button"
                    className="button center-session__action"
                    disabled={busy}
                    onClick={() => applySelection(selected.id, views ?? [])}
                  >
                    重新绑定运行时
                  </button>
                )}
              </div>
              {readonlySelected ? (
                <p className="center-note">
                  只读来源不可直接写入；点击左侧「继续」以创建可写的桌面副本。
                </p>
              ) : (
                <Composer
                  workbench={workbench}
                  busy={busy || selected.runtimeState === "waiting-user"}
                  turnActive={(timelines[selected.id]?.turnActive ?? false)}
                  runtimeCommands={timelineForSelected.commands}
                  onSend={(text, images) => {
                    const route = resolveRoute(selected.id);
                    if (!route) {
                      setNotice("PRODUCT_NO_ACTIVE_SESSION");
                      return;
                    }
                    lastPrompts.current[selected.id] = text;
                    void bridge.sendPrompt(route, text, undefined, images).catch((error: unknown) =>
                      setNotice(error instanceof Error ? error.message : String(error))
                    );
                  }}
                  onSteer={(text, _images) => {
                    const route = resolveRoute(selected.id);
                    if (!route) return;
                    void bridge.steerSession(route, text).catch((error: unknown) =>
                      setNotice(error instanceof Error ? error.message : String(error))
                    );
                  }}
                  onSlashCommand={(command, rest) => {
                    const route = resolveRoute(selected.id);
                    if (!route) {
                      setNotice("PRODUCT_NO_ACTIVE_SESSION");
                      return;
                    }
                    if (command.kind === "runtime") {
                      const text = `/${command.name}${rest ? ` ${rest}` : ""}`;
                      const active = timelines[selected.id]?.turnActive ?? false;
                      // While a turn is live the Runtime queues slash prompts.
                      void bridge
                        .sendPrompt(route, text, active ? "followUp" : undefined)
                        .catch((error: unknown) =>
                          setNotice(error instanceof Error ? error.message : String(error))
                        );
                      return;
                    }
                    if (!command.build) return;
                    void bridge
                      .runAgentCommand(route, command.build(rest))
                      .then((data) => {
                        if (command.name === "copy" && typeof data.text === "string") {
                          void navigator.clipboard?.writeText(data.text).then(() =>
                            setNotice("已复制上次回复到剪贴板。")
                          );
                          return;
                        }
                        setNotice(`/${command.name} 已执行。` + summarizeCommandResult(data));
                      })
                      .catch((error: unknown) =>
                        setNotice(error instanceof Error ? error.message : String(error))
                      );
                  }}
                  onRunBash={(shell) => {
                    const route = resolveRoute(selected.id);
                    if (!route) {
                      setNotice("PRODUCT_NO_ACTIVE_SESSION");
                      return;
                    }
                    void bridge
                      .runAgentCommand(route, { type: "bash", command: shell })
                      .then((data) => {
                        const output = typeof data.output === "string" ? data.output : JSON.stringify(data);
                        setNotice(`$ ${shell}\n${output.slice(0, 400)}`);
                      })
                      .catch((error: unknown) =>
                        setNotice(error instanceof Error ? error.message : String(error))
                      );
                  }}
                  onModelChange={(provider, modelId) => {
                    const route = resolveRoute(selected.id);
                    if (route) void bridge.setModel(route, provider, modelId);
                  }}
                onCycleThinking={() => {
                  const route = resolveRoute(selected.id);
                  if (route) void bridge.cycleThinkingLevel(route);
                  if (route) void loadWorkbench(route);
                }}
                />
              )}
            </>
          ) : (
            <WelcomePage onSendMessage={sendPromptForWelcome} />
          )}
          {notice !== null && (
            <p className="center-session__notice" role="alert">
              {notice}
            </p>
          )}
        </main>
        <RightPanel
          session={selected}
          approvalRules={approvalRules}
          workbench={workbench}
          runtimeUpdate={runtimeUpdate}
          onRemoveRule={removeRule}
          onToggle={(command) => {
            const route = selected ? routes.current.get(selected.id) : null;
            if (!route) {
              setNotice("PRODUCT_NO_ACTIVE_SESSION");
              return;
            }
            void bridge
              .runAgentCommand(route, command)
              .then(() => loadWorkbench(route))
              .catch((error: unknown) =>
                setNotice(error instanceof Error ? error.message : String(error))
              );
          }}
          subAgents={timelineForSelected.subAgents}
        />
      </div>
    </div>
  );
}

const SETTINGS_KEY = "omp.renderer-next.settings";

type AppSettings = {
  defaultModel: string;
  defaultThinkingLevel: string;
  theme: "dark" | "light" | "system";
  fontSize: "small" | "medium" | "large";
  language: "zh-CN" | "en";
  approvalMode: "ask" | "auto" | "plan";
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { defaultModel: "", defaultThinkingLevel: "medium", theme: "dark", fontSize: "medium", language: "zh-CN", approvalMode: "ask" };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { defaultModel: "", defaultThinkingLevel: "medium", theme: "dark", fontSize: "medium", language: "zh-CN", approvalMode: "ask", ...parsed };
  } catch {
    return { defaultModel: "", defaultThinkingLevel: "medium", theme: "dark", fontSize: "medium", language: "zh-CN", approvalMode: "ask" };
  }
}

function saveSettings(s: AppSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function AppContent() {
  // Move handleEditAction to use outer scope variables
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const bridge = useMemo(() => {
    const real = resolveDefaultBridge();
    if (!real) throw new Error("PRODUCT_TAURI_UNAVAILABLE");
    return real;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowCommandPalette(false);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function updateSettings(updater: Partial<AppSettings>) {
    const next = { ...settings, ...updater };
    setSettings(next);
    saveSettings(next);
  }

  return (
    <ProductBridgeProvider bridge={bridge}>
      <Workbench transport="tauri" />
      {showSettings && (
        <div className="settings-overlay">
          <SettingsPage settings={settings} onUpdate={updateSettings} onClose={() => setShowSettings(false)} />
        </div>
      )}
      {showCommandPalette && (
        <CommandPalette
          commands={[
            { id: "new-session", label: "新建会话", description: "创建新的对话", shortcut: "Ctrl+N", action: () => setShowCommandPalette(false) },
            { id: "open-settings", label: "设置", description: "打开设置页面", shortcut: "Ctrl+,", action: () => { setShowSettings(true); setShowCommandPalette(false); } },
          ]}
          onClose={() => setShowCommandPalette(false)}
        />
      )}
    </ProductBridgeProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

