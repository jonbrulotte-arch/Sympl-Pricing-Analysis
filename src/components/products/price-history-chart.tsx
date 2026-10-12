"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PriceRecord {
  id: string;
  label: string;
  price: number;
  recordedAt: string;
}

const CHANNEL_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#c026d3",
  "#65a30d",
  "#ea580c",
];

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PriceHistoryChart({ data }: { data: PriceRecord[] }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [hiddenChannels, setHiddenChannels] = useState<Set<string>>(new Set());

  const channels = useMemo(
    () => [...new Set(data.map((d) => d.label))].sort(),
    [data],
  );

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    channels.forEach((ch, i) => {
      m[ch] = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
    });
    return m;
  }, [channels]);

  const visibleChannels = useMemo(
    () => channels.filter((ch) => !hiddenChannels.has(ch)),
    [channels, hiddenChannels],
  );

  const chartData = useMemo(() => {
    const reversed = [...data].reverse();
    const byDate = new Map<string, Record<string, number>>();
    for (const d of reversed) {
      if (hiddenChannels.has(d.label)) continue;
      const date = formatShortDate(d.recordedAt);
      const existing = byDate.get(date) ?? {};
      existing[d.label] = d.price;
      byDate.set(date, existing);
    }
    return Array.from(byDate.entries()).map(([date, values]) => ({ date, ...values }));
  }, [data, hiddenChannels]);

  if (data.length < 2) return null;

  function toggleChannel(channel: string) {
    setHiddenChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
          contentStyle={{ fontSize: 12 }}
          wrapperStyle={{ zIndex: 10 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {visibleChannels.map((ch) => (
          <Line
            key={ch}
            type="monotone"
            dataKey={ch}
            stroke={colorMap[ch]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-xs text-gray-500 mr-1">Channels:</span>
      {channels.map((ch) => {
        const active = !hiddenChannels.has(ch);
        return (
          <button
            key={ch}
            onClick={() => toggleChannel(ch)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border transition-colors ${
              active
                ? "border-gray-300 bg-white text-gray-700"
                : "border-gray-200 bg-gray-100 text-gray-400 line-through"
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: active ? colorMap[ch] : "#d1d5db" }}
            />
            {ch}
          </button>
        );
      })}
    </div>
  );

  if (fullscreen) {
    return (
      <>
        {/* Inline placeholder so layout doesn't jump */}
        <div className="h-48" />
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Price History</h3>
              <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-4 pt-3">
              {filterBar}
            </div>
            <div className="px-4 pb-4" style={{ height: "60vh" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
                    contentStyle={{ fontSize: 13 }}
                    wrapperStyle={{ zIndex: 10 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {visibleChannels.map((ch) => (
                    <Line
                      key={ch}
                      type="monotone"
                      dataKey={ch}
                      stroke={colorMap[ch]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        {filterBar}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFullscreen(true)}
          className="h-6 w-6 p-0 shrink-0 text-gray-400 hover:text-gray-600"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="h-48 w-full">
        {chart}
      </div>
    </div>
  );
}
