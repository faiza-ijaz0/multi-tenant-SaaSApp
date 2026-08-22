import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";

// ---------------------------------------------------------------------------
// Phase 11 Part B, item 10: controlled, disposable-data verification of a
// speculative concern raised during the Phase 11 audit -- does
// enforce_membership_owner_delete_protection (0004_membership_ownership_hardening.sql,
// applied live) correctly handle an owner deleting their OWN organization
// (organizations_delete_owner), which cascades a DELETE across every
// membership row in that org, including the caller's own owner row, all
// within the same statement?
//
// VERIFIED FINDING (not the originally-speculative concern, a distinct and
// definitively reproducible one): it does NOT handle this correctly.
// enforce_membership_owner_delete_protection's "at least one owner must
// remain" check (0004, lines ~123-132) counts OTHER owner rows in the same
// organization, excluding the row currently being deleted. When the owner
// deletes the organization itself, that count is always 0 for the last
// (or only) owner row in the cascade -- there is no "the whole
// organization is being deleted, not just this membership" distinction --
// so the trigger raises 23514 ("organization must always have at least
// one owner") and the entire DELETE FROM organizations statement is rolled
// back. In practice: an organization's owner can never delete their own
// organization via organizations_delete_owner while it still has any
// members, which today means never (every organization has at least its
// owner). This is separate from the auth.uid() IS NULL cascade bug 0006
// already fixed -- this path has a real, non-null, authenticated session
// throughout, and still fails.
//
// Confirmed NOT a regression from 0006 and NOT masked by it: adminClient
// (service-role) deleting the same kind of org succeeds, because a
// service-role delete has no session (auth.uid() IS NULL), which is
// exactly the branch 0006 added -- so this specific self-service-owner
// path is the only one still broken. Cleanup in afterAll relies on this.
//
// UPDATE (Phase 14): 0007_organization_self_delete_fix.sql fixes exactly
// this bug -- it adds a check to enforce_membership_owner_delete_protection
// so that when the organizations row itself is already gone (this DELETE on
// memberships is a cascade side effect of deleting the org, not a
// standalone membership removal), the "at least one owner must remain"
// invariant does not apply. Applied and verified live against project
// mosczhxreynyoeneztfm as part of the Phase 14 RBAC work (see that report).
// The first two tests below are flipped, per 0007's own header instruction,
// from asserting the 23514 rejection to asserting success -- this flip is
// the direct, empirical proof the fix works, not just a plausibility
// argument.
// ---------------------------------------------------------------------------

const createdOrgIds: string[] = [];
const createdIdentityIds: string[] = [];

afterAll(async () => {
  // Service-role delete: per the comment above, this succeeds even where
  // the owner's own client cannot (auth.uid() IS NULL takes the 0006 early
  // -return branch), so this reliably cleans up every org created below
  // regardless of whether the owner's own self-delete attempt succeeded.
  for (const id of createdOrgIds) {
    await adminClient.from("organizations").delete().eq("id", id);
  }
  for (const id of createdIdentityIds) {
    await deleteTestIdentity(id);
  }
}, 60_000);

async function createOwnedOrg(label: string): Promise<{ owner: TestIdentity; ownerClient: SupabaseClient; orgId: string }> {
  const owner = await createTestIdentity(label);
  createdIdentityIds.push(owner.id);
  const ownerClient = await signInAs(owner);
  await ownerClient.from("profiles").insert({ id: owner.id });

  const orgId = randomUUID();
  createdOrgIds.push(orgId);
  await ownerClient.from("organizations").insert({ id: orgId, name: `Cascade Test Org (${label})` });
  await ownerClient
    .from("memberships")
    .insert({ id: randomUUID(), organization_id: orgId, profile_id: owner.id, role: "owner" });

  return { owner, ownerClient, orgId };
}

describe("membership cascade-delete verification (disposable data only)", () => {
  it(
    "FIXED by 0007: a sole owner deleting their own organization succeeds -- the cascade " +
      "to their own owner membership row no longer trips the remaining-owner check, since " +
      "enforce_membership_owner_delete_protection now detects the organizations row is " +
      "already gone and skips the invariant for this specific case.",
    async () => {
      const { ownerClient, orgId } = await createOwnedOrg("cascade-solo-owner");

      const result = await ownerClient.from("organizations").delete().eq("id", orgId);
      expect(result.error).toBeNull();

      const { data: stillThere } = await adminClient.from("organizations").select("id").eq("id", orgId).maybeSingle();
      expect(stillThere).toBeNull();

      const { data: remainingMemberships } = await adminClient
        .from("memberships")
        .select("id")
        .eq("organization_id", orgId);
      expect(remainingMemberships ?? []).toHaveLength(0);
    },
  );

  it(
    "FIXED by 0007: the same success occurs even when a second, non-owner member exists -- " +
      "the org-already-gone check applies regardless of how many other membership rows are " +
      "cascading in the same statement.",
    async () => {
      const { ownerClient, orgId } = await createOwnedOrg("cascade-multi-owner");

      const admin = await createTestIdentity("cascade-multi-admin");
      createdIdentityIds.push(admin.id);
      // Service-role insert for setup only -- this test verifies cascade-delete
      // behavior, not the membership-creation path (already covered elsewhere).
      await adminClient.from("profiles").insert({ id: admin.id });
      await adminClient
        .from("memberships")
        .insert({ id: randomUUID(), organization_id: orgId, profile_id: admin.id, role: "admin" });

      const result = await ownerClient.from("organizations").delete().eq("id", orgId);
      expect(result.error).toBeNull();
    },
  );

  it(
    "confirms this is specific to the owner's own authenticated session, not a general " +
      "cascade failure: a service-role delete of the same kind of org (no session, " +
      "auth.uid() IS NULL -- the exact branch 0006 fixed) succeeds cleanly",
    async () => {
      const { orgId } = await createOwnedOrg("cascade-service-role-control");

      const result = await adminClient.from("organizations").delete().eq("id", orgId);
      expect(result.error).toBeNull();

      const { data: remainingMemberships } = await adminClient
        .from("memberships")
        .select("id")
        .eq("organization_id", orgId);
      expect(remainingMemberships ?? []).toHaveLength(0);
    },
  );
});
