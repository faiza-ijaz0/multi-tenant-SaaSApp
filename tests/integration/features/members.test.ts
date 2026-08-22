import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getOrganizationMembers } from "@/lib/auth/organization-details";
import { removeMemberForOrganization, updateMemberRoleForOrganization } from "@/features/members/membership";

import { adminClient, anonClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Extends the shared RLS fixtures (orgA/orgB, owner/customer identities)
// with an admin and a plain member in orgA -- the shared fixtures.ts has
// neither, and every other test file only needs owner/customer, so this
// stays local to this file rather than growing the shared fixture (which
// every other suite's beforeAll would then also pay the cost of).

let fx: RlsFixtures;
let adminA: TestIdentity;
let memberA: TestIdentity;
let clientAdminA: SupabaseClient;
let clientMemberA: SupabaseClient;
let membershipAdminA: string;
let membershipMemberA: string;

beforeAll(async () => {
  fx = await setupFixtures();

  adminA = await createTestIdentity("org-a-admin");
  memberA = await createTestIdentity("org-a-member");
  clientAdminA = await signInAs(adminA);
  clientMemberA = await signInAs(memberA);

  const p1 = await clientAdminA.from("profiles").insert({ id: adminA.id });
  if (p1.error) throw new Error(`profile A admin: ${p1.error.message}`);
  const p2 = await clientMemberA.from("profiles").insert({ id: memberA.id });
  if (p2.error) throw new Error(`profile A member: ${p2.error.message}`);

  membershipAdminA = randomUUID();
  membershipMemberA = randomUUID();
  // memberships_insert_admin allows any existing admin/owner to add a
  // member -- ownerA is admin-equivalent (is_organization_admin treats
  // owner and admin the same), so this exercises the real RLS insert path
  // rather than a service-role bypass.
  const m1 = await fx.clientOwnerA
    .from("memberships")
    .insert({ id: membershipAdminA, organization_id: fx.orgA.id, profile_id: adminA.id, role: "admin" });
  if (m1.error) throw new Error(`membership A admin: ${m1.error.message}`);
  const m2 = await fx.clientOwnerA
    .from("memberships")
    .insert({ id: membershipMemberA, organization_id: fx.orgA.id, profile_id: memberA.id, role: "member" });
  if (m2.error) throw new Error(`membership A member: ${m2.error.message}`);

  // As of 0009/0013 (Phase 14), page/action visibility requires explicit
  // grant rows -- a hand-inserted membership (bypassing accept_invitation's
  // materialization and the backfill migration) starts with none. Granting
  // adminA the 'members' page + roles_permissions:assign_role + members:delete
  // mirrors the Admin default preset closely enough to exercise this
  // suite's real role-change/removal RLS paths, not an artificially
  // permission-less fixture. See tests/integration/rls/action-permissions.test.ts
  // for the dedicated "role gates nothing beyond the default preset" matrix.
  const pagePermissionResult = await fx.clientOwnerA
    .from("membership_page_permissions")
    .insert({ membership_id: membershipAdminA, page: "members" });
  if (pagePermissionResult.error) {
    throw new Error(`admin page permission: ${pagePermissionResult.error.message}`);
  }
  const actionPermissionResult = await fx.clientOwnerA.from("membership_action_permissions").insert(
    ["roles_permissions:assign_role", "members:delete"].map((permission_key) => ({
      membership_id: membershipAdminA,
      permission_key,
    })),
  );
  if (actionPermissionResult.error) {
    throw new Error(`admin action permission: ${actionPermissionResult.error.message}`);
  }
}, 60_000);

afterAll(async () => {
  // Cascades: auth.users -> profiles -> memberships, so no separate
  // membership cleanup is needed (same reasoning as cleanupOrganizationsAndIdentities
  // in tests/integration/rls/fixtures.ts).
  if (adminA) await deleteTestIdentity(adminA.id);
  if (memberA) await deleteTestIdentity(memberA.id);
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("member list (memberships_select_member)", () => {
  it("resolves only the current organization's members", async () => {
    const members = await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id);
    const ids = members.map((m) => m.membershipId);
    expect(ids).toContain(membershipAdminA);
    expect(ids).toContain(membershipMemberA);
  });

  it("a member of Org A cannot see Org B's members", async () => {
    const members = await getOrganizationMembers(fx.clientOwnerA, fx.orgB.id, fx.ownerA.id);
    expect(members).toHaveLength(0);
  });

  it("an unauthenticated client cannot read memberships at all", async () => {
    const result = await anonClient().from("memberships").select("id").eq("organization_id", fx.orgA.id);
    expect(result.data ?? []).toHaveLength(0);
  });

  it("a non-member (customerB, no relationship to Org A) cannot access Org A's member list", async () => {
    const members = await getOrganizationMembers(fx.clientCustomerB, fx.orgA.id, fx.customerB.id);
    expect(members).toHaveLength(0);
  });

  it("includes joinedAt for each member", async () => {
    const members = await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id);
    const admin = members.find((m) => m.membershipId === membershipAdminA);
    expect(admin?.joinedAt).toBeTruthy();
  });
});

describe("role updates: authorized paths", () => {
  it("an admin can change a plain member's role to admin", async () => {
    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      membershipMemberA,
      "admin",
    );
    expect(result.ok).toBe(true);

    // revert for later tests
    const revert = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      membershipMemberA,
      "member",
    );
    expect(revert.ok).toBe(true);
  });

  it("a same-role update is a safe no-op", async () => {
    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      membershipMemberA,
      "member",
    );
    expect(result.ok).toBe(true);
  });
});

