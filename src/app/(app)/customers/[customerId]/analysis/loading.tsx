import { Loader2 } from "lucide-react";

export default function AnalysisLoading() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mt-2" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-2" />
            <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-100 rounded-t animate-pulse" />
        ))}
      </div>

      {/* Loading indicator */}
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin mb-3 text-blue-600" />
        <p className="text-sm font-medium">Loading analysis data...</p>
        <p className="text-xs text-gray-400 mt-1">This may take a moment for large product catalogs.</p>
      </div>
    </div>
  );
}
