import type { Permission } from "@/types";

/**
 * Help content blocks. Text supports **bold** and [links](/path); see renderInline in the help components.
 */
export type HelpBlock =
  | { p: string }
  | { h: string }
  | { list: string[] }
  | { steps: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string; tone?: "info" | "warning" };

export interface HelpSection {
  id: string;
  title: string;
  blocks: HelpBlock[];
  /** Only shown to users with at least one of these permissions (in addition to the article's). */
  requires?: Permission[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  /** Lucide icon name, see ARTICLE_ICONS in the help components. */
  icon: string;
  group: "Basics" | "Working with data" | "Pricing" | "Reference" | "Administration";
  /** Only shown to users with at least one of these permissions. Omit for everyone. */
  requires?: Permission[];
  sections: HelpSection[];
}

/** Plain text of a block, for search. */
export function blockText(b: HelpBlock): string {
  const strip = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if ("p" in b) return strip(b.p);
  if ("h" in b) return strip(b.h);
  if ("note" in b) return strip(b.note);
  if ("list" in b) return b.list.map(strip).join(" ");
  if ("steps" in b) return b.steps.map(strip).join(" ");
  return [...b.table.head, ...b.table.rows.flat()].map(strip).join(" ");
}
