"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/lib/pricing/types";
import type { ShipComponentKey } from "@/lib/pricing/shipping";

interface Component {
  key: ShipComponentKey;
  label: string;
  perUnit: boolean;
}

function currentValue(r: AnalysisResult, key: ShipComponentKey): number | null {
  const v = r[key];
  return typeof v === "number" && isFinite(v) ? v : null;
}

/** Ship total that opens an editor for each cost component that makes it up. */
export function ShipCell({
  result: r,
  components,
  onEdit,
}: {
  result: AnalysisResult;
  components: Component[];
  onEdit: (key: ShipComponentKey, value: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function openEditor() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 288;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const below = rect.bottom + 4;
      const top = below + 260 > window.innerHeight ? Math.max(8, rect.top - 264) : below;
      setPos({ top, left });
    }
    const d: Record<string, string> = {};
    for (const c of components) {
      const v = currentValue(r, c.key);
      d[c.key] = v != null ? v.toFixed(2) : "";
    }
    setDrafts(d);
    setOpen(true);
  }

  function apply() {
    for (const c of components) {
      const raw = drafts[c.key]?.trim() ?? "";
      if (raw === "") continue;
      const v = parseFloat(raw);
      if (!isFinite(v) || v < 0) continue;
      const cur = currentValue(r, c.key);
      if (cur == null || Math.abs(v - cur) >= 0.005) onEdit(c.key, v);
    }
    setOpen(false);
  }

  function resetEdits() {
    for (const c of components) onEdit(c.key, undefined);
    setOpen(false);
  }

  const previewTotal = components.reduce((sum, c) => {
    const v = parseFloat(drafts[c.key] ?? "");
    return sum + (isFinite(v) ? v : 0) * (c.perUnit ? r.units : 1);
  }, 0);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openEditor())}
        className={cn("text-xs hover:underline", r.shipEdited ? "text-blue-600 font-medium" : "text-gray-600")}
        title="Edit shipping costs"
      >
        {r.hasShippingData || r.shipEdited ? `$${r.ship.toFixed(2)}` : "-"}
      </button>

      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg"
        >
          <p className="text-xs font-medium text-gray-900 mb-2">Shipping costs · {r.sku}</p>
          <div className="space-y-2">
            {components.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <label className="text-xs text-gray-700 flex-1">
                  {c.label}
                  <span className="block text-[10px] text-gray-400">
                    {c.perUnit ? (r.units > 1 ? `per unit × ${r.units}` : "per unit") : "per order"}
                  </span>
                </label>
                <span className="text-xs text-gray-500">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={drafts[c.key] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") apply();
                  }}
                  className="w-24 h-7 text-xs px-2"
                  autoFocus={c === components[0]}
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Total ship: <span className="font-medium text-gray-900">${previewTotal.toFixed(2)}</span>
            <span className="block mt-0.5">
              Applies to every channel using these costs. Saved to the product on Commit.
            </span>
          </p>
          <div className="flex items-center justify-between mt-3">
            {r.shipEdited ? (
              <button onClick={resetEdits} className="text-xs text-gray-500 hover:text-red-600">
                Discard edits
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
