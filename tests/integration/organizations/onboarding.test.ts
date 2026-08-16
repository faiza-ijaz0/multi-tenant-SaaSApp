import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizationAccessDeniedError } from "@/lib/auth/errors";
import { createOrganizationForUser, resolveOrganizationContext } from "@/lib/auth/organization";
import { getOrganizationMembers, getOrganizationPortalSlug } from "@/lib/auth/organization-details";

import {
  adminClient,
  createTestIdentity,
  deleteTestIdentity,
  signInAs,
  type TestIdentity,
} from "../rls/helpers";

// Real runtime verification of Phase 4 organization onboarding, using
// createOrganizationForUser directly -- the same framework-agnostic core
// the createOrganization Server Action calls (lib/auth/organization-actions.ts).
// The Server Action itself can't be invoked outside the Next.js request
// runtime (redirect()/headers()/cookies() all require it), same reasoning
// Phase 2/3 applied to lib/auth/context.ts and auth-actions.ts. Every
// assertion here goes through genuine Supabase Auth sessions -- never
// simulated request.jwt.claims, never SET ROLE. The service-role client
// (adminClient) is used only for ground-truth verification and cleanup, as
// established in Phase 1A.

let creator: TestIdentity;
let outsider: TestIdentity;
let creatorClient: SupabaseClient;
let outsiderClient: SupabaseClient;
const createdOrgIds: string[] = [];

beforeAll(async () => {
  [creator, outsider] = await Promise.all([
    createTestIdentity("onboarding-creator"),
    createTestIdentity("onboarding-outsider"),
  ]);
  [creatorClient, outsiderClient] = await Promise.all([signInAs(creator), signInAs(outsider)]);
}, 30_000);

afterAll(async () => {
  await Promise.allSettled(
    createdOrgIds.map((id) => adminClient.from("organizations").delete().eq("id", id)),
  );
  const identityIds = [creator, outsider].filter(Boolean).map((identity) => identity.id);
  await Promise.allSettled(identityIds.map(deleteTestIdentity));
}, 30_000);

describe("createOrganizationForUser (onboarding)", () => {
  it("lets an authenticated user with zero organizations onboard, creating a real organization with them as Owner", async () => {
    const result = await createOrganizationForUser(creatorClient, creator.id, "Onboarding Test Org");
    createdOrgIds.push(result.organization.id);

    expect(result.organization.name).toBe("Onboarding Test Org");
    expect(result.membership.role).toBe("owner");

    // Ground truth via the service-role client -- confirms the rows
    // genuinely exist in the database, not just that the insert calls
    // returned success.
    const orgRow = await adminClient
      .from("organizations")
      .select("id, name")
      .eq("id", result.organization.id)
      .maybeSingle();
    expect(orgRow.data?.name).toBe("Onboarding Test Org");

    const membershipRow = await adminClient
      .from("memberships")
      .select("profile_id, role")
      .eq("organization_id", result.organization.id)
      .maybeSingle();
    expect(membershipRow.data).toMatchObject({ profile_id: creator.id, role: "owner" });
  });

  it("lets the creator resolve the newly created organization as owner", async () => {
    const orgId = createdOrgIds[0];
    const context = await resolveOrganizationContext(creatorClient, creator.id, orgId);
    expect(context.organization.id).toBe(orgId);
    expect(context.membership.role).toBe("owner");
  });

  it("rejects a second, unrelated authenticated user resolving the new organization", async () => {
    const orgId = createdOrgIds[0];
    await expect(
      resolveOrganizationContext(outsiderClient, outsider.id, orgId),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
  });

  it("denies an unrelated user's client-supplied organization_id at the database level, not just in app logic", async () => {
    const orgId = createdOrgIds[0];
    const memberships = await outsiderClient.from("memberships").select("id").eq("organization_id", orgId);
    expect(memberships.data ?? []).toHaveLength(0);

    const organizations = await outsiderClient.from("organizations").select("id").eq("id", orgId);
    expect(organizations.data ?? []).toHaveLength(0);
  });

  it("rejects a membership insert whose profile_id doesn't match the authenticated caller -- no member can be tricked into creating someone else's membership", async () => {
    const bootstrapOrgId = randomUUID();
    const orgInsert = await creatorClient
      .from("organizations")
      .insert({ id: bootstrapOrgId, name: "Bootstrap Trick Attempt" });
    expect(orgInsert.error).toBeNull();
    createdOrgIds.push(bootstrapOrgId);

    // creatorClient is authenticated as `creator`, but the row claims
    // `outsider` as profile_id. memberships_insert_bootstrap_owner requires
    // profile_id = auth.uid(), so this must fail regardless of what the
    // client sends -- the identity comes from the verified session, never
    // from request data.
    const membershipInsert = await creatorClient.from("memberships").insert({
      id: randomUUID(),
      organization_id: bootstrapOrgId,
      profile_id: outsider.id,
      role: "owner",
    });
    expect(membershipInsert.error).not.toBeNull();
    expect(membershipInsert.error?.code).toBe("42501");
  });

  it("rejects a blank organization name", async () => {
    await expect(createOrganizationForUser(creatorClient, creator.id, "   ")).rejects.toThrow();
  });

  it("handles two organizations whose names produce the same base slug safely, without a crash or a real collision", async () => {
    const first = await createOrganizationForUser(creatorClient, creator.id, "Duplicate Slug Co");
    createdOrgIds.push(first.organization.id);
    const second = await createOrganizationForUser(creatorClient, creator.id, "Duplicate Slug Co");
    createdOrgIds.push(second.organization.id);

    expect(first.portalSlug).not.toBeNull();
    expect(second.portalSlug).not.toBeNull();
    expect(second.portalSlug).not.toBe(first.portalSlug);
  });
});

describe("organization settings data access is tenant-isolated", () => {
  it("shows the real member roster to the owner", async () => {
    const orgId = createdOrgIds[0];
    const members = await getOrganizationMembers(creatorClient, orgId, creator.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ profileId: creator.id, role: "owner", isCurrentUser: true });
  });

  it("returns nothing to an unrelated user for the same organization", async () => {
    const orgId = createdOrgIds[0];
    const members = await getOrganizationMembers(outsiderClient, orgId, outsider.id);
    expect(members).toHaveLength(0);

    const slug = await getOrganizationPortalSlug(outsiderClient, orgId);
    expect(slug).toBeNull();
  });

  // Requirement: "non-admin/member cannot perform admin-only organization
  // mutation if such mutation is implemented." Not applicable -- Phase 4's
  // organization settings page is deliberately read-only (see the Phase 4
  // report for why); no admin-only mutation exists yet to test against.
});

describe("onboarding is not required for users who already have an organization", () => {
  it("resolves successfully (no OrganizationNotFoundError) for a user who already owns an organization", async () => {
    // This is exactly the condition app/onboarding/page.tsx checks to
    // decide whether to redirect an already-onboarded user to /dashboard
    // instead of showing the onboarding form. The page's own redirect
    // can't be invoked outside the Next.js runtime (same constraint as
    // Phase 3's login/signup page tests), so this verifies the underlying
    // condition directly, through a real session.
    const context = await resolveOrganizationContext(creatorClient, creator.id, undefined);
    expect(createdOrgIds).toContain(context.organization.id);
  });
});
