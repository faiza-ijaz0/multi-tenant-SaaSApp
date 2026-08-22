import { Skeleton } from "@/components/ui/skeleton";

export default function StatusesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
