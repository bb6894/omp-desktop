import { isAbsolute, join, normalize, resolve } from "node:path";
import { getDefaultOmpProfileDir, getDefaultOmpSessionDir } from "./omp-adapter";

export type ProfilePaths = {
  profileDir: string;
  terminalSessionsDir: string;
  desktopSessionsDir: string;
};

export function resolveProfilePaths(cwd: string, profileDir = getDefaultOmpProfileDir()): ProfilePaths {
  const normalizedCwd = normalizeAbsoluteWindowsPath(cwd);
  const normalizedProfile = normalizeAbsoluteWindowsPath(profileDir);
  const terminalSessionsDir = normalize(getDefaultOmpSessionDir(normalizedCwd, normalizedProfile));
  return {
    profileDir: normalizedProfile,
    terminalSessionsDir,
    desktopSessionsDir: join(terminalSessionsDir, "desktop-sessions")
  };
}

export function normalizeAbsoluteWindowsPath(value: string): string {
  if (!isAbsolute(value)) {
    throw new Error("PATH_MUST_BE_ABSOLUTE");
  }
  return normalize(resolve(value));
}
