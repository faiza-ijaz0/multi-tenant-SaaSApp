import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorProfileId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const AUDIT_EVENT_LIMIT = 50;

/**
 * audit_events_select_admin restricts this to organization admins/owners
 * only -- not "any member". A plain member calling this gets an empty
 * result back (RLS-filtered), not an error, so callers must check the
 * caller's own role before treating an empty result as "no activity yet"
 * versus "you don't have permission to see this" (see
 * app/dashboard/activity/page.tsx).
 */
export async function listAuditEvents(
  supabase: SupabaseClient,
  organizationId: string,
  options: { limit?: number; entityId?: string } = {},
): Promise<AuditEvent[]> {
  let query = supabase
    .from("audit_events")
    .select("id, action, entity_type, entity_id, actor_profile_id, metadata, created_at")
    .eq("organization_id", organizationId);

  if (options.entityId) query = query.eq("entity_id", options.entityId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(options.limit ?? AUDIT_EVENT_LIMIT);

  if (error) {
    throw new Error(`Failed to load activity: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    actorProfileId: (row.actor_profile_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}

/**
 * Human-readable description for known action strings, with a generic
 * fallback for anything else. Every action string actually inserted
 * anywhere in the app today: submission.status_changed
 * (features/submissions/actions.ts) and the member-lifecycle events
 * logged by logMemberAuditEvent (features/members/actions.ts) --
 * member.created, member.role_changed, member.updated, member.removed,
 * member.password_changed, ownership.transferred, invitation.created,
 * invitation.revoked. Submission *creation*, comments, and votes are
 * never logged here (RLS blocks non-admin actors from inserting into
 * audit_events at all -- see the Phase 6 report); those have their own
 * real created_at columns and are aggregated directly from their own
 * tables instead (features/submissions/queries.ts, features/audit/member-activity.ts),
 * never fabricated as audit events that don't exist.
 */
export function describeAuditEvent(event: AuditEvent): string {
  switch (event.action) {
    case "submission.status_changed":
      return "changed a submission's status";
    case "member.created":
      return "added a new member";
    case "member.role_changed":
      return "changed a member's role";
    case "member.updated":
      return "updated a member's account";
    case "member.removed":
      return "removed a member";
    case "member.password_changed":
      return "changed a member's password";
    case "ownership.transferred":
      return "transferred ownership";
    case "invitation.created":
      return "created an invitation";
    case "invitation.revoked":
      return "revoked an invitation";
    default:
      return event.action.replace(/[._]/g, " ");
  }
}

/**
 * Maps a real audit_events `action` string to one of ActivityTimeline's
 * semantic accents -- the single source of truth so the dashboard's
 * RecentActivityCard, the Activity page's plain event feed, and its merged
 * lifecycle timeline never independently invent (or drift on) what color
 * a given event type gets. Purely a presentational grouping over data that
 * already exists (the same `action` describeAuditEvent already switches
 * on) -- never fabricates a category audit_events doesn't actually record.
 *
 * - warning: role/permission/ownership changes -- the most sensitive
 *   category, deliberately the same accent Role Management already uses
 *   for "Owners" (see app/dashboard/role-management/page.tsx).
 * - success: member lifecycle (created/removed/updated/password changed).
 * - sky: submission/workflow events.
 * - info: invitations.
 * - primary: fallback for any action string not covered above.
 */
export function timelineAccentForAuditEvent(action: string): "primary" | "success" | "warning" | "sky" | "info" {
  if (action === "member.role_changed" || action === "ownership.transferred") return "warning";
  if (action.startsWith("member.")) return "success";
  if (action.startsWith("submission.")) return "sky";
  if (action.startsWith("invitation.")) return "info";
  return "primary";
}

/**
 * Shared, safe actor display for audit events. Prefers a real resolved
 * name/email (see resolveAuditActorNames below, which uses the same
 * get_organization_contact_profiles RPC features/members/queries.ts's
 * enrichMembersWithContactInfo already relies on) -- falls back to a
 * generic, non-identifying label only when no contact record could be
 * resolved (e.g. the actor is no longer a member of this organization at
 * all), never to a raw/truncated profile_id. Shared between
 * app/dashboard/activity/page.tsx and the dashboard's recent-activity
 * panel so the two never drift on what's safe to show.
 */
export function describeAuditActor(
  actorProfileId: string | null,
  currentUserId: string,
  resolvedNames?: Map<string, string>,
): string {
  if (actorProfileId === currentUserId) return "You";
  if (!actorProfileId) return "A deleted member";
  return resolvedNames?.get(actorProfileId) ?? "A former member";
}

/**
 * Resolves real display names for a set of audit-event actors in one
 * request -- reuses get_organization_contact_profiles (0011), the exact
 * RPC features/members/queries.ts's enrichMembersWithContactInfo already
 * uses for the member roster, rather than inventing a second lookup path.
 * Only ever returns a row for a profile that still shares organizationId
 * with the caller; an actor who has since left the organization simply
 * isn't in the returned map, and describeAuditActor's fallback handles
 * that case safely.
 */
export async function resolveAuditActorNames(
  supabase: SupabaseClient,
  organizationId: string,
  actorProfileIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(actorProfileIds.filter((id): id is string => Boolean(id))));
  const result = new Map<string, string>();
  if (uniqueIds.length === 0) return result;

  const { data, error } = await supabase.rpc("get_organization_contact_profiles", {
    p_organization_id: organizationId,
    p_profile_ids: uniqueIds,
  });
  if (error) {
    console.error("resolveAuditActorNames: get_organization_contact_profiles failed:", error);
    return result;
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const profileId = row.profile_id as string;
    const name = (row.full_name as string | null) || (row.email as string | null);
    if (name) result.set(profileId, name);
  }
  return result;
}
