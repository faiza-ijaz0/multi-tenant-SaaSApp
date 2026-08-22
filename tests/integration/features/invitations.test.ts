import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createInvitationForOrganization,
  listPendingInvitations,
  revokeInvitationForOrganization,
} from "@/features/members/invitations";

import {
  adminClient,
  anonClient,
  createTestIdentity,
  deleteTestIdentity,
  signInAs,
  type TestIdentity,
} from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Every describe block in this file runs against live, applied state:
// invitations_* policies and invitations_org_email_pending_unique from
// 0003_rls_policies.sql, plus accept_invitation()/get_invitation_preview()
// from 0005_invitation_acceptance.sql -- confirmed applied and live (Phase
// 10A/11 verification). No describe.skip remains; nothing here depends on
// an unapplied migration.

let fx: RlsFixtures;
let adminA: TestIdentity;
let clientAdminA: SupabaseClient;

beforeAll(async () => {
  fx = await setupFixtures();

  adminA = await createTestIdentity("org-a-invite-admin");
  clientAdminA = await signInAs(adminA);
  const profileResult = await clientAdminA.from("profiles").insert({ id: adminA.id });
  if (profileResult.error) throw new Error(`profile: ${profileResult.error.message}`);

  const membershipId = randomUUID();
  const membershipResult = await fx.clientOwnerA
    .from("memberships")
    .insert({ id: membershipId, organization_id: fx.orgA.id, profile_id: adminA.id, role: "admin" });
  if (membershipResult.error) throw new Error(`membership: ${membershipResult.error.message}`);

  // As of 0009/0013 (Phase 14), page/action visibility requires explicit
  // grant rows -- a hand-inserted membership (bypassing accept_invitation's
  // materialization and the backfill migration, both of which only cover
  // real invitation-acceptance/pre-existing-membership paths) starts with
  // none. Granting the 'members' page + invitations:view/create/revoke here
  // mirrors what the Admin default preset (lib/authorization/registry.ts)
  // actually gives a real admin, so this suite exercises invitations_*'s
  // real RLS shape rather than an artificially permission-less fixture.
  const pagePermissionResult = await fx.clientOwnerA
    .from("membership_page_permissions")
    .insert({ membership_id: membershipId, page: "members" });
  if (pagePermissionResult.error) {
    throw new Error(`page permission: ${pagePermissionResult.error.message}`);
  }
  const actionPermissionResult = await fx.clientOwnerA.from("membership_action_permissions").insert(
    ["invitations:view", "invitations:create", "invitations:revoke"].map((permission_key) => ({
      membership_id: membershipId,
      permission_key,
    })),
  );
  if (actionPermissionResult.error) {
    throw new Error(`action permission: ${actionPermissionResult.error.message}`);
  }
}, 60_000);

afterAll(async () => {
  if (adminA) await deleteTestIdentity(adminA.id);
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("creating invitations", () => {
  it("an admin can create an invitation for their own organization", async () => {
    const email = `invite-${randomUUID()}@example.com`;
    const result = await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    expect(result.ok).toBe(true);
    expect(result.inviteToken).toBeTruthy();
    expect(result.inviteToken).toHaveLength(64); // randomBytes(32).toString("hex")

    const groundTruth = await adminClient
      .from("invitations")
      .select("organization_id, email, role, created_by")
      .eq("email", email)
      .single();
    expect(groundTruth.data?.organization_id).toBe(fx.orgA.id);
    expect(groundTruth.data?.role).toBe("member");
    expect(groundTruth.data?.created_by).toBe(adminA.id);

    await adminClient.from("invitations").delete().eq("email", email);
  });

  it("the raw token is never the same as the stored token_hash", async () => {
    const email = `invite-${randomUUID()}@example.com`;
    const result = await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    expect(result.ok).toBe(true);

    const groundTruth = await adminClient.from("invitations").select("token_hash").eq("email", email).single();
    expect(groundTruth.data?.token_hash).not.toBe(result.inviteToken);
    expect(groundTruth.data?.token_hash).toHaveLength(64); // sha256 hex digest

    await adminClient.from("invitations").delete().eq("email", email);
  });

  it("a non-admin (customer) cannot create an invitation -- the real RLS backstop", async () => {
    const result = await fx.clientCustomerA.from("invitations").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      email: `blocked-${randomUUID()}@example.com`,
      role: "member",
      token_hash: "x".repeat(64),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: fx.customerA.id,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });

  it("duplicate pending invitations for the same email are rejected safely, not as a raw constraint error", async () => {
    const email = `dup-${randomUUID()}@example.com`;
    const first = await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    expect(first.ok).toBe(true);

    const second = await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "admin");
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already.*pending/i);

    await adminClient.from("invitations").delete().eq("email", email);
  });
});

