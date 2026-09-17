// Bulk product retrieval via Salsify's asynchronous Export API.
//
// Salsify does not expose a simple paginated "list every product" endpoint for bulk
// retrieval — GET /products?page=&per_page= is only documented/used as a one-item
// connection test. Real org-wide export is a three-step async job:
//   1. POST /orgs/{orgId}/exports          — start an export job
//   2. GET  /orgs/{orgId}/exports/{id}     — poll until it completes or fails
//   3. GET  <the file URL the job returns> — download the resulting JSON
//
// NOTE: the exact request/response field names below (export target, format, status
// enum values, result-file field) should be confirmed against Salsify's live API
// reference/Postman collection for the target org — the start/poll/download mechanism
// is the documented approach, but exact JSON keys can vary by API version.

import { salsifyFetch } from "@/lib/salsify-http";

const SALSIFY_API_BASE = "https://app.salsify.com/api/v1";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 5 * 60 * 1000; // 5 minutes

export type SalsifyProduct = Record<string, unknown>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startExport(orgId: string, apiKey: string, propertyIds: string[]): Promise<string> {
  const res = await salsifyFetch(`${SALSIFY_API_BASE}/orgs/${encodeURIComponent(orgId)}/exports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target: "products",
      format: "json",
      property_ids: propertyIds,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to start Salsify export (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const exportId = data.id ?? data.export_id;
  if (!exportId) throw new Error("Salsify export response did not include an export id.");
  return String(exportId);
}

async function pollExport(orgId: string, apiKey: string, exportId: string): Promise<string> {
  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    const res = await salsifyFetch(`${SALSIFY_API_BASE}/orgs/${encodeURIComponent(orgId)}/exports/${encodeURIComponent(exportId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to check Salsify export status (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    const status = String(data.status ?? "").toLowerCase();

    if (status === "complete" || status === "completed" || status === "success") {
      const url = data.url ?? data.generated_url ?? data.download_url;
      if (!url) throw new Error("Salsify export completed but returned no download URL.");
      return String(url);
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(`Salsify export failed (status: ${status}).`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Salsify export did not complete within ${MAX_POLL_MS / 1000}s.`);
}

async function downloadExport(fileUrl: string, apiKey: string): Promise<SalsifyProduct[]> {
  const res = await salsifyFetch(fileUrl, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to download Salsify export (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.products ?? []);
}

export async function fetchAllSalsifyProducts(orgId: string, apiKey: string, propertyIds: string[]): Promise<SalsifyProduct[]> {
  const exportId = await startExport(orgId, apiKey, propertyIds);
  const fileUrl = await pollExport(orgId, apiKey, exportId);
  return downloadExport(fileUrl, apiKey);
}

/** Pulls the first element out of a Salsify " | "-delimited array-style string value. */
export function firstDelimited(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value);
  const first = str.split(" | ")[0]?.trim();
  return first || null;
}
