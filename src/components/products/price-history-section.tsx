"use client";

import { Fragment, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, ChevronRight } from "lucide-react";
import { PriceHistoryChart } from "./price-history-chart";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PriceRecordDetail } from "@/lib/db/price-history";
import { LocalDateTime } from "@/components/ui/local-date-time";

interface PriceRecord {
  id: string;
  label: string;
  price: number;
  recordedAt: string;
  source: "channel" | "product";
  detail: PriceRecordDetail;
}

interface Props {
  data: PriceRecord[];
  canDelete?: boolean;
  productId?: string;
}

export function PriceHistorySection({ data, canDelete = false, productId }: Props) {
  const router = useRouter();
  const [channelFilter, setChannelFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const channels = useMemo(
    () => [...new Set(data.map((d) => d.label))].sort(),
    [data],
  );

  const filtered = useMemo(
    () => channelFilter === "all" ? data : data.filter((d) => d.label === channelFilter),
    [data, channelFilter],
  );

  async function handleDelete(record: PriceRecord) {
    if (!productId) return;
    if (!confirm(`Delete this price record?\n$${record.price.toFixed(2)} on ${record.label}`)) return;

    setDeletingId(record.id);
    try {
      const res = await fetch(`/api/products/${productId}/price-history`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, source: record.source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to delete record");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PriceHistoryChart data={filtered} />
      <div className="flex items-center justify-between mt-4 mb-2">
        <span className="text-xs text-gray-500">{filtered.length} records</span>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {channels.map((ch) => (
              <SelectItem key={ch} value={ch}>{ch}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="w-6" />
            <th className="text-left py-2 text-gray-600 font-medium">Date</th>
            <th className="text-left py-2 text-gray-600 font-medium">Channel</th>
            <th className="text-right py-2 text-gray-600 font-medium">Price</th>
            {canDelete && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {filtered.map((pr) => {
            const expanded = expandedId === pr.id;
            return (
              <Fragment key={pr.id}>
                <tr
                  onClick={() => setExpandedId(expanded ? null : pr.id)}
                  className={cn("border-b border-gray-50 cursor-pointer hover:bg-gray-50", expanded && "bg-gray-50")}
                  aria-expanded={expanded}
                >
                  <td className="py-1.5 text-gray-400">
                    <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-90")} />
                  </td>
                  <td className="py-1.5 text-gray-700"><LocalDateTime value={pr.recordedAt} /></td>
                  <td className="py-1.5">
                    <Badge variant="secondary" className="text-xs">{pr.label}</Badge>
                  </td>
                  <td className="py-1.5 text-right font-mono">${pr.price.toFixed(2)}</td>
                  {canDelete && (
                    <td className="py-1.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(pr);
                        }}
                        disabled={deletingId === pr.id}
                        title="Delete record"
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {deletingId === pr.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  )}
                </tr>
                {expanded && (
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <td />
                    <td colSpan={canDelete ? 4 : 3} className="pb-3 pt-1 pr-2">
                      <RecordDetail record={pr} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function RecordDetail({ record }: { record: PriceRecord }) {
  const { detail } = record;
  const prev = detail.previousPrice;
  const change = prev != null ? record.price - prev : null;
  const changePct = prev != null && prev > 0 && change != null ? (change / prev) * 100 : null;

  const items: { label: string; value: React.ReactNode }[] = [
    { label: "Previous Price", value: prev != null ? <span className="font-mono">${prev.toFixed(2)}</span> : "None recorded" },
    {
      label: "New Price",
      value: (
        <span className="font-mono">
          ${record.price.toFixed(2)}
          {change != null && Math.abs(change) >= 0.005 && (
            <span className={cn("ml-2 text-xs", change > 0 ? "text-green-600" : "text-red-600")}>
              {change > 0 ? "+" : "-"}${Math.abs(change).toFixed(2)}
              {changePct != null && ` (${change > 0 ? "+" : ""}${changePct.toFixed(1)}%)`}
            </span>
          )}
        </span>
      ),
    },
    { label: "Customer", value: detail.customer ?? "All customers (catalog price)" },
    { label: "Channel", value: detail.channel },
    { label: "Changed By", value: detail.changedBy ?? "Unknown" },
    { label: "Source", value: detail.how },
  ];

  return (
    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 rounded-md border border-gray-200 bg-white p-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-gray-500">{item.label}</dt>
          <dd className="text-sm text-gray-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