describe("listing invitations", () => {
  it("lists only the current organization's pending invitations", async () => {
    const email = `list-${randomUUID()}@example.com`;
    await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");

    const invitations = await listPendingInvitations(clientAdminA, fx.orgA.id);
    expect(invitations.map((i) => i.email)).toContain(email);

    const orgBInvitations = await listPendingInvitations(fx.clientOwnerB, fx.orgB.id);
    expect(orgBInvitations.map((i) => i.email)).not.toContain(email);

    await adminClient.from("invitations").delete().eq("email", email);
  });

  it("a non-admin sees no invitations at all -- RLS-filtered, not an error", async () => {
    const invitations = await listPendingInvitations(fx.clientCustomerA, fx.orgA.id);
    expect(invitations).toHaveLength(0);
  });
});

describe("revoking invitations", () => {
  it("an admin can revoke a pending invitation in their own org", async () => {
    const email = `revoke-${randomUUID()}@example.com`;
    const created = await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    const invitationId = (
      await adminClient.from("invitations").select("id").eq("email", email).single()
    ).data!.id as string;

    const result = await revokeInvitationForOrganization(clientAdminA, fx.orgA.id, invitationId);
    expect(result.ok).toBe(true);

    const groundTruth = await adminClient.from("invitations").select("id").eq("id", invitationId);
    expect(groundTruth.data ?? []).toHaveLength(0);
    void created;
  });

  it("a non-admin cannot revoke -- the real RLS backstop", async () => {
    const email = `revoke-blocked-${randomUUID()}@example.com`;
    await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    const invitationId = (
      await adminClient.from("invitations").select("id").eq("email", email).single()
    ).data!.id as string;

    const result = await fx.clientCustomerA.from("invitations").delete().eq("id", invitationId).select("id");
    expect(result.error).toBeNull(); // RLS filters silently, not an error
    expect(result.data ?? []).toHaveLength(0);

    const groundTruth = await adminClient.from("invitations").select("id").eq("id", invitationId);
    expect(groundTruth.data ?? []).toHaveLength(1); // still there

    await adminClient.from("invitations").delete().eq("id", invitationId);
  });

  it("cross-tenant revoke is denied: an Org A admin cannot revoke an Org B invitation", async () => {
    const email = `cross-${randomUUID()}@example.com`;
    await adminClient.from("invitations").insert({
      id: randomUUID(),
      organization_id: fx.orgB.id,
      email,
      role: "member",
      token_hash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: fx.ownerB.id,
    });
    const invitationId = (
      await adminClient.from("invitations").select("id").eq("email", email).single()
    ).data!.id as string;

    const result = await revokeInvitationForOrganization(clientAdminA, fx.orgA.id, invitationId);
    expect(result.ok).toBe(false);

    const groundTruth = await adminClient.from("invitations").select("id").eq("id", invitationId);
    expect(groundTruth.data ?? []).toHaveLength(1); // untouched

    await adminClient.from("invitations").delete().eq("id", invitationId);
  });

  it("a revoked invitation no longer exists to be accepted", async () => {
    const email = `revoked-gone-${randomUUID()}@example.com`;
    await createInvitationForOrganization(clientAdminA, fx.orgA.id, adminA.id, email, "member");
    const invitationId = (
      await adminClient.from("invitations").select("id").eq("email", email).single()
    ).data!.id as string;

    await revokeInvitationForOrganization(clientAdminA, fx.orgA.id, invitationId);

    const groundTruth = await adminClient.from("invitations").select("id").eq("id", invitationId);
    expect(groundTruth.data ?? []).toHaveLength(0);
  });
});

/** Raw sha256 hex, matching features/members/invitations.ts's hashToken()
 * and 0005_invitation_acceptance.sql's encode(extensions.digest(...)) --
 * used here to seed invitation rows directly (via adminClient, test setup
 * only) with a known raw token this file's tests can then call
 * accept_invitation/get_invitation_preview with. */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function seedInvitation(options: {
  organizationId: string;
  email: string;
  role: "admin" | "member" | "owner";
  createdBy: string;
  expiresAt?: Date;
  createdAt?: Date;
  acceptedAt?: Date;
}): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const createdAt = options.createdAt ?? new Date();
  const expiresAt = options.expiresAt ?? new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const result = await adminClient.from("invitations").insert({
    id,
    organization_id: options.organizationId,
    email: options.email,
    role: options.role,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
    created_at: createdAt.toISOString(),
    created_by: options.createdBy,
    accepted_at: options.acceptedAt?.toISOString() ?? null,
  });
  if (result.error) throw new Error(`seedInvitation failed: ${result.error.message}`);

  return { id, token };
}

