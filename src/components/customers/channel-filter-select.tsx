"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function ChannelFilterSelect({
  channels,
  value,
}: {
  channels: { id: string; label: string }[];
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === ALL) params.delete("channel");
    else params.set("channel", v);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value ?? ALL} onValueChange={handleChange}>
      <SelectTrigger className="w-48 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All channels</SelectItem>
        {channels.map((c) => (
          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
