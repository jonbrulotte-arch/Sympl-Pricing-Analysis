"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface HelpSearchEntry {
  slug: string;
  articleTitle: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
}

/** Searches every section the user can see; shows `children` (the article list) when the box is empty. */
export function HelpSearch({ entries, children }: { entries: HelpSearchEntry[]; children: ReactNode }) {
  const [q, setQ] = useState("");
  const terms = q.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1);

  const results = useMemo(() => {
    if (terms.length === 0) return [];
    return entries
      .map((e) => {
        const title = `${e.articleTitle} ${e.sectionTitle}`.toLowerCase();
        const body = e.text.toLowerCase();
        if (!terms.every((t) => title.includes(t) || body.includes(t))) return null;
        const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
        const at = Math.max(0, body.indexOf(terms[0]));
        const start = Math.max(0, at - 60);
        const snippet = (start > 0 ? "…" : "") + e.text.slice(start, start + 180) + (start + 180 < e.text.length ? "…" : "");
        return { e, score, snippet };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }, [entries, terms.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="relative max-w-xl mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help, e.g. publish, royalty, missing cost..." className="pl-9 h-10" />
      </div>
      {terms.length === 0 ? (
        children
      ) : results.length === 0 ? (
        <p className="text-sm text-gray-500">No help topics match &ldquo;{q.trim()}&rdquo;.</p>
      ) : (
        <ul className="space-y-2 max-w-3xl">
          {results.map(({ e, snippet }) => (
            <li key={`${e.slug}#${e.sectionId}`}>
              <Link
                href={`/help/${e.slug}#${e.sectionId}`}
                className="block rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-blue-300"
              >
                <p className="text-sm font-medium text-gray-900">
                  {e.sectionTitle} <span className="text-gray-400 font-normal">· {e.articleTitle}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">{snippet}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
