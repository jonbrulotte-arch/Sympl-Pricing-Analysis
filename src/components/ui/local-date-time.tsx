"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * A date in the viewer's own time zone. The server runs in UTC, so formatting there would show the
 * wrong time and break hydration; this renders nothing on the server and formats once in the browser.
 */
export function LocalDateTime({ value, dateOnly = false }: { value: Date | string; dateOnly?: boolean }) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  const iso = typeof value === "string" ? value : value.toISOString();
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {inBrowser ? (dateOnly ? formatDate(iso) : formatDateTime(iso)) : ""}
    </time>
  );
}
