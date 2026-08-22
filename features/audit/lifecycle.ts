import type { OrganizationRole } from "@/lib/auth/types";
import type { AuditEvent } from "./queries";
import { describeAuditActor, describeAuditEvent } from "./queries";

export interface LifecycleEntry {
  id: string;
  type: "organization_created" | "member_joined" | "audit_event";
  title: string;
  timestamp: string;
  /** The real audit_events `action` string, present only for `type: "audit_event"` entries -- lets a caller compute a per-event-type accent (see features/audit/queries.ts's timelineAccentForAuditEvent) without re-deriving it from the title text. */
  action?: string;
}

/**
 * Merges every reliably-timestamped organization lifecycle signal into one
 * chronological narrative -- organization creation (organizations.created_at),
 * each member's real join date (memberships.created_at, via the same
 * roster app/dashboard/role-management/page.tsx already fetches), and the
 * real admin-authored audit_events narrative (role changes, removals,
 * password changes, submission status changes). Pure function, no I/O --
 * every input must already be real, RLS-scoped data the caller fetched
 * (getOrganizationMembers + enrichMembersWithContactInfo for members,
 * listAuditEvents + resolveAuditActorNames for events). Never claims an
 * event happened without a real stored timestamp backing it -- there is no
 * "categories created" or "comments added" entry here because neither is
 * ever logged as an audit event (see features/audit/queries.ts's own
 * comment) and folding them in would misrepresent a derived stat as a
 * discrete lifecycle event.
 */
export function buildLifecycleTimeline(params: {
  organizationCreatedAt: string;
  organizationName: string;
  members: { profileId: string; role: OrganizationRole; joinedAt: string; displayName: string; isCurrentUser: boolean }[];
  events: AuditEvent[];
  currentUserId: string;
  actorNames: Map<string, string>;
  limit?: number;
}): LifecycleEntry[] {
  const entries: LifecycleEntry[] = [
    {
      id: "organization-created",
      type: "organization_created",
      title: `${params.organizationName} was created`,
      timestamp: params.organizationCreatedAt,
    },
    ...params.members.map((member) => ({
      id: `member-joined-${member.profileId}`,
      type: "member_joined" as const,
      title: `${member.isCurrentUser ? "You" : member.displayName} joined as ${member.role}`,
      timestamp: member.joinedAt,
    })),
    ...params.events.map((event) => ({
      id: `audit-${event.id}`,
      type: "audit_event" as const,
      title: `${describeAuditActor(event.actorProfileId, params.currentUserId, params.actorNames)} ${describeAuditEvent(event)}`,
      timestamp: event.createdAt,
      action: event.action,
    })),
  ];

  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return params.limit ? entries.slice(0, params.limit) : entries;
}
