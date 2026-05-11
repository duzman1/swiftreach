import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignDetailLoading() {
  return (
    <div className="space-y-6 max-w-7xl">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-5 w-96" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2 pt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[40px_1fr_1fr_120px] gap-3">
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
