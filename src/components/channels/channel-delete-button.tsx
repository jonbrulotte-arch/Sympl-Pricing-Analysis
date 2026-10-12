"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  customerId: string;
  channelId: string;
  channelName: string;
  iconOnly?: boolean;
  redirectTo?: string;
}

export function ChannelDeleteButton({ customerId, channelId, channelName, iconOnly, redirectTo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/customers/${customerId}/channels/${channelId}`, {
      method: "DELETE",
    });

    setLoading(false);

    if (res.ok) {
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete channel");
    }
  }

  function openDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }

  return (
    <>
      {iconOnly ? (
        <button
          onClick={openDialog}
          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          title="Delete channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={openDialog}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete Channel
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Channel</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{channelName}</strong>, including its price history and
              analysis results for this channel. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
