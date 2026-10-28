"use client";

import { useState } from "react";
import { useAnalysis, COMPARE_TAB, type ServerComputeScope, type StatusFilter } from "@/hooks/use-analysis";
import { ChannelComparison } from "./channel-comparison";
import { KpiCards } from "./kpi-cards";
import { AnalysisTable } from "./analysis-table";
import { CalculationCheck } from "./calculation-check";
import { PublishToSalsify } from "./publish-to-salsify";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductRow, BrandRoyaltyTable, ChannelDefaults, RoyaltyRuleEntry, ItemTypeCommissionTable } from "@/lib/pricing/types";
import { exportChangeReport, exportFullAnalysis, safeFileName } from "@/lib/export/change-report";
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight, Tag, CheckSquare } from "lucide-react";
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
  channelProductIds?: string[] | null;
  pendingPublishSkus?: string[];
}

interface Props {
  channels: ChannelDb[];
  products: ProductRow[];
  brandRoyalties: BrandRoyaltyTable;
  customerId: string;
  royaltyRules?: RoyaltyRuleEntry[];
  itemTypeCommissions?: ItemTypeCommissionTable;
  /** Open on the Publish to Salsify tab instead of the first channel. */
  openPublish?: boolean;
  canViewCost?: boolean;
  canExport?: boolean;
  /** Set for users without data:viewCost: the analysis is computed on the server and cost never reaches the browser. */
  serverCompute?: ServerComputeScope | null;
  /** salsify:publish — shows the Publish to Salsify tab. */
  canPublish?: boolean;
  /** Names exports, e.g. the customer, or "Customer — Project". */
  reportName?: string;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pass", label: "At Goal" },
  { value: "below", label: "Below" },
  { value: "loss", label: "Loss" },
  { value: "unpriced", label: "Unpriced" },
  { value: "disc", label: "Discontinued" },
];

