import { describe, expect, test } from "bun:test";
import {
  defaultPreferences,
  loadAppPreferences,
  resolveStartupSelection,
  saveAppPreferences,
  type AppPreferences,
  type SelectionCandidate,
  type StorageLike
} from "../src/lib/app-preferences";

function memoryStorage(): StorageLike & { dump(): string } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    dump: () => JSON.stringify(Object.fromEntries(map))
  };
}

function view(id: string, updatedAt: string, projectPath = "C:\\proj-a"): SelectionCandidate {
  return { id, updatedAt, projectPath };
}

describe("preferences round-trip", () => {
  test("save then load preserves both fields", () => {
    const storage = memoryStorage();
    const prefs: AppPreferences = {
      lastProjectPath: "C:\\proj-a",
      lastSessionId: "s-1",
      reviewedFiles: { "s-1": ["src/a.ts"] }
    };
    saveAppPreferences(prefs, storage);
    expect(loadAppPreferences(storage)).toEqual(prefs);
  });

  test("corrupt JSON degrades to defaults", () => {
    const storage: StorageLike = {
      getItem: () => "{not json",
      setItem: () => undefined
    };
    expect(loadAppPreferences(storage)).toEqual(defaultPreferences());
  });

  test("unknown fields are dropped, wrong-typed fields fall back to null", () => {
    const storage: StorageLike = {
      getItem: () => JSON.stringify({ lastProjectPath: 5, lastSessionId: "keep", hacker: true }),
      setItem: () => undefined
    };
    expect(loadAppPreferences(storage)).toEqual({
      lastProjectPath: null,
      lastSessionId: "keep",
      reviewedFiles: {}
    });
  });

  test("storage failures never throw", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      }
    };
    expect(loadAppPreferences(hostile)).toEqual(defaultPreferences());
    expect(() => saveAppPreferences(defaultPreferences(), hostile)).not.toThrow();
  });
});

const SESSIONS = [
  view("older", "2026-08-23T10:00:00.000Z"),
  view("newest", "2026-08-25T09:00:00.000Z"),
  view("mid-b", "2026-08-24T12:00:00.000Z", "C:\\proj-b")
];

describe("resolveStartupSelection", () => {
  test("restores the exact stored pair when it still exists", () => {
    expect(
      resolveStartupSelection({ lastProjectPath: "C:\\proj-b", lastSessionId: "mid-b", reviewedFiles: {} }, SESSIONS)
    ).toBe("mid-b");
  });

  test("falls back to the most recent session of the stored project", () => {
    expect(resolveStartupSelection({ lastProjectPath: "C:\\proj-a", lastSessionId: "gone", reviewedFiles: {} }, SESSIONS)).toBe(
      "newest"
    );
  });

  test("falls back to the most recent session overall without a project", () => {
    expect(resolveStartupSelection(defaultPreferences(), SESSIONS)).toBe("newest");
  });

  test("empty discovery yields no selection", () => {
    expect(resolveStartupSelection(defaultPreferences(), [])).toBeNull();
  });
});
