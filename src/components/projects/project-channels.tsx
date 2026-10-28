"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Channel {
  id: string;
  name: string;
}

/** Chooses which of the customer's sales channels the project analyzes. */
export function ProjectChannels({
  projectId,
  customerName,
  channels,
  enabledIds,
}: {
  projectId: string;
  customerName: string;
  /** All of the customer's channels, in order. */
  channels: Channel[];
  /** The project's channel selection, or null when it uses every channel. */
  enabledIds: string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = enabledIds ? channels.filter((c) => enabledIds.includes(c.id)).length : channels.length;
  const usesAll = !enabledIds || enabledCount === 0;

  function openDialog() {
    setChecked(new Set(usesAll ? channels.map((c) => c.id) : enabledIds));
    setError(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setError(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (checked.size === 0) {
      setError("Choose at least one channel.");
      return;
    }
    setSaving(true);
    setError(null);
    // Every channel ticked means "all channels", so channels added to the customer later are included too.
    const channelIds = checked.size === channels.length ? null : channels.filter((c) => checked.has(c.id)).map((c) => c.id);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelIds }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't save the channels");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Store className="h-3.5 w-3.5 mr-1.5" />
        Channels{usesAll ? "" : ` (${enabledCount} of ${channels.length})`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project channels</DialogTitle>
            <DialogDescription>
              Choose which of {customerName}&apos;s sales channels this project analyzes. The change applies to everyone who
              opens the project. Price edits you haven&apos;t committed are cleared when the channels change.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => {
                setError(null);
                setChecked(new Set(channels.map((c) => c.id)));
              }}
              className="text-blue-600 hover:underline"
            >
              Select all
            </button>
            <button onClick={() => setChecked(new Set())} className="text-gray-500 hover:underline">
              Clear
            </button>
          </div>
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm text-gray-900 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={checked.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                {c.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {checked.size === channels.length
              ? "All channels, including any added to the customer later."
              : `${checked.size} of ${channels.length} channels. Channels added to the customer later won't be included.`}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
