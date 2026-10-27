"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { RuleRecord } from "@/lib/royalty/load";
import { canEditRule, fmtRoyalty, ruleWhere } from "./format";

interface LookupRule extends RuleRecord {
  matchedBy: "sku" | "brand";
  /** How the SKU is written in the rule; differs from the SKU when only the letter case matches. */
  listedAs: string | null;
}

interface EffectiveRow {
  customerId: string;
  customerName: string;
  carriesSku: boolean;
  channelId: string;
  channelName: string;
  rule: { id: string; value: number; mode: string } | null;
  level: "channel" | "customer" | "global" | null;
  matchedBy: "sku" | "brand" | null;
  tieCount: number;
}

interface LookupResult {
  query: string;
  sku: string;
  product: { id: string; sku: string; name: string | null; brand: string | null } | null;
  rules: LookupRule[];
  effective: EffectiveRow[];
}

const LEVEL_LABEL = { channel: "Channel override", customer: "Customer override", global: "Global rule" } as const;

export function SkuLookup({
  canEditGlobal,
  canEditCustomer,
  onEdit,
}: {
  canEditGlobal: boolean;
  canEditCustomer: boolean;
  onEdit: (rule: RuleRecord) => void;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const sku = q.trim();
    if (!sku) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/royalty-rules/lookup?sku=${encodeURIComponent(sku)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Search failed");
        setResult(null);
      } else {
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  }

  const ruleById = new Map(result?.rules.map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enter a SKU" className="pl-9" autoFocus />
        </div>
        <Button type="submit" disabled={loading || !q.trim()}>
          {loading ? "Searching..." : "Find Rules"}
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            {result.product ? (
              <p className="text-sm text-gray-700">
                <Link href={`/products/${result.product.id}`} className="font-mono text-blue-600 hover:underline">
                  {result.product.sku}
                </Link>
                {result.product.name && <span> · {result.product.name}</span>}
                <span className="text-gray-500"> · Brand: {result.product.brand || "none"}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                <span className="font-mono">{result.sku}</span> isn&apos;t in the Product Database, so brand rules can&apos;t be
                matched. Showing SKU rules that list it.
              </p>
            )}
          </div>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Rules that pertain to this SKU ({result.rules.length})</h3>
            {result.rules.length === 0 ? (
              <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg py-6 text-center">
                No royalty rule lists this SKU or its brand.
              </p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2 px-4 text-gray-600 font-medium">Applies to</th>
                      <th className="text-left py-2 px-4 text-gray-600 font-medium">Matches by</th>
                      <th className="text-right py-2 px-4 text-gray-600 font-medium">Royalty</th>
                      <th className="text-right py-2 px-4 text-gray-600 font-medium w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rules.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2 px-4 text-gray-700">{ruleWhere(r)}</td>
                        <td className="py-2 px-4 text-gray-700">
                          {r.matchedBy === "brand" ? (
                            <span>Brand: {r.brandName ?? r.brandKey}</span>
                          ) : (
                            <span>
                              SKU rule ({r.skus.length} SKU{r.skus.length !== 1 ? "s" : ""})
                            </span>
                          )}
                          {r.listedAs && r.listedAs !== result.sku && (
                            <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Listed as <span className="font-mono">{r.listedAs}</span>. The letter case differs, so the analysis
                              won&apos;t apply this rule.
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right font-medium">{fmtRoyalty(r.value, r.mode)}</td>
                        <td className="py-2 px-4 text-right">
                          {canEditRule(r, { canEditGlobal, canEditCustomer }) && (
                            <button
                              onClick={() => onEdit(r)}
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              title="Edit rule"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Royalty used in the analysis</h3>
            <p className="text-xs text-gray-500 mb-2">
              For each channel of the customers that carry this SKU or have an override for it. Most specific wins: channel
              override, then customer override, then global rule; a SKU rule beats a brand rule at the same level.
            </p>
            {result.effective.length === 0 ? (
              <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg py-6 text-center">
                None of your customers carry this SKU or have an override for it.
              </p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2 px-4 text-gray-600 font-medium">Customer</th>
                      <th className="text-left py-2 px-4 text-gray-600 font-medium">Channel</th>
                      <th className="text-right py-2 px-4 text-gray-600 font-medium">Royalty</th>
                      <th className="text-left py-2 px-4 text-gray-600 font-medium">From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.effective.map((e) => {
                      const rule = e.rule ? ruleById.get(e.rule.id) : undefined;
                      return (
                        <tr key={`${e.customerId}|${e.channelId}`} className="border-b border-gray-50">
                          <td className="py-2 px-4 text-gray-700">
                            {e.customerName}
                            {!e.carriesSku && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                Doesn&apos;t carry this SKU
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-4 text-gray-700">{e.channelName}</td>
                          <td className="py-2 px-4 text-right font-medium">
                            {e.rule ? fmtRoyalty(e.rule.value, e.rule.mode) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="py-2 px-4 text-gray-600 text-xs">
                            {e.rule && e.level ? (
                              <>
                                {LEVEL_LABEL[e.level]} ({e.matchedBy === "brand" ? `brand ${rule?.brandName ?? ""}`.trim() : "SKU"})
                                {e.tieCount > 0 && (
                                  <p className="text-red-600 mt-0.5 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    {e.tieCount} other rule{e.tieCount !== 1 ? "s" : ""} at this level also match. See Duplicates.
                                  </p>
                                )}
                              </>
                            ) : (
                              "No rule. The channel's royalty settings apply."
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
