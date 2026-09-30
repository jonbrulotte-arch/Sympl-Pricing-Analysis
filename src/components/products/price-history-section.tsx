"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { PriceHistoryChart } from "./price-history-chart";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

interface PriceRecord {
  id: string;
  label: string;
  price: number;
  recordedAt: string;
  source: "channel" | "product";
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
            <th className="text-left py-2 text-gray-600 font-medium">Date</th>
            <th className="text-left py-2 text-gray-600 font-medium">Channel</th>
            <th className="text-right py-2 text-gray-600 font-medium">Price</th>
            {canDelete && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {filtered.map((pr) => (
            <tr key={pr.id} className="border-b border-gray-50">
              <td className="py-1.5 text-gray-700">{formatDateTime(new Date(pr.recordedAt))}</td>
              <td className="py-1.5">
                <Badge variant="secondary" className="text-xs">{pr.label}</Badge>
              </td>
              <td className="py-1.5 text-right font-mono">${pr.price.toFixed(2)}</td>
              {canDelete && (
                <td className="py-1.5 text-center">
                  <button
                    onClick={() => handleDelete(pr)}
                    disabled={deletingId === pr.id}
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
          ))}
        </tbody>
      </table>
    </>
  );
}
