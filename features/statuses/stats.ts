import type { SupabaseClient } from "@supabase/supabase-js";

import { getRollingBoundaries } from "@/lib/analytics/time-ranges";

export interface StatusStats {
  total: number;
  today: number;
  newThisWeek: number;
  newThisMonth: number;
}

/**
 * Real, targeted COUNT queries -- same pattern as
 * features/categories/stats.ts's getCategoryStats. Per-status submission
 * usage counts (a StatusStats field would be misleading -- that's a count
 * of statuses, not of submissions per status) are already available via
 * features/submissions/queries.ts's getSubmissionStats().byStatus -- reused
 * directly on the Statuses page rather than duplicated here.
 */
export async function getStatusStats(supabase: SupabaseClient, organizationId: string): Promise<StatusStats> {
  const { startOfToday, startOfWeek, startOfMonth } = getRollingBoundaries();

  const [totalResult, todayResult, weekResult, monthResult] = await Promise.all([
    supabase.from("statuses").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase
      .from("statuses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfToday),
    supabase
      .from("statuses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfWeek),
    supabase
      .from("statuses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth),
  ]);

  for (const result of [totalResult, todayResult, weekResult, monthResult]) {
    if (result.error) {
      throw new Error(`Failed to load status stats: ${result.error.message}`);
    }
  }

  return {
    total: totalResult.count ?? 0,
    today: todayResult.count ?? 0,
    newThisWeek: weekResult.count ?? 0,
    newThisMonth: monthResult.count ?? 0,
  };
}
