"use client";

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
  if (data.length < 2) return null;

  const chartData = [...data]
    .reverse()
    .map((d) => ({
      date: formatShortDate(d.recordedAt),
      cost: Number(d.cost),
    }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Cost"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
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
