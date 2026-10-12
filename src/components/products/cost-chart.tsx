"use client";

import { useState } from "react";
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

interface CostPoint {
  id: string;
  cost: string | number;
  recordedAt: string;
}

interface ShippingPoint {
  id: string;
  shippingType: string;
  amount: string | number;
  recordedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  std: "Standard",
  mcf_ship: "MCF Ship",
  mcf_freight: "MCF Freight",
  fba_fee: "FBA Fee",
};

const TYPE_COLORS: Record<string, string> = {
  std: "#2563eb",
  mcf_ship: "#7c3aed",
  mcf_freight: "#059669",
  fba_fee: "#d97706",
};

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CostHistoryChart({ data }: { data: CostPoint[] }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (data.length < 2) return null;

  const chartData = [...data]
    .reverse()
    .map((d) => ({
      date: formatShortDate(d.recordedAt),
      cost: Number(d.cost),
    }));

  function renderChart(fontSize: number, dotRadius: number) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize, fill: "#6b7280" }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Cost"]}
            contentStyle={{ fontSize: fontSize + 1 }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: dotRadius }}
            activeDot={{ r: dotRadius + 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (fullscreen) {
    return (
      <>
        <div className="h-48" />
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Cost History</h3>
              <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-4 pb-4 pt-3" style={{ height: "60vh" }}>
              {renderChart(12, 4)}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-1">
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
        {renderChart(11, 3)}
      </div>
    </div>
  );
}

export function ShippingHistoryChart({ data }: { data: ShippingPoint[] }) {
  if (data.length < 2) return null;

  const types = [...new Set(data.map((d) => d.shippingType))];
  const byDate = new Map<string, Record<string, number>>();

  for (const d of [...data].reverse()) {
    const date = formatShortDate(d.recordedAt);
    const existing = byDate.get(date) ?? {};
    existing[d.shippingType] = Number(d.amount);
    byDate.set(date, existing);
  }

  const chartData = Array.from(byDate.entries()).map(([date, values]) => ({
    date,
    ...values,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(value, name) => [`$${Number(value).toFixed(2)}`, TYPE_LABELS[String(name)] ?? name]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend formatter={(value: string) => TYPE_LABELS[value] ?? value} wrapperStyle={{ fontSize: 11 }} />
          {types.map((type) => (
            <Line
              key={type}
              type="monotone"
              dataKey={type}
              stroke={TYPE_COLORS[type] ?? "#6b7280"}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
