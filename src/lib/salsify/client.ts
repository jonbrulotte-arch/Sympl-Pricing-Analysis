// Bulk product retrieval via Salsify's paginated product listing.
//
// GET /orgs/{orgId}/products?page=&per_page=&filter= is the real, documented way to
// list every product in an org (omit `filter` to list all). Salsify's Export API is a
// different mechanism — it only triggers pre-configured exports/channels created ahead
// of time in the Salsify UI, referenced by an existing export id; there is no endpoint
// to create an ad-hoc export from arbitrary property ids, so it isn't usable here.

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
