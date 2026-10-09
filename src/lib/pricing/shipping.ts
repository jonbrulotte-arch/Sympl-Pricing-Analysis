export type ShipComponentKey = "shipping" | "mcfShip" | "mcfFreight" | "fbaFee";
export type ShippingChanges = Partial<Record<ShipComponentKey, number>>;

export const SHIP_COMPONENTS: { key: ShipComponentKey; shippingType: string; label: string; perUnit: boolean }[] = [
  { key: "shipping", shippingType: "std", label: "Shipping cost", perUnit: true },
  { key: "mcfShip", shippingType: "mcf_ship", label: "MCF shipping", perUnit: true },
  { key: "mcfFreight", shippingType: "mcf_freight", label: "To-MCF freight", perUnit: true },
  { key: "fbaFee", shippingType: "fba_fee", label: "FBA fee", perUnit: true },
];

/** The cost components that add up to a channel's Ship total (see computeShipping in engine.ts). */
export function shipComponentsFor(cfg: { shippingMode: string; channelType?: string }) {
  if (cfg.channelType === "commercial") return [];
  const keys: ShipComponentKey[] =
    cfg.shippingMode === "fba" ? ["fbaFee", "mcfFreight"] : cfg.shippingMode === "mcf" ? ["mcfShip", "mcfFreight"] : ["shipping"];
  return keys.map((k) => SHIP_COMPONENTS.find((c) => c.key === k)!);
}

/** Keeps only known components with finite, non-negative values. Returns null when nothing valid remains. */
export function parseShippingChanges(input: unknown): ShippingChanges | null {
  if (!input || typeof input !== "object") return null;
  const out: ShippingChanges = {};
  for (const c of SHIP_COMPONENTS) {
    const v = (input as Record<string, unknown>)[c.key];
    if (typeof v === "number" && isFinite(v) && v >= 0) out[c.key] = Math.round(v * 10000) / 10000;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function mergeShippingChanges(a: unknown, b: ShippingChanges | null): ShippingChanges | null {
  const merged = { ...(parseShippingChanges(a) ?? {}), ...(b ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}
