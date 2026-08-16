import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  InvalidOrganizationContextError,
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
} from "./errors";
import { generateSlug, SLUG_MAX_LENGTH } from "./slug";
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

export interface CreateOrganizationResult {
  organization: { id: string; name: string };
  membership: { id: string; role: "owner" };
  /** null if every generated slug candidate collided or portal_settings
   * creation otherwise failed -- non-fatal, the organization/membership
   * still stand and a slug can be set later. */
  portalSlug: string | null;
}

const SLUG_RETRY_ATTEMPTS = 4;

async function createPortalSettingsWithUniqueSlug(
  supabase: SupabaseClient,
  organizationId: string,
  name: string,
): Promise<string | null> {
  const base = generateSlug(name);
  // Leave room for "-xxxxx" on retries without exceeding the DB's 63-char
  // slug_length_check.
  const truncatedBase = base.slice(0, SLUG_MAX_LENGTH - 6);
  const candidates = [
    base,
    ...Array.from(
      { length: SLUG_RETRY_ATTEMPTS },
      () => `${truncatedBase}-${randomUUID().replace(/-/g, "").slice(0, 5)}`,
    ),
  ];

  for (const slug of candidates) {
    const { error } = await supabase
      .from("portal_settings")
      .insert({ id: randomUUID(), organization_id: organizationId, slug });
    if (!error) return slug;
    if (error.code !== "23505") {
      console.error(`Failed to create portal_settings for org ${organizationId}: ${error.message}`);
      return null;
    }
    // 23505 unique_violation on the slug -- try the next candidate.
  }

  console.error(
    `Failed to create portal_settings for org ${organizationId}: all slug candidates were taken.`,
  );
  return null;
}

/**
 * Creates a real organization and makes `userId` its owner, through the
 * same authenticated client and RLS policies any normal client request
 * uses -- organizations_insert_authenticated (any authenticated user may
 * create an org) and memberships_insert_bootstrap_owner (a brand-new org
 * has zero membership rows, so this is the one case an authenticated user
 * may insert a membership for themselves as 'owner' with no admin already
 * in place). Both policies structurally require profile_id/auth.uid() to
 * match the caller -- there is no code path here, or in the policies
 * themselves, that could create a membership for anyone else.
 *
 * Ensures a profiles row exists first: nothing in the auth flow creates
 * one automatically yet (see 0001_initial_schema.sql's comment on this --
 * that trigger is explicitly a later-phase concern), and
 * memberships.profile_id has a hard FK to profiles.id, so without this the
 * membership insert below would fail outright for any real first-time user.
 *
 * Not fully atomic: this is two sequential authenticated inserts, not one
 * transaction (PostgREST doesn't expose multi-statement transactions to
 * normal client requests). If the membership insert fails after the
 * organization insert already succeeded, the organization is orphaned --
 * ownerless, and per organizations_delete_owner, only an owner can delete
 * an organization, so the acting user (who never became owner) can't clean
 * it up themselves. This is a narrow reliability edge case (extremely rare
 * failure window), not a security gap -- no cross-tenant access or data
 * exposure results, the row is simply inert and unreachable by anyone. A
 * fully atomic fix would require a SECURITY DEFINER RPC (a migration), out
 * of scope unless this proves to actually happen in practice.
 */
export async function createOrganizationForUser(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<CreateOrganizationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Organization name must not be blank.");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    throw new Error(`Failed to prepare profile for organization creation: ${profileError.message}`);
  }

  const organizationId = randomUUID();
  const { error: organizationError } = await supabase
    .from("organizations")
    .insert({ id: organizationId, name: trimmedName });
  if (organizationError) {
    throw new Error(`Failed to create organization: ${organizationError.message}`);
  }

  const membershipId = randomUUID();
  const { error: membershipError } = await supabase.from("memberships").insert({
    id: membershipId,
    organization_id: organizationId,
    profile_id: userId,
    role: "owner",
  });
  if (membershipError) {
    throw new Error(`Failed to create initial owner membership: ${membershipError.message}`);
  }

  const portalSlug = await createPortalSettingsWithUniqueSlug(supabase, organizationId, trimmedName);

  return {
    organization: { id: organizationId, name: trimmedName },
    membership: { id: membershipId, role: "owner" },
    portalSlug,
  };
}
