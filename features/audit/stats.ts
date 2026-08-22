import type { SupabaseClient } from "@supabase/supabase-js";

import { getRollingBoundaries } from "@/lib/analytics/time-ranges";

export interface AuditStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}

/**
 * Real, targeted COUNT queries against audit_events -- same pattern as
 * getSubmissionStats/getCategoryStats/getStatusStats. audit_events_select_admin
 * (0012) restricts this to organization admins/owners, same as
 * listAuditEvents (./queries.ts) -- callers must check hasPage(permissions,
 * "activity") before calling, exactly as app/dashboard/activity/page.tsx
 * already does for the event list.
 */
export async function getAuditStats(supabase: SupabaseClient, organizationId: string): Promise<AuditStats> {
  const { startOfToday, startOfWeek, startOfMonth } = getRollingBoundaries();

  const [totalResult, todayResult, weekResult, monthResult] = await Promise.all([
    supabase.from("audit_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfToday),
    supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfWeek),
    supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", startOfMonth),
  ]);

  for (const result of [totalResult, todayResult, weekResult, monthResult]) {
    if (result.error) {
      throw new Error(`Failed to load activity stats: ${result.error.message}`);
    }
  }

  return {
    total: totalResult.count ?? 0,
    today: todayResult.count ?? 0,
    thisWeek: weekResult.count ?? 0,
    thisMonth: monthResult.count ?? 0,
  };
}

/** Just created_at, bounded by [since, now) -- for server-side chart bucketing (lib/analytics/time-ranges.ts). */
export async function getAuditEventTimestampsSince(
  supabase: SupabaseClient,
  organizationId: string,
  since: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since);

  if (error) {
    throw new Error(`Failed to load activity trend: ${error.message}`);
  }
  return (data ?? []).map((row) => row.created_at as string);
}
