import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the actual /dashboard overview layout (hero header panel, primary
 * KPI row, secondary stat strip, hero trend chart, category/status insight
 * row, recent-submissions/recent-activity row, quick actions) so the
 * loading state doesn't visually "jump" once real content arrives -- see
 * app/dashboard/page.tsx's own section comments for what each block is.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 rounded-2xl border border-border/70 px-5 py-6 sm:px-8 sm:py-8">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[84px] rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-[360px] w-full rounded-xl" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[68px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
