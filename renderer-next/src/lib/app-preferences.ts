/**
 * Renderer presentation preferences (guarded localStorage). Losing these only
 * resets convenience selections — never session data. Every access degrades
 * gracefully when storage is unavailable (private mode, denied permission).
 */

export type ThemeMode = "dark" | "light" | "system";
export type Language = "zh-CN" | "en";
export type ApprovalMode = "ask" | "auto" | "plan";
export type FontSize = "small" | "medium" | "large";

export type AppSettings = {
  defaultModel: string;
  defaultThinkingLevel: string;
  theme: ThemeMode;
  fontSize: FontSize;
  language: Language;
  approvalMode: ApprovalMode;
  terminalShell: string;
  terminalMaxLines: number;
};

export function defaultSettings(): AppSettings {
  return {
    defaultModel: "",
    defaultThinkingLevel: "medium",
    theme: "dark",
    fontSize: "medium",
    language: "zh-CN",
    approvalMode: "ask",
    terminalShell: "cmd.exe",
    terminalMaxLines: 1000
  };
}

export type AppPreferences = {
  lastProjectPath: string | null;
  lastSessionId: string | null;
  /** Per-session reviewed workspace file paths (diff review marks). */
  reviewedFiles: Record<string, readonly string[]>;
  /** UI settings persisted across sessions. */
  settings: AppSettings;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const KEY = "omp.renderer-next.workbench";

export function defaultPreferences(): AppPreferences {
  return { lastProjectPath: null, lastSessionId: null, reviewedFiles: {}, settings: defaultSettings() };
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value)
  };
}

/** Platform storage with graceful fallback; injectable for deterministic tests. */
export function safeStorage(): StorageLike {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* private mode or denied — fall through */
  }
  return memoryStorage();
}

function parsePreferences(value: unknown): AppPreferences {
  const result = defaultPreferences();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return result;
  for (const [key, field] of Object.entries(value)) {
    if ((key === "lastProjectPath" || key === "lastSessionId") && (field === null || typeof field === "string")) {
      result[key] = field;
    }
    if (key === "settings" && typeof field === "object" && field !== null && !Array.isArray(field)) {
      const s = field as Record<string, unknown>;
      if (typeof s.defaultModel === "string") result.settings.defaultModel = s.defaultModel;
      if (["low", "medium", "high", "xhigh"].includes(s.defaultThinkingLevel as string)) result.settings.defaultThinkingLevel = s.defaultThinkingLevel as string;
      if (["dark", "light", "system"].includes(s.theme as string)) result.settings.theme = s.theme as ThemeMode;
      if (["small", "medium", "large"].includes(s.fontSize as string)) result.settings.fontSize = s.fontSize as FontSize;
      if (["zh-CN", "en"].includes(s.language as string)) result.settings.language = s.language as Language;
      if (["ask", "auto", "plan"].includes(s.approvalMode as string)) result.settings.approvalMode = s.approvalMode as ApprovalMode;
      if (typeof s.terminalShell === "string") result.settings.terminalShell = s.terminalShell;
      if (typeof s.terminalMaxLines === "number") result.settings.terminalMaxLines = s.terminalMaxLines;
    }
    if (key === "reviewedFiles" && typeof field === "object" && field !== null && !Array.isArray(field)) {
      for (const [sessionId, paths] of Object.entries(field)) {
        if (Array.isArray(paths) && paths.every((path) => typeof path === "string")) {
          result.reviewedFiles[sessionId] = paths;
        }
      }
    }
  }
  return result;
}

export function loadAppPreferences(storage: StorageLike = safeStorage()): AppPreferences {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return defaultPreferences();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultPreferences();
    }
    return parsePreferences(parsed);
  } catch {
    return defaultPreferences();
  }
}

export function saveAppPreferences(prefs: Partial<AppPreferences>, storage: StorageLike = safeStorage()): void {
  try {
    storage.setItem(KEY, JSON.stringify({ ...defaultPreferences(), ...prefs }));
  } catch {
    /* quota or denial — preference loss is acceptable degradation */
  }
}

export type SelectionCandidate = { id: string; updatedAt: string; projectPath: string };

/**
 * Restore order (plan §Startup restore): exact stored pair → most recent
 * session of the stored project → most recent overall → none.
 */
export function resolveStartupSelection(
  prefs: AppPreferences,
  sessions: readonly SelectionCandidate[]
): string | null {
  if (sessions.length === 0) return null;
  const byId = prefs.lastSessionId
    ? sessions.find(
        (session) =>
          session.id === prefs.lastSessionId &&
          (!prefs.lastProjectPath || session.projectPath === prefs.lastProjectPath)
      )
    : undefined;
  if (byId) return byId.id;
  if (prefs.lastProjectPath) {
    const inProject = sessions
      .filter((session) => session.projectPath === prefs.lastProjectPath)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (inProject[0]) return inProject[0].id;
  }
  const newest = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return newest ? newest.id : null;
}
