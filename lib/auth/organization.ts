import type { SupabaseClient } from "@supabase/supabase-js";

import {
  InvalidOrganizationContextError,
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
} from "./errors";
import type { OrganizationContext, OrganizationMembership, OrganizationRole } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MembershipRow {
  id: string;
  role: string;
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
}

function normalizeOrganization(
  organizations: MembershipRow["organizations"],
): { id: string; name: string } | null {
  if (!organizations) return null;
  return Array.isArray(organizations) ? (organizations[0] ?? null) : organizations;
}

/**
 * All organizations the authenticated user is a team member of, via
 * `memberships`. RLS (memberships_select_member) already scopes this to the
 * caller's own rows, but the query itself is explicit about it too --
 * defense in depth, not a substitute for RLS.
 *
 * One request (embedded join), not one-per-organization, to avoid N+1.
 */
export async function listUserMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, organizations(id, name)")
    .eq("profile_id", userId)
    .returns<MembershipRow[]>();

  if (error) {
    throw new Error(`Failed to load organization memberships: ${error.message}`);
  }

  const memberships: OrganizationMembership[] = [];
  for (const row of data ?? []) {
    const organization = normalizeOrganization(row.organizations);
    if (!organization) continue; // defensive: should be impossible under FK + RLS
    memberships.push({
      membershipId: row.id,
      role: row.role as OrganizationRole,
      organization,
    });
  }
  return memberships;
}

/**
 * The single authoritative resolver for tenant context. `requestedOrganizationId`
 * may come from a cookie, a URL param, anywhere client-influenced -- it is
 * never trusted as proof of access. It's treated purely as a lookup key
 * against the caller's own verified memberships; a match is required or the
 * request is rejected, with a response that is identical whether the
 * organization doesn't exist or the user simply isn't a member of it.
 *
 * With no requested id, defaults to the user's first membership (stable
 * order from listUserMemberships) -- the minimal "current organization"
 * behavior until a real switcher UI picks one explicitly.
 */
export async function resolveOrganizationContext(
  supabase: SupabaseClient,
  userId: string,
  requestedOrganizationId?: string | null,
): Promise<OrganizationContext> {
  if (requestedOrganizationId !== undefined && requestedOrganizationId !== null) {
    if (!UUID_PATTERN.test(requestedOrganizationId)) {
      throw new InvalidOrganizationContextError();
    }
  }

  const memberships = await listUserMemberships(supabase, userId);

  if (requestedOrganizationId) {
    const match = memberships.find((m) => m.organization.id === requestedOrganizationId);
    if (!match) {
      throw new OrganizationAccessDeniedError();
    }
    return {
      organization: match.organization,
      membership: { id: match.membershipId, role: match.role },
    };
  }

  const first = memberships[0];
  if (!first) {
    throw new OrganizationNotFoundError();
  }
  return {
    organization: first.organization,
    membership: { id: first.membershipId, role: first.role },
  };
}
