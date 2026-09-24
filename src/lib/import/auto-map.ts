import { IMPORT_FIELDS } from "@/lib/pricing/constants";

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function autoMapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  const normHeaders = headers.map(normalize);

  for (const field of IMPORT_FIELDS) {
    for (let i = 0; i < normHeaders.length; i++) {
      if (used.has(i)) continue;
      if (field.cand.includes(normHeaders[i])) {
        map[field.key] = i;
        used.add(i);
        break;
      }
    }
  }

  // Substring fallback for unmatched fields
  for (const field of IMPORT_FIELDS) {
    if (map[field.key] !== undefined) continue;
    for (let i = 0; i < normHeaders.length; i++) {
      if (used.has(i)) continue;
      if (field.cand.some((c) => normHeaders[i].includes(c) || c.includes(normHeaders[i]))) {
        map[field.key] = i;
        used.add(i);
        break;
      }
    }
  }

  return map;
}

export function headerSignature(headers: string[]): string {
  return headers
    .map(normalize)
    .join("|")
    .slice(0, 180);
}
