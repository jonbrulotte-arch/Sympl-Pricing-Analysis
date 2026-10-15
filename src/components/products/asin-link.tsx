import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

/** An ASIN that opens the product's Amazon listing in a new tab. Values that aren't an ASIN show as plain text. */
export function AsinLink({ asin, className, iconClassName }: { asin: string; className?: string; iconClassName?: string }) {
  if (!ASIN_PATTERN.test(asin)) return <span className={cn("font-mono", className)}>{asin}</span>;
  return (
    <a
      href={`https://www.amazon.com/dp/${encodeURIComponent(asin)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the Amazon listing in a new tab"
      className={cn("inline-flex items-center gap-1 font-mono text-blue-600 hover:underline", className)}
    >
      {asin}
      <ExternalLink className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
    </a>
  );
}
