"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RuleRecord } from "@/lib/royalty/load";
import { findDuplicateRules, type DuplicateGroup } from "@/lib/royalty/rules";
import { canEditRule, fmtRoyalty, ruleApiUrl, ruleTarget, ruleWhere } from "./format";

interface Fix {
  title: string;
  description: string;
  /** Rule changes to send: new SKU list, or null to delete the rule. */
  changes: { rule: RuleRecord; skus: string[] | null }[];
}

const SHOW_SKUS = 12;

export function DuplicateRules({
  canEditGlobal,
  canEditCustomer,
  version,
  onEdit,
  onChanged,
  onCount,
}: {
  canEditGlobal: boolean;
  canEditCustomer: boolean;
  /** Bumped when rules change elsewhere on the page. */
  version: number;
  onEdit: (rule: RuleRecord) => void;
  onChanged: () => void;
  onCount?: (n: number) => void;
}) {
  const [rules, setRules] = useState<RuleRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [applying, setApplying] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/royalty-rules/all");
    if (!res.ok) {
      setError("Couldn't load the rules");
      return;
    }
    setRules((await res.json()).rules);
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const groups = useMemo(() => {
    const found = findDuplicateRules(rules ?? []);
    const conflict = (g: DuplicateGroup<RuleRecord>) => new Set(g.rules.map((r) => `${r.mode}|${r.value}`)).size > 1;
    return found
      .map((g) => ({ ...g, conflict: g.kind !== "within" && conflict(g) }))
      .sort((a, b) => Number(b.conflict) - Number(a.conflict) || ruleWhere(a.rules[0]).localeCompare(ruleWhere(b.rules[0])));
  }, [rules]);

  useEffect(() => {
    if (rules) onCount?.(groups.length);
  }, [groups.length, rules, onCount]);

  const perms = { canEditGlobal, canEditCustomer };

  async function applyFix() {
    if (!fix) return;
    setApplying(true);
    setFixError(null);
    try {
      for (const c of fix.changes) {
        const res = await fetch(ruleApiUrl(c.rule), {
          method: c.skus ? "PATCH" : "DELETE",
          headers: c.skus ? { "Content-Type": "application/json" } : undefined,
          body: c.skus ? JSON.stringify({ skus: c.skus }) : undefined,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setFixError(data.error || "Couldn't update a rule");
          return;
        }
      }
      setFix(null);
      onChanged();
      await load();
    } finally {
      setApplying(false);
    }
  }

  function keepIn(group: DuplicateGroup<RuleRecord>, keep: RuleRecord) {
    const shared = new Set(group.skus);
    const changes = group.rules
      .filter((r) => r.id !== keep.id)
      .map((r) => {
        const left = r.skus.filter((s) => !shared.has(s));
        return { rule: r, skus: left.length > 0 ? left : null };
      });
    const deleting = changes.filter((c) => !c.skus).length;
    setFixError(null);
    setFix({
      title: `Keep ${group.skus.length} SKU${group.skus.length !== 1 ? "s" : ""} in the ${fmtRoyalty(keep.value, keep.mode)} rule`,
      description:
        `The shared SKUs are removed from the other ${changes.length} rule${changes.length !== 1 ? "s" : ""}.` +
        (deleting > 0 ? ` ${deleting} of them would have no SKUs left, so ${deleting === 1 ? "it is" : "they are"} deleted.` : ""),
      changes,
    });
  }

  function keepBrandRule(group: DuplicateGroup<RuleRecord>, keep: RuleRecord) {
    const others = group.rules.filter((r) => r.id !== keep.id);
    setFixError(null);
    setFix({
      title: `Keep the ${fmtRoyalty(keep.value, keep.mode)} rule`,
      description: `The other ${others.length} brand rule${others.length !== 1 ? "s" : ""} for ${keep.brandName ?? keep.brandKey} at this level ${others.length !== 1 ? "are" : "is"} deleted.`,
      changes: others.map((r) => ({ rule: r, skus: null })),
    });
  }

  function removeRepeats(rule: RuleRecord) {
    setFixError(null);
    setFix({
      title: "Remove repeated SKUs",
      description: "Each SKU is kept once in this rule. The royalty doesn't change.",
      changes: [{ rule, skus: [...new Set(rule.skus)] }],
    });
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rules) return <p className="text-sm text-gray-500 py-10 text-center">Checking rules...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Rules at the same level (global, a customer, or a customer&apos;s channel) that cover the same SKU or brand. When their
        royalties differ, the analysis uses one of them and which one isn&apos;t predictable. Overrides at different levels
        aren&apos;t listed: replacing a global rule for a customer or channel is what they&apos;re for.
      </p>

      {groups.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          No duplicates in the {rules.length} rule{rules.length !== 1 ? "s" : ""} you can see.
        </div>
      ) : (
        groups.map((g, i) => {
          const where = ruleWhere(g.rules[0]);
          const showAll = expanded.has(i);
          const skus = showAll ? g.skus : g.skus.slice(0, SHOW_SKUS);
          return (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {g.kind === "sku" &&
                      `${g.skus.length} SKU${g.skus.length !== 1 ? "s" : ""} in ${g.rules.length} rules`}
                    {g.kind === "brand" && `${g.rules.length} rules for brand ${g.rules[0].brandName ?? g.brandKey}`}
                    {g.kind === "within" && `A rule lists ${g.skus.length} SKU${g.skus.length !== 1 ? "s" : ""} more than once`}
                  </p>
                  <p className="text-xs text-gray-500">{where}</p>
                </div>
                {g.kind === "within" ? (
                  <Badge variant="secondary" className="text-xs shrink-0">Harmless</Badge>
                ) : g.conflict ? (
                  <Badge variant="destructive" className="text-xs shrink-0">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Different royalties
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs shrink-0">Same royalty, redundant</Badge>
                )}
              </div>

              {g.skus.length > 0 && (
                <p className="font-mono text-xs text-gray-700 mb-3 break-words">
                  {skus.join(", ")}
                  {g.skus.length > SHOW_SKUS && (
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      className="ml-2 font-sans text-blue-600 hover:underline"
                    >
                      {showAll ? "Show less" : `+${g.skus.length - SHOW_SKUS} more`}
                    </button>
                  )}
                </p>
              )}

              <table className="w-full text-sm">
                <tbody>
                  {g.rules.map((r) => {
                    const editable = canEditRule(r, perms);
                    return (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-3 text-gray-700">{ruleTarget(r)}</td>
                        <td className="py-1.5 pr-3 text-right font-medium w-24">{fmtRoyalty(r.value, r.mode)}</td>
                        <td className="py-1.5 text-right w-64">
                          {editable && (
                            <div className="flex items-center justify-end gap-2">
                              {g.kind === "sku" && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => keepIn(g, r)}>
                                  Keep SKUs here
                                </Button>
                              )}
                              {g.kind === "brand" && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => keepBrandRule(g, r)}>
                                  Keep this one
                                </Button>
                              )}
                              {g.kind === "within" && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => removeRepeats(r)}>
                                  Remove repeats
                                </Button>
                              )}
                              <button
                                onClick={() => onEdit(r)}
                                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                title="Edit rule"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {g.rules.some((r) => !canEditRule(r, perms)) && (
                <p className="text-xs text-gray-500 mt-2">
                  {g.rules[0].customerId ? "You need royalty edit permission to clean these up." : "An admin needs to clean up global rules."}
                </p>
              )}
            </div>
          );
        })
      )}

      <Dialog open={fix != null} onOpenChange={(o) => !o && setFix(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fix?.title}</DialogTitle>
            <DialogDescription>{fix?.description}</DialogDescription>
          </DialogHeader>
          {fixError && <p className="text-sm text-red-600">{fixError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFix(null)}>
              Cancel
            </Button>
            <Button onClick={applyFix} disabled={applying}>
              {applying ? "Saving..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