export function AnalysisWorkspace({ channels, products, brandRoyalties, customerId, royaltyRules = [], itemTypeCommissions, openPublish, canViewCost = true, canExport = true, serverCompute = null, canPublish = true, reportName }: Props) {
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
    hideDiscontinued,
    setHideDiscontinued,
    scopedResults,
    search,
    setSearch,
    brandFilter,
    setBrandFilter,
    allBrands,
    sortKey,
    sortDir,
    handleSort,
    setOverride,
    setShipEdit,
    settingsMap,
    commitPrice,
    revertCommittedPrice,
    committedSkus,
    computing,
    computeError,
  } = useAnalysis(
    channels,
    products,
    brandRoyalties,
    customerId,
    royaltyRules,
    itemTypeCommissions,
    openPublish && canPublish ? "__publish_salsify__" : undefined,
    serverCompute,
  );
  // The Calculation Check re-runs the math in the browser, which needs cost.
  const showCalcCheck = !serverCompute;

  const isCalcCheck = activeTab === "__calc_check__";
  const isCompare = activeTab === COMPARE_TAB;
  const isPublishSalsify = activeTab === "__publish_salsify__";
  const [exportOpen, setExportOpen] = useState(false);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [calcCheckTarget, setCalcCheckTarget] = useState<{ channelId: string; sku: string } | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [bulkCommitting, setBulkCommitting] = useState(false);

  function handleSelectSku(sku: string) {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function handleSelectAll(skus: string[]) {
    setSelectedSkus(new Set(skus));
  }

  async function handleBulkCommit() {
    if (selectedSkus.size === 0 || bulkCommitting) return;
    setBulkCommitting(true);
    try {
      const skuList = Array.from(selectedSkus);
      for (const sku of skuList) {
        await commitPrice(sku);
      }
      setSelectedSkus(new Set());
    } finally {
      setBulkCommitting(false);
    }
  }

  function toggleBrand(brand: string) {
    setBrandFilter((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  }

  const visibleBrands = brandSearch
    ? allBrands.filter((b) => b.toLowerCase().includes(brandSearch.toLowerCase()))
    : allBrands;

  // Both numbers count every row on the tab (less hidden discontinued SKUs); SKUs without cost (left out of the
  // KPIs) and hidden discontinued SKUs are noted separately.
  const tabResults = scopedResults;
  const hiddenDiscCount = (results[activeTab]?.length ?? 0) - scopedResults.length;
  const missingCostCount = tabResults.filter((r) => r.invalid).length;
  const skuCountLabel =
    `${filteredResults.length} of ${tabResults.length} SKUs` +
    (missingCostCount > 0 ? ` · ${missingCostCount} missing cost` : "") +
    (hiddenDiscCount > 0 ? ` · ${hiddenDiscCount} discontinued hidden` : "");

  const activeCfg = configs.find((c) => c.id === activeTab);
  const activeSettings = settingsMap[activeTab] as unknown as ChannelDefaults | undefined;

  function handleShowMath(sku: string) {
    setCalcCheckTarget({ channelId: activeTab, sku });
    setActiveTab("__calc_check__");
  }

  function handleExport(type: "change" | "full") {
    setExportOpen(false);
    if (!canExport) return;
    const cfg = configs.find((c) => c.id === activeTab);
    if (!cfg) return;
    const channelResults = scopedResults;
    const settings = settingsMap[activeTab] as unknown as ChannelDefaults;
    const wb = type === "change"
      ? exportChangeReport(channelResults, cfg.name, settings, canViewCost)
      : exportFullAnalysis(channelResults, cfg.name, canViewCost);
    XLSX.writeFile(wb, `${safeFileName(cfg.name)}_${type === "change" ? "changes" : "full"}.xlsx`);
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
            onClick={() => { setActiveTab(cfg.id); setSelectedSkus(new Set()); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === cfg.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {cfg.tabLabel}
          </button>
        ))}
        {configs.length > 1 && (
        <button
          onClick={() => { setActiveTab(COMPARE_TAB); setSelectedSkus(new Set()); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isCompare
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Comparison
        </button>
        )}
        {showCalcCheck && (
        <button
          onClick={() => { setActiveTab("__calc_check__"); setSelectedSkus(new Set()); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isCalcCheck
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Calculation Check
        </button>
        )}
        {canPublish && (
        <button
          onClick={() => { setActiveTab("__publish_salsify__"); setSelectedSkus(new Set()); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isPublishSalsify
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Publish to Salsify
        </button>
        )}
      </div>

      {isCompare ? (
        <ChannelComparison
          configs={configs}
          results={results}
          loading={computing}
          hideDiscontinued={hideDiscontinued}
          onHideDiscontinued={setHideDiscontinued}
          canExport={canExport}
          includeCost={canViewCost}
          reportName={reportName}
          onOpen={(channelId, sku) => {
            setStatusFilter("all");
            setBrandFilter([]);
            setSearch(sku);
            setActiveTab(channelId);
          }}
        />
      ) : isCalcCheck && showCalcCheck ? (
        <CalculationCheck
          results={results}
          configs={configs}
          settingsMap={settingsMap}
          initialChannelId={calcCheckTarget?.channelId}
          initialSku={calcCheckTarget?.sku}
          canViewCost={canViewCost}
        />
      ) : isPublishSalsify && canPublish ? (
        <PublishToSalsify customerId={customerId} onRevert={revertCommittedPrice} />
      ) : (
        <>
          {/* KPIs */}
          <KpiCards kpis={kpis} loading={computing && kpis.total === 0} />

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
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
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, name, or brand..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBrandPanelOpen((o) => !o)}
                className="h-8 text-xs"
              >
                <Tag className="h-3.5 w-3.5 mr-1" />
                {brandFilter.length > 0 ? `Brands (${brandFilter.length})` : "Brands"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {brandPanelOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 w-64">
                  <div className="p-2 border-b border-gray-100">
                    <Input
                      value={brandSearch}
                      onChange={(e) => setBrandSearch(e.target.value)}
                      placeholder="Filter brands..."
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                    <button
                      onClick={() => setBrandFilter(allBrands)}
                      className="text-blue-600 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setBrandFilter([])}
                      className="text-gray-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {visibleBrands.length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-500">No brands found.</p>
                    )}
                    {visibleBrands.map((brand) => (
                      <label
                        key={brand}
                        className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-gray-50 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={brandFilter.includes(brand)}
                          onChange={() => toggleBrand(brand)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                        />
                        {brand}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideDiscontinued}
                onChange={(e) => {
                  const hide = e.target.checked;
                  setHideDiscontinued(hide);
                  // Don't leave hidden SKUs selected for Commit Selected.
                  if (hide) {
                    const disc = new Set((results[activeTab] ?? []).filter((r) => r.disc).map((r) => r.sku));
                    setSelectedSkus((prev) => new Set([...prev].filter((sku) => !disc.has(sku))));
                  }
                }}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Hide discontinued
            </label>
            <div className="ml-auto flex items-center gap-3">
              {selectedSkus.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkCommit}
                  disabled={bulkCommitting}
                  className="h-8 text-xs bg-green-600 hover:bg-green-700"
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  {bulkCommitting ? "Committing..." : `Commit Selected (${selectedSkus.size})`}
                </Button>
              )}
              <span className="text-xs text-gray-500">
                {computing ? "Calculating..." : skuCountLabel}
              </span>
              {canExport && (
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
              )}
            </div>
          </div>

          {computeError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{computeError}</div>
          )}

          {/* Table */}
          <AnalysisTable
            results={pagedResults}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onOverride={(sku, field, value) => setOverride(activeTab, sku, field, value)}
            onShipEdit={setShipEdit}
            channelId={activeTab}
            onCommit={commitPrice}
            committedSkus={committedSkus[activeTab]}
            cfg={activeCfg}
            settings={activeSettings}
            onShowMath={showCalcCheck ? handleShowMath : undefined}
            emptyMessage={computing && filteredResults.length === 0 ? "Calculating..." : undefined}
            selectedSkus={selectedSkus}
            onSelectSku={handleSelectSku}
            onSelectAll={handleSelectAll}
            canViewCost={canViewCost}
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
