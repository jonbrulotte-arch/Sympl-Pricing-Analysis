"use client";

import { Card, CardContent } from "@/components/ui/card";

interface KpiData {
  total: number;
  atGoal: number;
  below: number;
  loss: number;
  unpriced: number;
  avgGm: number;
  totalMargin: number;
  needRepricing: number;
}

export function KpiCards({ kpis }: { kpis: KpiData }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <KpiCard label="SKUs in scope" value={kpis.total} />
      <KpiCard label="At goal" value={kpis.atGoal} color="text-green-600" />
      <KpiCard label="Below goal" value={kpis.below} color="text-amber-600" />
      <KpiCard label="Losing money" value={kpis.loss} color="text-red-600" />
      <KpiCard label="Avg GM%" value={`${(kpis.avgGm * 100).toFixed(1)}%`} />
      <KpiCard label="Total margin" value={`$${kpis.totalMargin.toFixed(0)}`} />
      <KpiCard label="Need repricing" value={kpis.needRepricing} color="text-blue-600" />
      <KpiCard label="Unpriced" value={kpis.unpriced} color="text-gray-500" />
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className={`text-xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}
