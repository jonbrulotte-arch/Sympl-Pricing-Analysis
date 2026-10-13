import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  BarChart3,
  Building2,
  Calculator,
  ClipboardList,
  DollarSign,
  FolderKanban,
  HelpCircle,
  Info,
  LayoutDashboard,
  Package,
  Rocket,
  Send,
  Shield,
  Sigma,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HelpBlock } from "@/lib/help/types";

export const ARTICLE_ICONS: Record<string, React.ElementType> = {
  BarChart3,
  Building2,
  Calculator,
  ClipboardList,
  DollarSign,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  Package,
  Rocket,
  Send,
  Shield,
  Sigma,
  Upload,
};

/** Renders **bold** and [text](/internal-path) inside help text. */
export function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold text-gray-900">{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <Link key={i} href={link[2]} className="text-blue-600 hover:underline">
          {link[1]}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-gray-700">
      {blocks.map((b, i) => {
        if ("p" in b) return <p key={i}>{renderInline(b.p)}</p>;
        if ("h" in b) return <h3 key={i} className="text-sm font-semibold text-gray-900 pt-2">{renderInline(b.h)}</h3>;
        if ("list" in b) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.list.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>
          );
        }
        if ("steps" in b) {
          return (
            <ol key={i} className="space-y-2">
              {b.steps.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span className="h-5 w-5 shrink-0 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center mt-0.5">
                    {j + 1}
                  </span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }
        if ("note" in b) {
          const warn = b.tone === "warning";
          const Icon = warn ? TriangleAlert : Info;
          return (
            <div
              key={i}
              className={cn(
                "flex gap-2 rounded-md border px-3 py-2",
                warn ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 mt-1" />
              <p>{renderInline(b.note)}</p>
            </div>
          );
        }
        return (
          <div key={i} className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {b.table.head.map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.table.rows.map((row, j) => (
                  <tr key={j} className="border-b border-gray-100 last:border-0 align-top">
                    {row.map((cell, k) => (
                      <td key={k} className={cn("py-2 px-3", k === 0 && "font-medium text-gray-900 whitespace-nowrap")}>
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