describe("role updates: rejected paths", () => {
  it("a plain member cannot change anyone's role -- the real RLS backstop, not just the app check", async () => {
    // memberships_update_admin requires is_organization_admin(organization_id).
    // Unlike a missing INSERT policy (42501), an UPDATE whose USING clause
    // doesn't match the row is filtered silently -- same behavior as
    // DELETE (see the "unauthorized removal" test below): no error, zero
    // rows affected. memberA is role='member', so this row simply doesn't
    // match for them, even bypassing updateMemberRoleForOrganization's own
    // app logic entirely.
    const result = await clientMemberA
      .from("memberships")
      .update({ role: "admin" })
      .eq("id", membershipMemberA)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data ?? []).toHaveLength(0);

    const groundTruth = await adminClient.from("memberships").select("role").eq("id", membershipMemberA).single();
    expect(groundTruth.data?.role).toBe("member");
  });

  it("an admin cannot change their own role (self-promotion is blocked regardless of target role)", async () => {
    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      membershipAdminA,
      "owner",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/own role/i);
  });

  it("an owner cannot change their own role either", async () => {
    const result = await updateMemberRoleForOrganization(
      fx.clientOwnerA,
      fx.orgA.id,
      fx.ownerA.id,
      "owner",
      // ownerA's own membership id isn't tracked on the fixture object,
      // so look it up the same way the app would.
      (await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id)).find((m) => m.isCurrentUser)!
        .membershipId,
      "admin",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/own role/i);
  });

  it("privilege escalation is rejected: an admin cannot grant the owner role to anyone", async () => {
    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      membershipMemberA,
      "owner",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/owner/i);
  });

  it("owner protection: an admin cannot demote the real owner", async () => {
    const ownerMembershipId = (await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id)).find(
      (m) => m.profileId === fx.ownerA.id,
    )!.membershipId;

    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      ownerMembershipId,
      "admin",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/owner/i);
  });

  it("cross-tenant role update is rejected: an Org A admin cannot touch an Org B membership", async () => {
    const ownerBMembershipId = (await getOrganizationMembers(fx.clientOwnerB, fx.orgB.id, fx.ownerB.id)).find(
      (m) => m.profileId === fx.ownerB.id,
    )!.membershipId;

    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id, // adminA's own (real) org -- never trusted as proof the target row is in it
      adminA.id,
      "admin",
      ownerBMembershipId,
      "member",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Member not found.");
  });

  it("cross-tenant role update is also rejected at the raw RLS level, not just by the org-scoped lookup above", async () => {
    const ownerBMembershipId = (await getOrganizationMembers(fx.clientOwnerB, fx.orgB.id, fx.ownerB.id)).find(
      (m) => m.profileId === fx.ownerB.id,
    )!.membershipId;

    // Same USING-clause-filters-silently behavior as the test above:
    // adminA is not an admin of orgB, so is_organization_admin(orgB's real
    // organization_id) is false and the row just doesn't match -- no error.
    const result = await clientAdminA
      .from("memberships")
      .update({ role: "member" })
      .eq("id", ownerBMembershipId)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data ?? []).toHaveLength(0);

    const groundTruth = await adminClient.from("memberships").select("role").eq("id", ownerBMembershipId).single();
    expect(groundTruth.data?.role).toBe("owner");
  });

  it("updating a nonexistent membership id reports failure, not a fabricated success", async () => {
    const result = await updateMemberRoleForOrganization(
      clientAdminA,
      fx.orgA.id,
      adminA.id,
      "admin",
      randomUUID(),
      "admin",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Member not found.");
  });
});

