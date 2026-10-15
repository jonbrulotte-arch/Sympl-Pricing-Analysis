"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SingleSkuCalculator } from "./single-sku-calculator";

interface CustomerOption {
  id: string;
  name: string;
  channels: { id: string; name: string; channelType: string; isDefault: boolean }[];
}

interface ProductHit {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  onCustomer: boolean;
}

const STEPS = ["Customer", "SKU", "Calculator"];

/** A SKU picked before the wizard opened (from a product page), with the customers that carry it. */
export interface StartProduct {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  customerIds: string[];
}

export function SingleSkuWizard({
  customers,
  canExport,
  startProduct = null,
}: {
  customers: CustomerOption[];
  canExport: boolean;
  startProduct?: StartProduct | null;
}) {
  // When exactly one customer (with channels) carries the SKU, go straight to the calculator.
  const carriers = startProduct
    ? customers.filter((c) => startProduct.customerIds.includes(c.id) && c.channels.length > 0)
    : [];
  const direct = carriers.length === 1 ? carriers[0] : null;
  const [pinned, setPinned] = useState<StartProduct | null>(startProduct);
  const [step, setStep] = useState(direct ? 2 : 0);
  const [customerId, setCustomerId] = useState(direct?.id ?? "");
  const [product, setProduct] = useState<ProductHit | null>(
    direct && startProduct ? { ...startProduct, onCustomer: true } : null,
  );
  // Bumped to start a fresh calculator when the same selection is reopened.
  const [session, setSession] = useState(0);

  const customer = customers.find((c) => c.id === customerId);

  function startCalculator(p: ProductHit | null) {
    setProduct(p);
    setSession((s) => s + 1);
    setStep(2);
  }

  return (
    <div>
      <ol className="flex items-center gap-2 mb-6 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium",
                i === step ? "bg-blue-600 text-white" : i < step ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500",
              )}
            >
              {i + 1}
            </span>
            <span className={i === step ? "text-gray-900 font-medium" : "text-gray-500"}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-gray-300 mx-1">/</span>}
          </li>
        ))}
      </ol>

      {step === 0 && pinned && (
        <div className="max-w-xl mb-4 flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-sm text-gray-700 min-w-0">
            Analyzing <span className="font-mono text-blue-700">{pinned.sku}</span>
            {pinned.name && <span className="text-gray-500"> · {pinned.name}</span>}
          </p>
          <button
            onClick={() => setPinned(null)}
            className="shrink-0 text-gray-500 hover:text-gray-700"
            aria-label="Choose a different SKU"
            title="Choose a different SKU"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 0 && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Choose a customer</CardTitle>
            <p className="text-xs text-gray-500">You can switch between the customer&apos;s channels in the calculator.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {customers.length === 0 ? (
              <p className="text-sm text-gray-500">You don&apos;t have access to any customers yet.</p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <Select
                    value={customerId}
                    onValueChange={setCustomerId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {pinned?.customerIds.includes(c.id) ? " (carries this SKU)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {customer && customer.channels.length === 0 && (
                  <p className="text-xs text-gray-500">This customer has no channels set up yet, so there&apos;s nothing to price against.</p>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={() =>
                      pinned && customer
                        ? startCalculator({ ...pinned, onCustomer: pinned.customerIds.includes(customer.id) })
                        : setStep(1)
                    }
                    disabled={!customer || customer.channels.length === 0}
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && customer && (
        <SkuStep customer={customer} onBack={() => setStep(0)} onPick={startCalculator} />
      )}

      {step === 2 && customer && (
        <SingleSkuCalculator
          key={session}
          customerId={customer.id}
          customerName={customer.name}
          channels={customer.channels}
          canExport={canExport}
          productId={product?.id ?? null}
          onBack={() => {
            setPinned(null);
            setStep(1);
          }}
          onDiscard={() => {
            setProduct(null);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}

function SkuStep({
  customer,
  onBack,
  onPick,
}: {
  customer: CustomerOption;
  onBack: () => void;
  onPick: (p: ProductHit | null) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/single-sku/products?customerId=${encodeURIComponent(customer.id)}&q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const data = await res.json().catch(() => ({}));
        setHits(res.ok ? data.products : []);
      } catch {
        // aborted by a newer search
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, customer.id]);

  return (
    <div>
      <p className="text-sm font-medium text-gray-900 mb-4">{customer.name}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing SKU</CardTitle>
            <p className="text-xs text-gray-500">Search the Product Database. Changes you make here aren&apos;t saved to it.</p>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or name..." className="pl-9" autoFocus />
            </div>
            {q.trim().length >= 2 && !searching && hits.length === 0 && (
              <p className="text-sm text-gray-500">No matching SKUs you have access to.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => onPick(h)}
                    className="w-full text-left py-2 px-1 hover:bg-gray-50 rounded flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-blue-600">{h.sku}</span>
                      <span className="block text-sm text-gray-700 truncate">{h.name ?? "-"}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {h.brand && <span className="text-xs text-gray-500">{h.brand}</span>}
                      {!h.onCustomer && <Badge variant="secondary" className="text-[10px]">Not on {customer.name}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New SKU</CardTitle>
            <p className="text-xs text-gray-500">
              Start from scratch with the customer&apos;s channel allocations. You can add it to the Product Database when you&apos;re done.
            </p>
          </CardHeader>
          <CardContent>
            <Button onClick={() => onPick(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Create a new SKU
            </Button>
          </CardContent>
        </Card>
      </div>
      <Button variant="outline" className="mt-4" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>
    </div>
  );
}
