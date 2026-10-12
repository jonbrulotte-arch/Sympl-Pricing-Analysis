"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Upload,
  Send,
  FolderKanban,
  Radio,
  Package,
  Percent,
  Building2,
  Shield,
} from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  category: string;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
}

interface Props {
  customers: { id: string; name: string }[];
}

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "price", label: "Price Changes" },
  { value: "import", label: "Imports" },
  { value: "publish", label: "Publishes" },
  { value: "project", label: "Projects" },
  { value: "channel", label: "Channels" },
  { value: "product", label: "Products" },
  { value: "royalty", label: "Royalties" },
  { value: "customer", label: "Customers" },
  { value: "admin", label: "Admin" },
];

const CATEGORY_ICON: Record<string, React.ElementType> = {
  price: DollarSign,
  import: Upload,
  publish: Send,
  project: FolderKanban,
  channel: Radio,
  product: Package,
  royalty: Percent,
  customer: Building2,
  admin: Shield,
};

const CATEGORY_COLOR: Record<string, string> = {
  price: "bg-blue-100 text-blue-700",
  import: "bg-purple-100 text-purple-700",
  publish: "bg-green-100 text-green-700",
  project: "bg-amber-100 text-amber-700",
  channel: "bg-cyan-100 text-cyan-700",
  product: "bg-gray-100 text-gray-700",
  royalty: "bg-orange-100 text-orange-700",
  customer: "bg-pink-100 text-pink-700",
  admin: "bg-red-100 text-red-700",
};

export function ActivityLogView({ customers }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (category !== "all") params.set("category", category);
    if (customerId !== "all") params.set("customerId", customerId);
    if (search) params.set("search", search);

    const res = await fetch(`/api/activity-log?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }, [page, category, customerId, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [category, customerId, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  function formatFullDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search activity..."
            className="pl-9"
          />
        </form>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm text-gray-700"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {customers.length > 0 && (
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm text-gray-700"
          >
            <option value="all">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-gray-500">
          {total} event{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Log entries */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading activity...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">No activity found.</p>
          <p className="text-sm text-gray-400 mt-1">Activity will appear here as changes are made.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs w-10"></th>
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">Event</th>
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">Customer</th>
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">User</th>
                <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const Icon = CATEGORY_ICON[log.category] ?? Package;
                const color = CATEGORY_COLOR[log.category] ?? "bg-gray-100 text-gray-700";
                const isExpanded = expandedId === log.id;
                const hasDetail = log.detail != null && Object.keys(log.detail).length > 0;

                return (
                  <tr
                    key={log.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <td className="py-2.5 px-3">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {log.action}
                        </Badge>
                        <span className="text-gray-900 text-sm">{log.summary}</span>
                        {hasDetail && (
                          <span className="text-gray-400">
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </span>
                        )}
                      </div>
                      {isExpanded && log.detail && (
                        <div className="mt-2 ml-0 p-3 bg-gray-50 rounded-md text-xs">
                          <DetailView detail={log.detail} />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 text-xs">
                      {log.customer?.name ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 text-xs">
                      {log.user?.name ?? <span className="text-gray-400">System</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500 text-xs whitespace-nowrap" title={formatFullDate(log.createdAt)}>
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailView({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-gray-500 font-medium capitalize">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt>
          <dd className="text-gray-800 font-mono">
            {typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
