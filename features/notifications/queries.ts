import type { SupabaseClient } from "@supabase/supabase-js";

export interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_LIST_LIMIT = 20;

/**
 * notifications_select_own scopes this to the caller's own rows only
 * (profile_id = auth.uid()) -- there is no organization_id check in that
 * policy at all, so a user's notifications are personal across every org
 * they belong to, by RLS design. organizationId here is an optional
 * application-level filter for a cleaner per-org bell, never a security
 * boundary: RLS already guarantees no other user's notifications can ever
 * appear here regardless of what organizationId is passed.
 */
export async function listNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: { organizationId?: string; limit?: number } = {},
): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? NOTIFICATION_LIST_LIMIT);

  if (options.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load notifications: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string,
  organizationId?: string,
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .is("read_at", null);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Failed to count unread notifications: ${error.message}`);
  }
  return count ?? 0;
}
