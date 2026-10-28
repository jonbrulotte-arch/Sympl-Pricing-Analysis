"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, Plus, Settings, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigatingButton } from "@/components/ui/navigating-link";
import { ChannelDeleteButton } from "@/components/channels/channel-delete-button";
import { cn } from "@/lib/utils";

interface ChannelItem {
  id: string;
  name: string;
  channelType: string;
  freightMode: string;
  isDefault: boolean;
}

/** The customer's sales channels, with a per-channel Analysis button and multi-channel selection to analyze together. */
export function SalesChannelsCard({ customerId, channels }: { customerId: string; channels: ChannelItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Keep the customer's channel order in the URL, so tabs appear in the usual order.
  const selectedIds = channels.filter((c) => selected.has(c.id)).map((c) => c.id);
  const analyzeHref =
    selectedIds.length === 1
      ? `/customers/${customerId}/analysis?channel=${selectedIds[0]}`
      : `/customers/${customerId}/analysis?channels=${selectedIds.join(",")}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Sales Channels</CardTitle>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">
                Clear
              </button>
              <NavigatingButton href={analyzeHref} size="sm" loadingText="Loading...">
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Analyze {selectedIds.length === 1 ? "1 channel" : `${selectedIds.length} channels`}
              </NavigatingButton>
            </>
          )}
          <Link href={`/customers/${customerId}/channels/new`}>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Channel
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No channels configured.</p>
        ) : (
          <>
            {channels.length > 1 && (
              <p className="text-xs text-gray-500 mb-1">Tick channels to analyze them together and compare them side by side.</p>
            )}
            <div className="divide-y divide-gray-100">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className={cn(
                    "flex items-center justify-between py-3 hover:bg-gray-50 -mx-4 px-4 rounded transition-colors",
                    selected.has(ch.id) && "bg-blue-50/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ch.id)}
                    onChange={() => toggle(ch.id)}
                    aria-label={`Select ${ch.name}`}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 mr-3 shrink-0"
                  />
                  <Link href={`/customers/${customerId}/channels/${ch.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Store className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ch.name}</p>
                      <p className="text-xs text-gray-500">
                        {ch.channelType === "commercial" ? "Commercial" : "Online"}
                        {" · "}
                        {ch.freightMode === "collect" ? "Collect" : "Prepaid"}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <NavigatingButton
                      href={`/customers/${customerId}/analysis?channel=${ch.id}`}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      loadingText="Loading..."
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1" />
                      Analysis
                    </NavigatingButton>
                    {ch.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                    <Link href={`/customers/${customerId}/channels/${ch.id}`} className="p-1 rounded hover:bg-gray-100">
                      <Settings className="h-3.5 w-3.5 text-gray-400" />
                    </Link>
                    {!ch.isDefault && (
                      <ChannelDeleteButton customerId={customerId} channelId={ch.id} channelName={ch.name} iconOnly />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
