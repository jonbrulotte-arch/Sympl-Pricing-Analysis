"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HistoryColumn {
  label: string;
  align?: "left" | "right";
}

export interface HistoryRow {
  id: string;
  cells: ReactNode[];
  /** Shown in a panel under the row when it's clicked. */
  details: { label: string; value: ReactNode }[];
}

/** A history table whose rows expand to show details about each change. */
export function ExpandableHistoryTable({ columns, rows }: { columns: HistoryColumn[]; rows: HistoryRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm mt-4">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="w-6" />
          {columns.map((c) => (
            <th key={c.label} className={cn("py-2 text-gray-600 font-medium", c.align === "right" ? "text-right" : "text-left")}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <Fragment key={row.id}>
              <tr
                onClick={() => setExpandedId(expanded ? null : row.id)}
                className={cn("border-b border-gray-50 cursor-pointer hover:bg-gray-50", expanded && "bg-gray-50")}
                aria-expanded={expanded}
              >
                <td className="py-1.5 text-gray-400">
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-90")} />
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i} className={cn("py-1.5", columns[i]?.align === "right" && "text-right")}>
                    {cell}
                  </td>
                ))}
              </tr>
              {expanded && (
                <tr className="border-b border-gray-200 bg-gray-50">
                  <td />
                  <td colSpan={columns.length} className="pb-3 pt-1 pr-2">
                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 rounded-md border border-gray-200 bg-white p-3">
                      {row.details.map((d) => (
                        <div key={d.label}>
                          <dt className="text-xs text-gray-500">{d.label}</dt>
                          <dd className="text-sm text-gray-900">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