// The "documented RLS gap" tests that used to live here (proving an admin
// could grant themselves owner, or rewrite profile_id, via a raw UPDATE)
// asserted the PRE-migration vulnerability -- now that
// 0004_membership_ownership_hardening.sql is applied, those exact
// operations are correctly rejected, so those assertions would be
// actively wrong to keep. The "0004_membership_ownership_hardening.sql:
// post-migration behavior (F, G, H)" block below covers the same ground
// with the correct, current expectations.

describe(
  "0004_membership_ownership_hardening.sql: post-migration behavior (F, G, H)",
  () => {
    // The destructive/mutating scenarios (A single-org transfer, B/C
    // multi-org resolution, D non-owner via the RPC, E target-already-owner,
    // I exactly-one-owner, J concurrency) live in
    // tests/integration/features/ownership-transfer.test.ts, which has its
    // own fully isolated fixture -- an actual successful transfer here
    // would change adminA/ownerA's roles out from under every other test
    // in this shared-fixture file (e.g. "member removal: owner protection"
    // below assumes ownerA is still role='owner'). These four are all
    // non-mutating (every one is expected to be rejected, leaving state
    // unchanged), so they're safe to run against this file's shared fixture.

    it("F: profile_id cannot be changed by anyone, even an admin", async () => {
      const result = await clientAdminA
        .from("memberships")
        .update({ profile_id: adminA.id })
        .eq("id", membershipMemberA);
      expect(result.error).not.toBeNull();

      const groundTruth = await adminClient.from("memberships").select("profile_id").eq("id", membershipMemberA).single();
      expect(groundTruth.data?.profile_id).toBe(memberA.id);
    });

    it("G: a non-owner admin cannot grant themselves owner via a raw UPDATE", async () => {
      const result = await clientAdminA.from("memberships").update({ role: "owner" }).eq("id", membershipAdminA);
      expect(result.error).not.toBeNull();

      const groundTruth = await adminClient.from("memberships").select("role").eq("id", membershipAdminA).single();
      expect(groundTruth.data?.role).toBe("admin");
    });

    it("H: a non-owner admin cannot demote the real owner via a raw UPDATE", async () => {
      const ownerMembershipId = (await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id)).find(
        (m) => m.profileId === fx.ownerA.id,
      )!.membershipId;
      const result = await clientAdminA.from("memberships").update({ role: "admin" }).eq("id", ownerMembershipId);
      expect(result.error).not.toBeNull();

      const groundTruth = await adminClient.from("memberships").select("role").eq("id", ownerMembershipId).single();
      expect(groundTruth.data?.role).toBe("owner");
    });

    it("H: a non-owner admin cannot delete the owner via a raw DELETE", async () => {
      const ownerMembershipId = (await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id)).find(
        (m) => m.profileId === fx.ownerA.id,
      )!.membershipId;
      const result = await clientAdminA.from("memberships").delete().eq("id", ownerMembershipId);
      expect(result.error).not.toBeNull();

      const groundTruth = await adminClient.from("memberships").select("id").eq("id", ownerMembershipId);
      expect(groundTruth.data ?? []).toHaveLength(1);
    });
  },
);

