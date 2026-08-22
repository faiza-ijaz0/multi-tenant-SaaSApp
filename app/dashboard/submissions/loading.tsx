import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the actual /dashboard/submissions layout (page header, filter
 * bar, submission rows) rather than a generic placeholder, so the loading
 * state doesn't visually "jump" once real content arrives.
 */
export default function SubmissionsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />

      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
