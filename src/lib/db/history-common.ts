import { prisma } from "@/lib/prisma";

/** How an Import row's source reads in history details. */
const IMPORT_SOURCE_LABELS: Record<string, string> = {
  spreadsheet: "Spreadsheet import",
  salsify: "Salsify sync",
  "salsify-list": "Salsify product list sync",
  supplemental: "Supplemental import",
  mcf_freight_remote: "MCF freight import",
};

/** How a user-made history row's `source` reads in history details. */
export const WRITE_SOURCE_LABELS: Record<string, string> = {
  manual: "Edited on the product page",
  commit: "Committed in analysis",
  publish: "Published to Salsify",
  undo: "Undo of a staged commit",
};

/** Activity log entries within this window of a history row are treated as the same change. */
export const LOG_MATCH_MS = 2 * 60 * 1000;

export const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

export const withinLogWindow = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < LOG_MATCH_MS;

/** Loads the imports behind history rows, for who ran them and how they read ("Salsify sync (file.xlsx)"). */
export async function loadImportInfo(importIds: (string | null)[]) {
  const ids = [...new Set(importIds.filter((id): id is string => !!id))];
  const imports = new Map(
    (
      await prisma.import.findMany({
        where: { id: { in: ids } },
        select: { id: true, source: true, fileName: true, uploadedBy: { select: { name: true } } },
      })
    ).map((i) => [i.id, i]),
  );
  return {
    uploader: (id: string | null) => (id ? (imports.get(id)?.uploadedBy.name ?? null) : null),
    how: (id: string | null) => {
      const imp = id ? imports.get(id) : undefined;
      if (!imp) return null;
      const label = IMPORT_SOURCE_LABELS[imp.source] ?? "Import";
      const file = imp.fileName?.trim();
      return file && file.toLowerCase() !== label.toLowerCase() ? `${label} (${file})` : label;
    },
  };
}

/** For rows ordered newest first: each row id mapped to the value of the next older row with the same key. */
export function previousValues<T extends { id: string }>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const prev = new Map<string, number>();
  const lastSeen = new Map<string, string>();
  for (const r of rows) {
    const k = key(r);
    const newerId = lastSeen.get(k);
    if (newerId) prev.set(newerId, value(r));
    lastSeen.set(k, r.id);
  }
  return prev;
}
