import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuthenticatedUser } from "@/lib/auth/user";
import { listUserMemberships, resolveOrganizationContext } from "@/lib/auth/organization";
import {
  InvalidOrganizationContextError,
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

import { anonClient, createTestIdentity, deleteTestIdentity, signInAs } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Real runtime verification of the tenant-context layer (lib/auth/*): every
// assertion goes through genuine Supabase Auth sessions or a real
// unauthenticated anon client -- never simulated request.jwt.claims, never
// the postgres MCP/superuser connection. Fixtures are the same "RLS Test
// Organization A/B" + 4 identities Phase 1A already established.

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  // setupFixtures cleans up after itself on failure, so fx is only ever
  // undefined here if beforeAll never got far enough to create anything.
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("getAuthenticatedUser", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(getAuthenticatedUser(anonClient())).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("resolves a real authenticated user correctly", async () => {
    const user = await getAuthenticatedUser(fx.clientOwnerA);
    expect(user.id).toBe(fx.ownerA.id);
    expect(user.email).toBe(fx.ownerA.email);
  });
});

describe("resolveOrganizationContext", () => {
  it("resolves a valid organization membership", async () => {
    const context = await resolveOrganizationContext(fx.clientOwnerA, fx.ownerA.id, fx.orgA.id);
    expect(context.organization.id).toBe(fx.orgA.id);
    expect(context.membership.role).toBe("owner");
  });

  it("rejects a non-member organization", async () => {
    // ownerA has no relationship at all to Org B.
    await expect(
      resolveOrganizationContext(fx.clientOwnerA, fx.ownerA.id, fx.orgB.id),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
  });

  it("rejects an invalid organization context (malformed id)", async () => {
    await expect(
      resolveOrganizationContext(fx.clientOwnerA, fx.ownerA.id, "not-a-uuid"),
    ).rejects.toBeInstanceOf(InvalidOrganizationContextError);
  });

  it("rejects switching to another user's organization", async () => {
    // customerB is a real, authenticated identity -- but has never joined
    // Org A. "Switching" is exactly this call with a different org id.
    await expect(
      resolveOrganizationContext(fx.clientCustomerB, fx.customerB.id, fx.orgA.id),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
  });

  it("cannot be overridden by a client-supplied organization_id the caller doesn't own", async () => {
    // ownerB is only ever a member of Org B. Whatever a "client" claims,
    // the resolver only ever trusts the caller's own verified memberships.
    await expect(
      resolveOrganizationContext(fx.clientOwnerB, fx.ownerB.id, fx.orgA.id),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);

    // And the legitimate resolution for that same user still works --
    // proving the rejection above is about ownership, not a broken resolver.
    const own = await resolveOrganizationContext(fx.clientOwnerB, fx.ownerB.id, fx.orgB.id);
    expect(own.organization.id).toBe(fx.orgB.id);
  });

  it("throws OrganizationNotFoundError for an authenticated user with no memberships at all", async () => {
    const orphan = await createTestIdentity("tenant-context-orphan");
    try {
      const client = await signInAs(orphan);
      await expect(resolveOrganizationContext(client, orphan.id)).rejects.toBeInstanceOf(
        OrganizationNotFoundError,
      );
    } finally {
      await deleteTestIdentity(orphan.id);
    }
  });
});

describe("resolved context is safe to use for tenant-scoped queries", () => {
  it("a query scoped by the validated organization id returns only that organization's data", async () => {
    const context = await resolveOrganizationContext(fx.clientOwnerA, fx.ownerA.id, fx.orgA.id);

    const result = await fx.clientOwnerA
      .from("statuses")
      .select("id")
      .eq("organization_id", context.organization.id);

    const ids = result.data?.map((r) => r.id) ?? [];
    expect(ids).toContain(fx.statusA);
    expect(ids).not.toContain(fx.statusB);
  });
});

describe("listUserMemberships", () => {
  it("returns exactly the caller's own memberships, not other organizations'", async () => {
    const memberships = await listUserMemberships(fx.clientOwnerA, fx.ownerA.id);
    const orgIds = memberships.map((m) => m.organization.id);
    expect(orgIds).toContain(fx.orgA.id);
    expect(orgIds).not.toContain(fx.orgB.id);
  });
});
