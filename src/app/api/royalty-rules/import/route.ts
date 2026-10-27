import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { brandKey } from "@/lib/pricing/helpers";
import { logActivity } from "@/lib/activity-log";
import { loadAccessibleRules, type RuleRecord } from "@/lib/royalty/load";
import { findDuplicateRules } from "@/lib/royalty/rules";
import { ALL_CHANNELS_LABEL, GLOBAL_LABEL, type ImportRow } from "@/lib/royalty/spreadsheet";

const MAX_ROWS = 5000;

type Op = "create" | "update" | "delete" | "unchanged";

interface RowResult {
  row: number;
  op: Op | null;
  label: string;
  changes: string[];
  error: string | null;
}

interface Planned {
  op: Op;
  id: string;
  data: {
    customerId: string | null;
    channelId: string | null;
    scope: "brand" | "sku";
    brandKey: string | null;
    brandName: string | null;
    skus: string[];
    value: number;
    mode: "pct" | "usd";
  };
}

const lower = (s: string) => s.trim().toLowerCase();
const isYes = (s: string) => ["yes", "y", "x", "true", "1", "delete"].includes(lower(s));

function parseMode(mode: string, value: string): "pct" | "usd" | null {
  const m = lower(mode);
  if (["%", "pct", "percent", "percentage"].includes(m)) return "pct";
  if (["$", "usd", "dollar", "dollars", "flat"].includes(m)) return "usd";
  if (m === "") {
    if (value.includes("%")) return "pct";
    if (value.includes("$")) return "usd";
  }
  return null;
}

function show(r: { scope: string; brandName: string | null; skus: string[]; value: number; mode: string }) {
  const amount = r.mode === "pct" ? `${r.value}%` : `$${r.value.toFixed(2)}`;
  const target =
    r.scope === "brand"
      ? `brand ${r.brandName}`
      : r.skus.length <= 3
        ? r.skus.join(", ")
        : `${r.skus.slice(0, 3).join(", ")} +${r.skus.length - 3} more`;
  return `${target}: ${amount}`;
}

