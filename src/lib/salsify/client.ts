// Thin wrapper around Salsify's REST product-export API.
// NOTE: verify this endpoint/pagination/property-key shape against Salsify's live API
// reference for the target org before relying on it in production — Salsify's public
// docs describe a "products" listing endpoint scoped by org id, paginated, returning
// each product as a flat object keyed by Salsify property id (plus "salsify:id" etc.
// system properties). Adjust here if the real org's API differs.

const SALSIFY_API_BASE = "https://app.salsify.com/api/v1";
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;

export type SalsifyProduct = Record<string, unknown>;

export async function fetchAllSalsifyProducts(orgId: string, apiKey: string): Promise<SalsifyProduct[]> {
  const products: SalsifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${SALSIFY_API_BASE}/orgs/${encodeURIComponent(orgId)}/products?page=${page}&per_page=${PAGE_SIZE}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Timed out reaching Salsify after ${REQUEST_TIMEOUT_MS / 1000}s. Check the Org ID and that this server can reach app.salsify.com.`);
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Salsify API error (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    const batch: SalsifyProduct[] = Array.isArray(data) ? data : (data.data ?? data.products ?? []);
    products.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    page += 1;
    if (page > 500) break; // safety cap against a runaway/misbehaving API
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
