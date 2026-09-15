"use client";

import { useAnalysis, type StatusFilter } from "@/hooks/use-analysis";
import { KpiCards } from "./kpi-cards";
import { AnalysisTable } from "./analysis-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProductRow, BrandRoyaltyTable } from "@/lib/pricing/types";
import { Search, Download } from "lucide-react";

interface ChannelDb {
  id: string;
  name: string;
  tabLabel: string;
  shippingMode: string;
  priceField: string;
  fallbackPriceField?: string | null;
  hasCoupon: boolean;
  hasTax: boolean;
  hasCommission: boolean;
  hasTopSellerDisc: boolean;
  hasPromotedListing: boolean;
  hasFvfFixed: boolean;
  hasCardProcessing: boolean;
  hasPpc: boolean;
  hasAdvertising: boolean;
  hasPerSkuCommission: boolean;
  hasFallback: boolean;
  hasAsin: boolean;
  defaults: Record<string, unknown>;
  blockedBrands: string[];
}

interface Props {
  channels: ChannelDb[];
  products: ProductRow[];
  brandRoyalties: BrandRoyaltyTable;
  customerId: string;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pass", label: "At Goal" },
  { value: "below", label: "Below" },
  { value: "loss", label: "Loss" },
  { value: "unpriced", label: "Unpriced" },
];

export function AnalysisWorkspace({ channels, products, brandRoyalties, customerId }: Props) {
  const {
    configs,
    activeTab,
    setActiveTab,
    filteredResults,
    kpis,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sortKey,
    sortDir,
    handleSort,
    setOverride,
  } = useAnalysis(channels, products, brandRoyalties);

  if (channels.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No channels configured. Add channels to this customer first.
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        No product data. Import a spreadsheet first.
      </div>
    );
  }

  return (
    <div>
      {/* Channel tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {configs.map((cfg) => (
          <button
            key={cfg.id}
            onClick={() => setActiveTab(cfg.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === cfg.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {cfg.tabLabel}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <KpiCards kpis={kpis} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, name, or brand..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="ml-auto text-xs text-gray-400">
          {filteredResults.length} of {kpis.total} SKUs
        </div>
      </div>

      {/* Table */}
      <AnalysisTable
        results={filteredResults}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onOverride={(sku, field, value) => setOverride(activeTab, sku, field, value)}
        channelId={activeTab}
      />
    </div>
  );
}
