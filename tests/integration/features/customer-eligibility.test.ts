import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isEligibleCustomerForOrganization } from "@/features/customers/customer-eligibility";

import { adminClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Phase 4 fix: a valid Supabase Auth session (internal owner/admin/member
// and external customer accounts share the exact same auth.users table by
// design) must never be sufficient proof of customer-portal eligibility on
// its own. isEligibleCustomerForOrganization is the framework-agnostic core
// that customerLogin, resolvePortalEntry, resolveCustomerIdentity, and the
// customer-only submission/comment actions all now call before treating an
// authenticated caller as a customer of a given organization -- exercised
// here directly against real authenticated sessions and real RLS, the same
// disposable-fixture pattern as tests/integration/rls/rls-policies.test.ts.
// No production/real data is touched; every identity/org is created fresh
// in beforeAll and deleted in afterAll.

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("isEligibleCustomerForOrganization (Phase 4 customer-portal authorization boundary)", () => {
  it("an internal owner of an organization is NOT eligible for that organization's customer portal", async () => {
    // This is the exact bug reported in Phase 4 QA: an Owner account
    // authenticating successfully through customerLogin must not be
    // treated as a customer of their own organization.
    const eligible = await isEligibleCustomerForOrganization(fx.clientOwnerA, fx.ownerA.id, fx.orgA.id);
    expect(eligible).toBe(false);
  });

  it("a real, registered customer of an organization IS eligible for that organization's customer portal", async () => {
    const eligible = await isEligibleCustomerForOrganization(fx.clientCustomerA, fx.customerA.id, fx.orgA.id);
    expect(eligible).toBe(true);
  });

  it("a customer of Org A has no internal-membership conflict for Org B (a separate, already-tested boundary governs whether they can actually reach Org B's private portal)", async () => {
    // customerA has neither a customers row nor a memberships row in Org B,
    // so this check alone doesn't block them -- but reaching Org B's
    // *private* portal at all is independently gated by
    // portal_settings_select_member_or_public (see rls-policies.test.ts's
    // "anon cannot read Org B's private portal/org data"), which this test
    // doesn't re-exercise.
    const eligible = await isEligibleCustomerForOrganization(fx.clientCustomerA, fx.customerA.id, fx.orgB.id);
    expect(eligible).toBe(true);
  });

  it("an internal owner of Org A who is ALSO a real registered customer of Org B is eligible for Org B specifically, and still rejected for Org A", async () => {
    // Simulates the Phase 4 spec's "Owner of Org A, Customer of Org B"
    // scenario: register ownerA as a genuine customer of Org B (the same
    // customers-table row createPublicSubmission/createPortalComment's
    // self-registration produces for a real customer), via the service-role
    // client purely as test setup -- not exercising any app code path here.
    const { error } = await adminClient
      .from("customers")
      .insert({ id: randomUUID(), organization_id: fx.orgB.id, profile_id: fx.ownerA.id, email: fx.ownerA.email });
    expect(error).toBeNull();

    const eligibleForOrgB = await isEligibleCustomerForOrganization(fx.clientOwnerA, fx.ownerA.id, fx.orgB.id);
    expect(eligibleForOrgB).toBe(true);

    const eligibleForOrgA = await isEligibleCustomerForOrganization(fx.clientOwnerA, fx.ownerA.id, fx.orgA.id);
    expect(eligibleForOrgA).toBe(false);
  });
});