describe("member removal: authorized and rejected paths", () => {
  it("an admin can remove a plain member who isn't the owner and isn't themselves", async () => {
    const removableId = randomUUID();
    const identity = await createTestIdentity("org-a-removable");
    const client = await signInAs(identity);
    await client.from("profiles").insert({ id: identity.id });
    await fx.clientOwnerA
      .from("memberships")
      .insert({ id: removableId, organization_id: fx.orgA.id, profile_id: identity.id, role: "member" });

    const result = await removeMemberForOrganization(clientAdminA, fx.orgA.id, adminA.id, "admin", removableId);
    expect(result.ok).toBe(true);

    const groundTruth = await adminClient.from("memberships").select("id").eq("id", removableId);
    expect(groundTruth.data ?? []).toHaveLength(0);

    await deleteTestIdentity(identity.id);
  });

  it("an admin cannot remove themselves through this path", async () => {
    const result = await removeMemberForOrganization(clientAdminA, fx.orgA.id, adminA.id, "admin", membershipAdminA);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/yourself/i);
  });

  it("owner protection: an admin cannot remove the real owner", async () => {
    const ownerMembershipId = (await getOrganizationMembers(fx.clientOwnerA, fx.orgA.id, fx.ownerA.id)).find(
      (m) => m.profileId === fx.ownerA.id,
    )!.membershipId;

    const result = await removeMemberForOrganization(clientAdminA, fx.orgA.id, adminA.id, "admin", ownerMembershipId);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/owner/i);
  });

  it("unauthorized removal is rejected at the raw RLS level: a plain member cannot remove someone else", async () => {
    // memberships_delete_admin_or_self: memberA is neither an admin nor
    // the target row's own profile_id here, so this is denied.
    const result = await clientMemberA.from("memberships").delete().eq("id", membershipAdminA);
    expect(result.error).toBeNull(); // RLS filters silently on DELETE, not an error
    const groundTruth = await adminClient.from("memberships").select("id").eq("id", membershipAdminA);
    expect(groundTruth.data ?? []).toHaveLength(1); // still there
  });

  it("cross-tenant removal is rejected: an Org A admin cannot remove an Org B membership", async () => {
    const ownerBMembershipId = (await getOrganizationMembers(fx.clientOwnerB, fx.orgB.id, fx.ownerB.id)).find(
      (m) => m.profileId === fx.ownerB.id,
    )!.membershipId;

    const result = await removeMemberForOrganization(clientAdminA, fx.orgA.id, adminA.id, "admin", ownerBMembershipId);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Member not found.");
  });

  it("removing a nonexistent membership id reports failure, not a fabricated success", async () => {
    const result = await removeMemberForOrganization(clientAdminA, fx.orgA.id, adminA.id, "admin", randomUUID());
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Member not found.");
  });
});

describe("invitations: confirms the documented gap rather than assuming it", () => {
  it("a customer matching a pending invitation's email still cannot self-insert a membership -- no accept path exists", async () => {
    const invitationId = randomUUID();
    const seeded = await adminClient.from("invitations").insert({
      id: invitationId,
      organization_id: fx.orgA.id,
      email: fx.customerA.email,
      role: "member",
      token_hash: "test-hash-not-a-real-token",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: fx.ownerA.id,
    });
    expect(seeded.error).toBeNull();

    // No RLS policy lets a non-admin, non-existing-member insert their own
    // membership row for this org -- memberships_insert_bootstrap_owner
    // requires zero existing memberships (false here) and role='owner';
    // memberships_insert_admin requires the caller to already be an admin.
    const result = await fx.clientCustomerA.from("memberships").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      profile_id: fx.customerA.id,
      role: "member",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");

    await adminClient.from("invitations").delete().eq("id", invitationId);
  });
});
