/**
 * Unified-diff row parsing for the bounded workspace diff view. Pure and
 * allocation-light: the Host already caps diff size; this only classifies
 * lines so the renderer can colorize adds/dels/hunk headers.
 */

export type DiffRowKind = "meta" | "hunk" | "add" | "del" | "ctx";

export type DiffRow = { kind: DiffRowKind; text: string };

export function parseUnifiedDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) rows.push({ kind: "hunk", text: line });
    else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index "))
      rows.push({ kind: "meta", text: line });
    else if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "del", text: line.slice(1) });
    else rows.push({ kind: "ctx", text: line.replace(/^ /, "") });
  }
  return rows;
}
