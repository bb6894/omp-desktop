/**
 * Canonical object guard for this package. Every module that needs "is this a
 * plain object" imports THIS guard — no per-file redefinitions.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
