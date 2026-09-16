"use client";

import { useState } from "react";
import { useAnalysis, type StatusFilter } from "@/hooks/use-analysis";
import { KpiCards } from "./kpi-cards";
import { AnalysisTable } from "./analysis-table";
import { CalculationCheck } from "./calculation-check";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductRow, BrandRoyaltyTable, ChannelDefaults, RoyaltyRuleEntry } from "@/lib/pricing/types";
import { exportChangeReport, exportFullAnalysis } from "@/lib/export/change-report";
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

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
  royaltyRules?: RoyaltyRuleEntry[];
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pass", label: "At Goal" },
  { value: "below", label: "Below" },
  { value: "loss", label: "Loss" },
  { value: "unpriced", label: "Unpriced" },
];

export function AnalysisWorkspace({ channels, products, brandRoyalties, customerId, royaltyRules = [] }: Props) {
  const {
    configs,
    activeTab,
    setActiveTab,
    results,
    filteredResults,
    pagedResults,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    kpis,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sortKey,
    sortDir,
    handleSort,
    setOverride,
    settingsMap,
    commitPrice,
  } = useAnalysis(channels, products, brandRoyalties, customerId, royaltyRules);

  const isCalcCheck = activeTab === "__calc_check__";
  const [exportOpen, setExportOpen] = useState(false);
  const [calcCheckTarget, setCalcCheckTarget] = useState<{ channelId: string; sku: string } | null>(null);

  const activeCfg = configs.find((c) => c.id === activeTab);
  const activeSettings = settingsMap[activeTab] as unknown as ChannelDefaults | undefined;

  function handleShowMath(sku: string) {
    setCalcCheckTarget({ channelId: activeTab, sku });
    setActiveTab("__calc_check__");
  }

  function handleExport(type: "change" | "full") {
    setExportOpen(false);
    const cfg = configs.find((c) => c.id === activeTab);
    if (!cfg) return;
    const channelResults = results[activeTab] ?? [];
    const settings = settingsMap[activeTab] as unknown as ChannelDefaults;
    const wb = type === "change"
      ? exportChangeReport(channelResults, cfg.name, settings)
      : exportFullAnalysis(channelResults, cfg.name);
    XLSX.writeFile(wb, `${cfg.name.replace(/\s+/g, "_")}_${type === "change" ? "changes" : "full"}.xlsx`);
  }

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
        <button
          onClick={() => setActiveTab("__calc_check__")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isCalcCheck
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Calculation Check
        </button>
      </div>

      {isCalcCheck ? (
        <CalculationCheck
          results={results}
          configs={configs}
          settingsMap={settingsMap}
          initialChannelId={calcCheckTarget?.channelId}
          initialSku={calcCheckTarget?.sku}
        />
      ) : (
        <>
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
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {filteredResults.length} of {kpis.total} SKUs
              </span>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportOpen((o) => !o)}
                  className="h-8 text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
                {exportOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1 w-44">
                    <button
                      onClick={() => handleExport("change")}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Change Report
                    </button>
                    <button
                      onClick={() => handleExport("full")}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Full Analysis
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <AnalysisTable
            results={pagedResults}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onOverride={(sku, field, value) => setOverride(activeTab, sku, field, value)}
            channelId={activeTab}
            onCommit={commitPrice}
            cfg={activeCfg}
            settings={activeSettings}
            onShowMath={handleShowMath}
          />

          {/* Pagination */}
          {filteredResults.length > 0 && (
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(v === "all" ? "all" : Number(v))}
                >
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {pageSize !== "all" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
