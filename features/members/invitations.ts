import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrganizationRole } from "@/lib/auth/types";

import type { MembershipMutationResult } from "./membership";

/** Never 'owner' -- see 0005_invitation_acceptance.sql's accept_invitation() for why. */
export type InvitableRole = Exclude<OrganizationRole, "owner">;

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
}

export interface CreateInvitationResult extends MembershipMutationResult {
  /**
   * The raw, unhashed token -- returned exactly once, at creation, and
   * never again. Only invitations.token_hash (a sha256 digest of this) is
   * ever persisted, matching 0001_initial_schema.sql's own documented
   * intent. Callers must show this to the admin immediately and never log
   * it (see features/members/actions.ts).
   */
  inviteToken?: string;
}

const INVITATION_EXPIRY_DAYS = 7;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * organizationId must already be a server-resolved, RLS-verified value --
 * never a raw client-supplied id, matching every other feature in this
 * codebase. RLS (invitations_insert_admin) independently re-enforces that
 * the caller is actually an admin/owner of this org regardless.
 *
 * role is typed to exclude 'owner' at the call site -- see InvitableRole.
 * This is an application-level decision (the invitations.role column and
 * its check constraint do allow 'owner'), not a schema limitation: letting
 * any admin (not just the owner) create an 'owner'-role invitation would
 * be a privilege-escalation path around transfer_organization_ownership()'s
 * owner-only restriction. accept_invitation() also refuses to grant
 * 'owner' as a second, database-level backstop for this same rule.
 */
export async function createInvitationForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  actorUserId: string,
  email: string,
  role: InvitableRole,
  pagePermissions: string[] = [],
  actionPermissions: string[] = [],
): Promise<CreateInvitationResult> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("invitations").insert({
    id: randomUUID(),
    organization_id: organizationId,
    email: email.toLowerCase(),
    role,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
    created_by: actorUserId,
    // Materialized into membership_page_permissions/membership_action_permissions
    // by accept_invitation() (0009/0013) on first acceptance only -- see
    // those migrations for why. Values here are the exact final set chosen
    // in the invite form (pre-filled from the selected role's preset,
    // lib/authorization/registry.ts's ROLE_PRESETS, but editable before
    // sending) -- not a reference to "the preset."
    page_permissions: pagePermissions,
    action_permissions: actionPermissions,
  });

  if (error) {
    // invitations_org_email_pending_unique (a partial unique index on
    // (organization_id, lower(email)) where accepted_at is null) is what
    // actually prevents duplicate pending invitations -- this maps that
    // DB-enforced rule to a clean message rather than a raw constraint name.
    if (error.code === "23505") {
      return { ok: false, message: "There's already a pending invitation for this email." };
    }
    console.error("createInvitationForOrganization failed:", error);
    return { ok: false, message: "Something went wrong creating the invitation." };
  }

  return { ok: true, inviteToken: rawToken };
}

/**
 * "Revoke" is a delete, not a status flag -- the schema has no revoked_at/
 * status column, only accepted_at, so this is the natural operation
 * invitations_delete_admin exists for. Scoped to accepted_at is null so a
 * client can't "revoke" (delete the record of) an invitation that was
 * already legitimately accepted.
 */
export async function revokeInvitationForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  invitationId: string,
): Promise<MembershipMutationResult> {
  const { data, error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .select("id");

  if (error) {
    console.error("revokeInvitationForOrganization failed:", error);
    return { ok: false, message: "Something went wrong revoking the invitation." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "Invitation not found, or it was already accepted." };
  }
  return { ok: true };
}

/**
 * Bounded at a generous cap for the same reason as
 * lib/auth/organization-details.ts's MEMBER_LIST_LIMIT -- a query with no
 * limit at all is a correctness/performance risk regardless of today's
 * actual data volume. Lower risk than the member roster in practice
 * (pending invitations are admin-created one at a time and naturally
 * self-limiting via invitations_org_email_pending_unique), so a simple
 * bound is sufficient here rather than a hard-fail error.
 */
const PENDING_INVITATIONS_LIMIT = 500;

/**
 * All non-accepted invitations, including expired ones (with isExpired
 * computed server-side so the badge is deterministic regardless of the
 * viewer's clock) -- admins may want visibility into an expired invite to
 * decide whether to revoke and re-send. Never selects token_hash: nothing
 * in the UI needs it, and there's no reason to move it further than the
 * one query (accept_invitation) that actually needs to compare against it.
 */
export async function listPendingInvitations(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PendingInvitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(PENDING_INVITATIONS_LIMIT);

  if (error) {
    throw new Error(`Failed to load invitations: ${error.message}`);
  }

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    role: row.role as OrganizationRole,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
    isExpired: new Date(row.expires_at as string).getTime() <= now,
  }));
}
