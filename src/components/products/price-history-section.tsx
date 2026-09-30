"use client";

import { useState, useMemo } from "react";
import { PriceHistoryChart } from "./price-history-chart";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

interface PriceRecord {
  id: string;
  label: string;
  price: number;
  recordedAt: string;
}

export function PriceHistorySection({ data }: { data: PriceRecord[] }) {
  const [channelFilter, setChannelFilter] = useState("all");

  const channels = useMemo(
    () => [...new Set(data.map((d) => d.label))].sort(),
    [data],
  );

  const filtered = useMemo(
    () => channelFilter === "all" ? data : data.filter((d) => d.label === channelFilter),
    [data, channelFilter],
  );

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
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
