import type { ProductRow } from "@/lib/pricing/types";
import { IMPORT_FIELDS } from "@/lib/pricing/constants";
import { parseNum } from "@/lib/pricing/helpers";

export function buildRows(
  rawData: unknown[][],
  columnMap: Record<string, number>,
): ProductRow[] {
  const rows: ProductRow[] = [];

  for (const raw of rawData) {
    const sku = columnMap.sku !== undefined ? String(raw[columnMap.sku] ?? "").trim() : "";
    if (!sku) continue;

    const row: ProductRow = { sku, cost: null };

    for (const field of IMPORT_FIELDS) {
      if (field.key === "sku") continue;
      const idx = columnMap[field.key];
      if (idx === undefined) continue;
      const val = raw[idx];

      if (field.key === "name" || field.key === "brand" || field.key === "asin" ||
          field.key === "fbaClass" || field.key === "amzCategory" || field.key === "amzItemType" ||
          field.key === "invStatus") {
        (row as Record<string, unknown>)[field.key] = val != null ? String(val).trim() : undefined;
      } else {
        const n = parseNum(val);
        (row as Record<string, unknown>)[field.key] = n !== 0 ? n : null;
      }
    }

    if (row.invStatus) {
      row.invRaw = row.invStatus;
    }

    rows.push(row);
  }

  return rows;
}