describe(
  "0005_invitation_acceptance.sql: accept_invitation()/get_invitation_preview()",
  () => {
    let invitee: TestIdentity;
    let clientInvitee: SupabaseClient;
    let wrongEmailUser: TestIdentity;
    let clientWrongEmailUser: SupabaseClient;

    beforeAll(async () => {
      invitee = await createTestIdentity("org-a-invitee");
      clientInvitee = await signInAs(invitee);
      const p1 = await clientInvitee.from("profiles").insert({ id: invitee.id });
      if (p1.error) throw new Error(`invitee profile: ${p1.error.message}`);

      wrongEmailUser = await createTestIdentity("org-a-wrong-email");
      clientWrongEmailUser = await signInAs(wrongEmailUser);
      const p2 = await clientWrongEmailUser.from("profiles").insert({ id: wrongEmailUser.id });
      if (p2.error) throw new Error(`wrong-email profile: ${p2.error.message}`);
    }, 60_000);

    afterAll(async () => {
      if (invitee) await deleteTestIdentity(invitee.id);
      if (wrongEmailUser) await deleteTestIdentity(wrongEmailUser.id);
    }, 60_000);

    afterEach(async () => {
      // invitations_org_email_pending_unique is a partial unique index on
      // (organization_id, lower(email)) WHERE accepted_at IS NULL --
      // without this, a seedInvitation() call in one test collides with a
      // still-pending row left behind by an earlier test that only
      // previewed (never accepted) an invitation for the same email.
      await adminClient
        .from("invitations")
        .delete()
        .eq("organization_id", fx.orgA.id)
        .in("email", [invitee.email, wrongEmailUser.email]);
    });

    describe("get_invitation_preview", () => {
      it("A: a valid invitation preview succeeds and returns the organization name and role", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("get_invitation_preview", { p_token: token });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.status).toBe("valid");
        expect(row.organization_name).toBe("RLS Test Organization A");
        expect(row.role).toBe("member");
      });

      it("B: an invalid/nonexistent token returns not_found with no details", async () => {
        const result = await clientInvitee.rpc("get_invitation_preview", { p_token: randomBytes(32).toString("hex") });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.status).toBe("not_found");
        expect(row.organization_name).toBeNull();
        expect(row.role).toBeNull();
      });

      it("C: an expired invitation returns expired with no details", async () => {
        const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
          createdAt: past,
          expiresAt: new Date(past.getTime() + 1000),
        });

        const result = await clientInvitee.rpc("get_invitation_preview", { p_token: token });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.status).toBe("expired");
        expect(row.organization_name).toBeNull();
      });

      it("D: an already-accepted invitation returns accepted with no details", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
          acceptedAt: new Date(),
        });

        const result = await clientInvitee.rpc("get_invitation_preview", { p_token: token });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.status).toBe("accepted");
        expect(row.organization_name).toBeNull();
      });

      it("E: calling preview does not mutate the invitation", async () => {
        const { id, token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        await clientInvitee.rpc("get_invitation_preview", { p_token: token });
        await clientInvitee.rpc("get_invitation_preview", { p_token: token });

        const groundTruth = await adminClient.from("invitations").select("accepted_at").eq("id", id).single();
        expect(groundTruth.data?.accepted_at).toBeNull();
      });

      it("F: the response never includes token_hash", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("get_invitation_preview", { p_token: token });
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(Object.keys(row)).not.toContain("token_hash");
      });

      it("M: an invitation for a different email returns wrong_email with no organization/role details leaked", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "admin",
          createdBy: adminA.id,
        });

        const result = await clientWrongEmailUser.rpc("get_invitation_preview", { p_token: token });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.status).toBe("wrong_email");
        expect(row.organization_name).toBeNull();
        expect(row.role).toBeNull();
      });
    });

    describe("accept_invitation", () => {
      it("G: a valid authenticated invitee can accept, creating exactly one membership with the invited role", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(result.error).toBeNull();
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row.organization_id).toBe(fx.orgA.id);
        expect(row.role).toBe("member");

        const memberships = await adminClient
          .from("memberships")
          .select("id, role")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", invitee.id);
        expect(memberships.data).toHaveLength(1);
        expect(memberships.data?.[0].role).toBe("member");

        await adminClient.from("memberships").delete().eq("organization_id", fx.orgA.id).eq("profile_id", invitee.id);
      });

      it("acceptance marks the invitation accepted", async () => {
        const { id, token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        await clientInvitee.rpc("accept_invitation", { p_token: token });

        const groundTruth = await adminClient.from("invitations").select("accepted_at").eq("id", id).single();
        expect(groundTruth.data?.accepted_at).not.toBeNull();

        await adminClient.from("memberships").delete().eq("organization_id", fx.orgA.id).eq("profile_id", invitee.id);
      });

      it("H: the wrong authenticated email cannot accept", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientWrongEmailUser.rpc("accept_invitation", { p_token: token });
        expect(result.error).not.toBeNull();
        expect(result.error?.code).toBe("42501");

        const memberships = await adminClient
          .from("memberships")
          .select("id")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", wrongEmailUser.id);
        expect(memberships.data ?? []).toHaveLength(0);
      });

      it("an unauthenticated caller cannot accept", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await anonClient().rpc("accept_invitation", { p_token: token });
        expect(result.error).not.toBeNull();
        expect(result.error?.code).toBe("28000");
      });

      it("I: an invitation cannot grant the owner role, even when seeded directly with role='owner'", async () => {
        // createInvitationForOrganization's own type signature (InvitableRole)
        // already excludes 'owner' at the app layer -- seeding directly via
        // adminClient bypasses that, to prove the database-level backstop
        // inside accept_invitation is real and not just relied-upon app logic.
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "owner",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(result.error).not.toBeNull();
        expect(result.error?.code).toBe("42501");

        const memberships = await adminClient
          .from("memberships")
          .select("id")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", invitee.id);
        expect(memberships.data ?? []).toHaveLength(0);
      });

      it("J: an already-accepted invitation cannot be replayed", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const first = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(first.error).toBeNull();

        const second = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(second.error).not.toBeNull();
        expect(second.error?.code).toBe("22023");

        const memberships = await adminClient
          .from("memberships")
          .select("id")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", invitee.id);
        expect(memberships.data).toHaveLength(1); // still exactly one, not duplicated

        await adminClient.from("memberships").delete().eq("organization_id", fx.orgA.id).eq("profile_id", invitee.id);
      });

      it("K: two concurrent accept calls with the same token cannot create duplicate memberships", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const [first, second] = await Promise.all([
          clientInvitee.rpc("accept_invitation", { p_token: token }),
          clientInvitee.rpc("accept_invitation", { p_token: token }),
        ]);

        const succeeded = [first, second].filter((r) => r.error === null);
        const failed = [first, second].filter((r) => r.error !== null);
        expect(succeeded).toHaveLength(1); // the invitation row lock serializes these
        expect(failed).toHaveLength(1);

        const memberships = await adminClient
          .from("memberships")
          .select("id")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", invitee.id);
        expect(memberships.data).toHaveLength(1); // never zero, never two

        await adminClient.from("memberships").delete().eq("organization_id", fx.orgA.id).eq("profile_id", invitee.id);
      });

      it("L: accepting while already a member is handled safely, reuses the existing membership, and never leaks a raw database error", async () => {
        const existingMembershipId = randomUUID();
        const preexisting = await adminClient
          .from("memberships")
          .insert({ id: existingMembershipId, organization_id: fx.orgA.id, profile_id: invitee.id, role: "admin" });
        expect(preexisting.error).toBeNull();

        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(result.error).toBeNull();

        const memberships = await adminClient
          .from("memberships")
          .select("id, role")
          .eq("organization_id", fx.orgA.id)
          .eq("profile_id", invitee.id);
        expect(memberships.data).toHaveLength(1); // reused, not duplicated
        expect(memberships.data?.[0].id).toBe(existingMembershipId);
        expect(memberships.data?.[0].role).toBe("admin"); // untouched, not downgraded to 'member'

        await adminClient.from("memberships").delete().eq("id", existingMembershipId);
      });

      it("an invitation from Org A cannot grant membership in Org B -- organization_id always comes from the invitation row itself", async () => {
        const { token } = await seedInvitation({
          organizationId: fx.orgA.id,
          email: invitee.email,
          role: "member",
          createdBy: adminA.id,
        });

        const result = await clientInvitee.rpc("accept_invitation", { p_token: token });
        expect(result.error).toBeNull();

        const orgBMemberships = await adminClient
          .from("memberships")
          .select("id")
          .eq("organization_id", fx.orgB.id)
          .eq("profile_id", invitee.id);
        expect(orgBMemberships.data ?? []).toHaveLength(0);

        await adminClient.from("memberships").delete().eq("organization_id", fx.orgA.id).eq("profile_id", invitee.id);
      });
    });
  },
);
