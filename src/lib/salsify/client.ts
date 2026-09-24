// Salsify API client: product listing, channel export, and bulk product updates.

import { salsifyFetch } from "@/lib/salsify-http";

const SALSIFY_API_BASE = "https://app.salsify.com/api/v1";
const PAGE_SIZE = 100;
const MAX_PAGES = 500; // safety cap against a runaway/misbehaving API

export type SalsifyProduct = Record<string, unknown>;

/** One page fetch, exposed on its own for the Test Connection debug tool. */
export async function fetchProductsPage(orgId: string, apiKey: string, page: number, perPage: number): Promise<{ batch: SalsifyProduct[]; status: number }> {
  const url = `${SALSIFY_API_BASE}/orgs/${encodeURIComponent(orgId)}/products?page=${page}&per_page=${perPage}`;
  const res = await salsifyFetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Salsify API error (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const batch: SalsifyProduct[] = Array.isArray(data) ? data : (data.data ?? data.products ?? []);
  return { batch, status: res.status };
}

export async function fetchAllSalsifyProducts(
  orgId: string,
  apiKey: string,
  onPage?: (pagesFetched: number, productsFetched: number) => void | Promise<void>
): Promise<SalsifyProduct[]> {
  const products: SalsifyProduct[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    let batch: SalsifyProduct[];
    try {
      ({ batch } = await fetchProductsPage(orgId, apiKey, page, PAGE_SIZE));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (on page ${page}, ${products.length} product(s) fetched so far)`);
    }

    products.push(...batch);
    if (onPage) await onPage(page, products.length);

    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }

  return products;
}

/** Pulls the first element out of a Salsify " | "-delimited array-style string value. */
export function firstDelimited(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value);
  const first = str.split(" | ")[0]?.trim();
  return first || null;
}

/** Trigger a pre-configured Salsify channel export. Returns the run ID for polling. */
export async function triggerChannelExport(
  apiKey: string,
  channelId: string,
): Promise<{ runId: string }> {
  const url = `https://app.salsify.com/api/channels/${encodeURIComponent(channelId)}/runs`;
  const res = await salsifyFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to trigger Salsify export (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const runId = data.id ?? data.run_id;
  if (!runId) throw new Error("Salsify export response missing run ID");
  return { runId: String(runId) };
}

/** Poll the latest channel export run for completion. Returns status and download URL when done. */
export async function pollExportStatus(
  apiKey: string,
  channelId: string,
  runId: string,
): Promise<{ status: string; url?: string }> {
  const url = `https://app.salsify.com/api/channels/${encodeURIComponent(channelId)}/runs/${encodeURIComponent(runId)}`;
  const res = await salsifyFetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to poll export status (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  return {
    status: String(data.status ?? "unknown"),
    url: data.product_export_url ?? data.url ?? data.download_url ?? undefined,
  };
}

/** Download a completed export file from the pre-signed S3 URL. No auth header — the URL carries its own signature. */
export async function downloadExportFile(
  downloadUrl: string,
): Promise<ArrayBuffer> {
  const res = await salsifyFetch(downloadUrl, {
    timeoutMs: 120_000,
  });

  if (!res.ok) {
    throw new Error(`Failed to download export file (${res.status}): ${res.statusText}`);
  }

  return res.arrayBuffer();
}

export interface SalsifyProductUpdate {
  sku: string;
  properties: Record<string, unknown>;
}

const BULK_CHUNK_SIZE = 100;

export async function updateSalsifyProducts(
  orgId: string,
  apiKey: string,
  updates: SalsifyProductUpdate[],
): Promise<{ succeeded: string[]; failed: { sku: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { sku: string; error: string }[] = [];

  for (let i = 0; i < updates.length; i += BULK_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + BULK_CHUNK_SIZE);
    const payload = chunk.map((u) => ({
      "salsify:id": u.sku,
      ...u.properties,
    }));

    const url = `${SALSIFY_API_BASE}/orgs/${encodeURIComponent(orgId)}/products`;
    const res = await salsifyFetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: 60_000,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      for (const u of chunk) {
        failed.push({ sku: u.sku, error: `Salsify API error (${res.status}): ${text || res.statusText}` });
      }
    } else {
      for (const u of chunk) {
        succeeded.push(u.sku);
      }
    }
  }

  return { succeeded, failed };
}
