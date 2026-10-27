import type { RuleRecord } from "@/lib/royalty/load";

export function fmtRoyalty(value: number, mode: string): string {
  return mode === "pct" ? `${value}%` : `$${value.toFixed(2)}`;
}

/** "Global", "Acme", or "Acme · eBay (JSP)". */
export function ruleWhere(r: Pick<RuleRecord, "customerName" | "channelName" | "customerId">): string {
  if (!r.customerId) return "Global";
  return r.channelName ? `${r.customerName} · ${r.channelName}` : `${r.customerName ?? "Customer"} · All channels`;
}

export function ruleTarget(r: Pick<RuleRecord, "scope" | "brandName" | "brandKey" | "skus">): string {
  if (r.scope === "brand") return `Brand: ${r.brandName ?? r.brandKey ?? "-"}`;
  return `${r.skus.length} SKU${r.skus.length !== 1 ? "s" : ""}`;
}

export function ruleApiUrl(r: Pick<RuleRecord, "id" | "customerId">): string {
  return r.customerId ? `/api/customers/${r.customerId}/royalty-rules/${r.id}` : `/api/royalty-rules/${r.id}`;
}

export function canEditRule(r: Pick<RuleRecord, "customerId">, perms: { canEditGlobal: boolean; canEditCustomer: boolean }) {
  return r.customerId ? perms.canEditCustomer : perms.canEditGlobal;
}
