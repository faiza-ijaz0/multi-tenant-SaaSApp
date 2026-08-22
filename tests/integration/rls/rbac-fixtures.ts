import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createTestIdentity,
  deleteTestIdentity,
  signInAs,
  type TestIdentity,
} from "./helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "./fixtures";

/**
 * Extends the base owner/customer fixtures (fixtures.ts) with an admin and
 * a member identity in Org A, for the Phase 14 action-permission test
 * matrix. Deliberately does NOT go through accept_invitation() (real email
 * match + invitation token flow is unnecessary ceremony for fixture setup)
 * -- instead, ownerA's own already-authenticated, RLS-respecting client
 * inserts the membership and permission rows directly. This is a real
 * exercise of memberships_insert_admin/membership_page_permissions_insert/
 * membership_action_permissions_insert (all extended by
 * 0013_membership_action_permissions.sql) via the owner-bypass path of
 * has_page_permission/has_action_permission/can_manage_membership_permissions
 * -- not a service-role shortcut. Grants nothing by default: each test
 * seeds exactly the pages/actions it needs via grantPermissions below, so
 * no test accidentally passes because of an unrelated default grant.
 */
export interface RbacFixtures extends RlsFixtures {
  adminA: TestIdentity;
  memberA: TestIdentity;
  clientAdminA: SupabaseClient;
  clientMemberA: SupabaseClient;
  membershipAdminA: string;
  membershipMemberA: string;
}

async function must(label: string, promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`RBAC fixture setup failed at "${label}": ${error.message}`);
}

export async function setupRbacFixtures(): Promise<RbacFixtures> {
  const base = await setupFixtures();
  const extraIdentityIds: string[] = [];

  try {
    const [adminA, memberA] = await Promise.all([
      createTestIdentity("org-a-admin"),
      createTestIdentity("org-a-member"),
    ]);
    extraIdentityIds.push(adminA.id, memberA.id);

    const [clientAdminA, clientMemberA] = await Promise.all([signInAs(adminA), signInAs(memberA)]);

    await must("profile admin A", clientAdminA.from("profiles").insert({ id: adminA.id }));
    await must("profile member A", clientMemberA.from("profiles").insert({ id: memberA.id }));

    const membershipAdminA = randomUUID();
    const membershipMemberA = randomUUID();

    // ownerA bypasses has_page_permission/has_action_permission entirely
    // (owner) -- a real exercise of memberships_insert_admin's grant, not a
    // service-role shortcut.
    await must(
      "org A admin membership",
      base.clientOwnerA
        .from("memberships")
        .insert({ id: membershipAdminA, organization_id: base.orgA.id, profile_id: adminA.id, role: "admin" }),
    );
    await must(
      "org A member membership",
      base.clientOwnerA
        .from("memberships")
        .insert({ id: membershipMemberA, organization_id: base.orgA.id, profile_id: memberA.id, role: "member" }),
    );

    return {
      ...base,
      adminA,
      memberA,
      clientAdminA,
      clientMemberA,
      membershipAdminA,
      membershipMemberA,
    };
  } catch (error) {
    await Promise.allSettled(extraIdentityIds.map(deleteTestIdentity));
    await teardownFixtures(base);
    throw error;
  }
}

export async function teardownRbacFixtures(fixtures: RbacFixtures): Promise<void> {
  // Deleting orgA (inside teardownFixtures) cascades adminA/memberA's
  // membership + membership_page_permissions/membership_action_permissions
  // rows; their auth.users/profiles rows still need their own delete.
  await Promise.allSettled([deleteTestIdentity(fixtures.adminA.id), deleteTestIdentity(fixtures.memberA.id)]);
  await teardownFixtures(fixtures);
}

/**
 * Grants exactly the given page/action keys on a membership, via a caller
 * client that must itself satisfy can_manage_membership_permissions (an
 * owner, or an admin holding roles_permissions:manage_permissions) --
 * exercises the real membership_page_permissions_insert/
 * membership_action_permissions_insert RLS policies, same as
 * setMembershipPermissions (features/members/permissions.ts) does in the app.
 */
export async function grantPermissions(
  caller: SupabaseClient,
  membershipId: string,
  pages: string[],
  actions: string[],
): Promise<{ error: { message: string } | null }> {
  if (pages.length > 0) {
    const { error } = await caller
      .from("membership_page_permissions")
      .insert(pages.map((page) => ({ membership_id: membershipId, page })));
    if (error) return { error };
  }
  if (actions.length > 0) {
    const { error } = await caller
      .from("membership_action_permissions")
      .insert(actions.map((permission_key) => ({ membership_id: membershipId, permission_key })));
    if (error) return { error };
  }
  return { error: null };
}
