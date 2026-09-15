export function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/[$,%\s]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

const DISC_RE = /discont|selldown|sell.?down|liquidat|eol|end.?of.?life|obsolete|phase.?out/i;
const ACTIVE_RE = /salesinventory|active|current|stock|sellable/i;

export function parseStatus(raw: string | undefined | null): "active" | "disc" | "unknown" {
  if (!raw) return "unknown";
  const s = raw.trim();
  if (DISC_RE.test(s)) return "disc";
  if (ACTIVE_RE.test(s)) return "active";
  return "unknown";
}

export function roundUp(value: number, mode: string): number {
  if (!isFinite(value) || value <= 0) return value;
  switch (mode) {
    case "cent":
      return Math.ceil(value * 100) / 100;
    case "99":
      return Math.ceil(value) - 0.01;
    case "95":
      return Math.floor(value) + 0.95 <= value
        ? Math.floor(value) + 1.95
        : Math.floor(value) + 0.95;
    case "05":
      return Math.ceil(value * 20) / 20;
    case "25":
      return Math.ceil(value * 4) / 4;
    case "1":
      return Math.ceil(value);
    default:
      return Math.ceil(value * 100) / 100;
  }
}

export function brandKey(name: string | undefined | null): string {
  return norm(name ?? "");
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