/**
 * POST { rows, apply } — checks an edited royalty rules spreadsheet and, when `apply` is true and no row has an
 * error, creates, updates and deletes the rules in one transaction. Rules left out of the file are not touched.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const perms = await getPermissions(session.user.role);
  if (!perms.has("module:royalties") || !perms.has("royalties:edit"))
    return NextResponse.json({ error: "You don't have permission to edit royalties" }, { status: 403 });
  const canEditGlobal = perms.has("admin:settings");

  const body = await req.json().catch(() => null);
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "The file has no rule rows" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Import up to ${MAX_ROWS} rows at a time` }, { status: 400 });
  const apply = body?.apply === true;

  const { customers, rules } = await loadAccessibleRules(session.user.id, session.user.role);
  const existingById = new Map(rules.map((r) => [r.id, r]));
  const customersByName = new Map<string, typeof customers>();
  for (const c of customers) customersByName.set(lower(c.name), [...(customersByName.get(lower(c.name)) ?? []), c]);

  const results: RowResult[] = [];
  const planned: Planned[] = [];
  const seenIds = new Set<string>();

  for (const raw of rows) {
    const r: ImportRow = {
      row: Number(raw.row) || 0,
      ruleId: String(raw.ruleId ?? "").trim(),
      customer: String(raw.customer ?? "").trim(),
      channel: String(raw.channel ?? "").trim(),
      scope: String(raw.scope ?? "").trim(),
      brand: String(raw.brand ?? "").trim(),
      skus: String(raw.skus ?? ""),
      value: String(raw.value ?? "").trim(),
      mode: String(raw.mode ?? "").trim(),
      delete: String(raw.delete ?? "").trim(),
    };
    const result: RowResult = { row: r.row, op: null, label: "", changes: [], error: null };
    results.push(result);
    const fail = (msg: string) => {
      result.error = msg;
    };

    const existing = r.ruleId ? existingById.get(r.ruleId) : undefined;
    if (r.ruleId && !existing && isYes(r.delete)) {
      // Already deleted, e.g. the same file imported twice.
      result.op = "unchanged";
      result.label = "Already deleted";
      continue;
    }
    if (r.ruleId && !existing) {
      fail("Rule ID not found. Leave Rule ID blank to add a new rule.");
      continue;
    }
    if (r.ruleId) {
      if (seenIds.has(r.ruleId)) {
        fail("This Rule ID appears on more than one row.");
        continue;
      }
      seenIds.add(r.ruleId);
    }

    if (isYes(r.delete)) {
      if (!existing) {
        fail("Delete needs the Rule ID of an existing rule.");
        continue;
      }
      if (existing.customerId == null && !canEditGlobal) {
        fail("Only admins can delete global rules.");
        continue;
      }
      result.op = "delete";
      result.label = `${existing.customerName ?? GLOBAL_LABEL} · ${show(existing)}`;
      planned.push({ op: "delete", id: existing.id, data: toData(existing) });
      continue;
    }
    if (r.delete && !["no", "n", "false", "0"].includes(lower(r.delete))) {
      fail(`Delete should be Yes or blank, not "${r.delete}".`);
      continue;
    }

    // Customer and channel
    let customerId: string | null = null;
    let customerName = GLOBAL_LABEL;
    let channelId: string | null = null;
    const custText = r.customer;
    if (custText === "" || lower(custText) === lower(GLOBAL_LABEL)) {
      if (r.channel && lower(r.channel) !== lower(ALL_CHANNELS_LABEL)) {
        fail("Global rules apply to every channel. Clear the Channel, or name a customer for a channel override.");
        continue;
      }
    } else {
      const matches = customersByName.get(lower(custText)) ?? [];
      if (matches.length === 0) {
        fail(`Customer "${custText}" not found, or you don't have access to it.`);
        continue;
      }
      if (matches.length > 1) {
        fail(`More than one customer is named "${custText}". Edit this rule on the Royalty Rules page instead.`);
        continue;
      }
      customerId = matches[0].id;
      customerName = matches[0].name;
      if (r.channel && lower(r.channel) !== lower(ALL_CHANNELS_LABEL)) {
        const ch = matches[0].channels.filter((c) => lower(c.name) === lower(r.channel));
        if (ch.length !== 1) {
          fail(ch.length === 0 ? `${customerName} has no channel named "${r.channel}".` : `${customerName} has more than one channel named "${r.channel}".`);
          continue;
        }
        channelId = ch[0].id;
      }
    }
    if (existing && existing.customerId !== customerId) {
      fail("A rule can't move to a different customer. Delete it and add a new row instead.");
      continue;
    }

    // Scope and target
    const scopeText = lower(r.scope);
    const scope = scopeText === "brand" ? "brand" : ["sku", "skus"].includes(scopeText) ? "sku" : null;
    if (!scope) {
      fail(`Scope should be Brand or SKU, not "${r.scope}".`);
      continue;
    }
    const skus = scope === "sku" ? [...new Set(r.skus.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean))] : [];
    if (scope === "brand" && !brandKey(r.brand)) {
      fail("Brand rules need a Brand.");
      continue;
    }
    if (scope === "sku" && skus.length === 0) {
      fail("SKU rules need at least one SKU.");
      continue;
    }

    // Value and mode
    const value = parseFloat(r.value.replace(/[$%,\s]/g, ""));
    if (!isFinite(value) || value < 0) {
      fail(`Value should be a number of 0 or more, not "${r.value}".`);
      continue;
    }
    const mode = parseMode(r.mode, r.value);
    if (!mode) {
      fail(r.mode ? `Mode should be % or $, not "${r.mode}".` : "Mode should be % or $.");
      continue;
    }

    const data: Planned["data"] = {
      customerId,
      channelId,
      scope,
      brandKey: scope === "brand" ? brandKey(r.brand) : null,
      brandName: scope === "brand" ? r.brand : null,
      skus,
      value,
      mode,
    };
    result.label = `${customerName}${channelId ? ` · ${r.channel}` : ""} · ${show(data)}`;

    const changes = existing ? describeChanges(existing, data, r.channel) : [];
    const op: Op = !existing ? "create" : changes.length > 0 ? "update" : "unchanged";
    // Unchanged global rows are fine for anyone: they come back in every export.
    if (customerId == null && op !== "unchanged" && !canEditGlobal) {
      fail("Only admins can add or change global rules.");
      continue;
    }
    result.op = op;
    result.changes = changes;
    planned.push({ op, id: existing?.id ?? randomUUID(), data });
  }

  const errorCount = results.filter((r) => r.error).length;
  const count = (op: Op) => planned.filter((p) => p.op === op).length;
  const summary = { create: count("create"), update: count("update"), delete: count("delete"), unchanged: count("unchanged"), errors: errorCount };

  // Duplicates the rule set would have once imported.
  const after = new Map<string, { id: string; scope: "brand" | "sku"; brandKey: string | null; skus: string[]; customerId: string | null; channelId: string | null }>(
    rules.map((r) => [r.id, r]),
  );
  for (const p of planned) {
    if (p.op === "delete") after.delete(p.id);
    else after.set(p.id, { id: p.id, ...p.data });
  }
  const duplicatesAfter = findDuplicateRules([...after.values()]).length;

  if (!apply || errorCount > 0) {
    return NextResponse.json({ applied: false, summary, duplicatesAfter, rows: results });
  }

  const writes = planned.filter((p) => p.op !== "unchanged");
  await prisma.$transaction(
    writes.map((p) =>
      p.op === "delete"
        ? prisma.royaltyRule.delete({ where: { id: p.id } })
        : p.op === "create"
          ? prisma.royaltyRule.create({ data: { id: p.id, ...p.data } })
          : prisma.royaltyRule.update({ where: { id: p.id }, data: p.data }),
    ),
  );

  logActivity({
    action: "royaltyRule.import",
    category: "royalty",
    summary: `Imported royalty rules: ${summary.create} added, ${summary.update} updated, ${summary.delete} deleted`,
    detail: { ...summary, rowCount: rows.length },
    userId: session.user.id,
  });

  return NextResponse.json({ applied: true, summary, duplicatesAfter, rows: results });
}

function toData(r: RuleRecord): Planned["data"] {
  return {
    customerId: r.customerId,
    channelId: r.channelId,
    scope: r.scope,
    brandKey: r.brandKey,
    brandName: r.brandName,
    skus: r.skus,
    value: r.value,
    mode: r.mode,
  };
}

function describeChanges(prev: RuleRecord, next: Planned["data"], channelText: string): string[] {
  const changes: string[] = [];
  if (prev.channelId !== next.channelId)
    changes.push(`Channel: ${prev.channelName ?? ALL_CHANNELS_LABEL} → ${next.channelId ? channelText : ALL_CHANNELS_LABEL}`);
  if (prev.scope !== next.scope) changes.push(`Scope: ${prev.scope} → ${next.scope}`);
  if (next.scope === "brand" && (prev.brandName ?? "") !== (next.brandName ?? ""))
    changes.push(`Brand: ${prev.brandName ?? "-"} → ${next.brandName}`);
  if (next.scope === "sku") {
    const before = new Set(prev.skus);
    const now = new Set(next.skus);
    const added = next.skus.filter((s) => !before.has(s));
    const removed = prev.skus.filter((s) => !now.has(s));
    if (added.length) changes.push(`Added SKUs: ${added.slice(0, 5).join(", ")}${added.length > 5 ? ` +${added.length - 5} more` : ""}`);
    if (removed.length) changes.push(`Removed SKUs: ${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ` +${removed.length - 5} more` : ""}`);
    if (!added.length && !removed.length && prev.skus.length !== next.skus.length) changes.push("Removed repeated SKUs");
  }
  if (prev.value !== next.value || prev.mode !== next.mode) {
    const fmt = (v: number, m: string) => (m === "pct" ? `${v}%` : `$${v.toFixed(2)}`);
    changes.push(`Value: ${fmt(prev.value, prev.mode)} → ${fmt(next.value, next.mode)}`);
  }
  return changes;
}
