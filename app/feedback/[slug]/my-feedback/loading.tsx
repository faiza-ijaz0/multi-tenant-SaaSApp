import { Skeleton } from "@/components/ui/skeleton";

export default function MyFeedbackLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
