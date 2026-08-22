import type { SupabaseClient } from "@supabase/supabase-js";

import { getRollingBoundaries } from "@/lib/analytics/time-ranges";

export interface CategoryStats {
  total: number;
  today: number;
  newThisWeek: number;
  newThisMonth: number;
}

/**
 * Real, targeted COUNT queries (head: true, no rows transferred) -- same
 * pattern as features/submissions/queries.ts's getSubmissionStats. Kept
 * separate from listCategories() (features/categories/queries.ts, used by
 * CategoryManager and every filter dropdown) rather than adding created_at
 * there: those callers have no use for it, and this needs no row data at
 * all, just counts.
 */
export async function getCategoryStats(supabase: SupabaseClient, organizationId: string): Promise<CategoryStats> {
  const { startOfToday, startOfWeek, startOfMonth } = getRollingBoundaries();

  const [totalResult, todayResult, weekResult, monthResult] = await Promise.all([
    supabase.from("categories").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfToday),
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfWeek),
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth),
  ]);

  for (const result of [totalResult, todayResult, weekResult, monthResult]) {
    if (result.error) {
      throw new Error(`Failed to load category stats: ${result.error.message}`);
    }
  }

  return {
    total: totalResult.count ?? 0,
    today: todayResult.count ?? 0,
    newThisWeek: weekResult.count ?? 0,
    newThisMonth: monthResult.count ?? 0,
  };
}
