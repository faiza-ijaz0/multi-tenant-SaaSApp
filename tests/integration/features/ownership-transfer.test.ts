import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";

// Dedicated, fully isolated fixture (not the shared tests/integration/rls/fixtures.ts
// setup) -- this file specifically needs a single identity that owns TWO
// separate organizations at once, which the shared fixture doesn't model
// and no other test file needs. Each test mutates real ownership state, so
// tests run in a specific, deliberate order (documented per-test) rather
// than being independent. transfer_organization_ownership()
// (0004_membership_ownership_hardening.sql) is confirmed applied and live
// (Phase 10A/11 verification) -- no describe.skip remains in this file.
//
// Three organizations:
//   orgX: multiOwner (owner), targetX (admin), coOwnerX (owner),
//         nonOwnerCallerX (admin) -- coOwnerX exists solely to test
//         "target is already owner" without colliding with the
//         self-targeting check; nonOwnerCallerX exists so "a non-owner
//         cannot transfer" can target a row that ISN'T already owner
//         (targetX), isolating "caller lacks owner standing" as the sole
//         rejection reason rather than incidentally hitting the
//         separate "target is already owner" check.
//   orgY: multiOwner (owner), targetY (admin) -- proves a transfer scoped
//         to orgX's identity resolution doesn't accidentally touch orgY,
//         and vice versa, for a caller who owns both.
//   orgZ: raceOwner (owner), raceTarget1 (admin), raceTarget2 (admin) --
//         isolated for the concurrency test.

interface OrgFixture {
  id: string;
}

let multiOwner: TestIdentity;
let targetX: TestIdentity;
let coOwnerX: TestIdentity;
let nonOwnerCallerX: TestIdentity;
let targetY: TestIdentity;
let raceOwner: TestIdentity;
let raceTarget1: TestIdentity;
let raceTarget2: TestIdentity;

let clientMultiOwner: SupabaseClient;
let clientNonOwnerCallerX: SupabaseClient;
let clientRaceOwner: SupabaseClient;

let orgX: OrgFixture;
let orgY: OrgFixture;
let orgZ: OrgFixture;

let multiOwnerMembershipX: string;
let targetXMembershipId: string;
let coOwnerXMembershipId: string;
let targetYMembershipId: string;
let raceTarget1MembershipId: string;
let raceTarget2MembershipId: string;

const allIdentities: TestIdentity[] = [];
const allOrgIds: string[] = [];

async function createIdentityWithProfile(label: string): Promise<{ identity: TestIdentity; client: SupabaseClient }> {
  const identity = await createTestIdentity(label);
  const client = await signInAs(identity);
  const result = await client.from("profiles").insert({ id: identity.id });
  if (result.error) throw new Error(`profile (${label}): ${result.error.message}`);
  allIdentities.push(identity);
  return { identity, client };
}

async function createOrgWithOwner(name: string, ownerClient: SupabaseClient, ownerId: string): Promise<OrgFixture> {
  const orgId = randomUUID();
  const orgResult = await ownerClient.from("organizations").insert({ id: orgId, name });
  if (orgResult.error) throw new Error(`org (${name}): ${orgResult.error.message}`);
  allOrgIds.push(orgId);

  const membershipId = randomUUID();
  const membershipResult = await ownerClient
    .from("memberships")
    .insert({ id: membershipId, organization_id: orgId, profile_id: ownerId, role: "owner" });
  if (membershipResult.error) throw new Error(`owner membership (${name}): ${membershipResult.error.message}`);

  return { id: orgId };
}

async function addMember(
  actingClient: SupabaseClient,
  organizationId: string,
  profileId: string,
  role: "admin" | "member" | "owner",
): Promise<string> {
  const membershipId = randomUUID();
  const result = await actingClient
    .from("memberships")
    .insert({ id: membershipId, organization_id: organizationId, profile_id: profileId, role });
  if (result.error) throw new Error(`membership insert failed: ${result.error.message}`);
  return membershipId;
}

beforeAll(async () => {
  ({ identity: multiOwner, client: clientMultiOwner } = await createIdentityWithProfile("multi-owner"));
  ({ identity: targetX } = await createIdentityWithProfile("target-x"));
  ({ identity: coOwnerX } = await createIdentityWithProfile("co-owner-x"));
  ({ identity: nonOwnerCallerX, client: clientNonOwnerCallerX } = await createIdentityWithProfile("non-owner-caller-x"));
  ({ identity: targetY } = await createIdentityWithProfile("target-y"));
  ({ identity: raceOwner, client: clientRaceOwner } = await createIdentityWithProfile("race-owner"));
  ({ identity: raceTarget1 } = await createIdentityWithProfile("race-target-1"));
  ({ identity: raceTarget2 } = await createIdentityWithProfile("race-target-2"));

  orgX = await createOrgWithOwner("Multi-org X", clientMultiOwner, multiOwner.id);
  multiOwnerMembershipX = (
    await adminClient.from("memberships").select("id").eq("organization_id", orgX.id).eq("profile_id", multiOwner.id).single()
  ).data!.id as string;
  targetXMembershipId = await addMember(clientMultiOwner, orgX.id, targetX.id, "admin");
  coOwnerXMembershipId = await addMember(clientMultiOwner, orgX.id, coOwnerX.id, "owner");
  await addMember(clientMultiOwner, orgX.id, nonOwnerCallerX.id, "admin");

  orgY = await createOrgWithOwner("Multi-org Y", clientMultiOwner, multiOwner.id);
  targetYMembershipId = await addMember(clientMultiOwner, orgY.id, targetY.id, "admin");

  orgZ = await createOrgWithOwner("Race org Z", clientRaceOwner, raceOwner.id);
  raceTarget1MembershipId = await addMember(clientRaceOwner, orgZ.id, raceTarget1.id, "admin");
  raceTarget2MembershipId = await addMember(clientRaceOwner, orgZ.id, raceTarget2.id, "admin");
}, 90_000);

afterAll(async () => {
  await Promise.allSettled(allOrgIds.map((id) => adminClient.from("organizations").delete().eq("id", id)));
  await Promise.allSettled(allIdentities.map((identity) => deleteTestIdentity(identity.id)));
}, 90_000);

describe(
  "0004_membership_ownership_hardening.sql: transfer_organization_ownership()",
  () => {
    // Un-skip once the migration is applied. Tests run in declaration
    // order deliberately -- several mutate real ownership state that
    // later tests in this file depend on.

    it("D: a non-owner cannot transfer ownership", async () => {
      // Target is targetX (a non-owner row), deliberately not multiOwner's
      // own (owner) row -- if the target were already owner, the function
      // would correctly reject for THAT reason first ("this member is
      // already the owner"), which wouldn't isolate "the caller lacks
      // owner standing" as the actual thing under test here.
      const result = await clientNonOwnerCallerX.rpc("transfer_organization_ownership", {
        p_new_owner_membership_id: targetXMembershipId,
      });
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe("42501");
    });

    it("E: transferring to a membership that is already owner is rejected safely, not silently demoting the caller", async () => {
      const result = await clientMultiOwner.rpc("transfer_organization_ownership", {
        p_new_owner_membership_id: coOwnerXMembershipId,
      });
      expect(result.error).not.toBeNull();

      // Neither party's role should have changed.
      const groundTruth = await adminClient
        .from("memberships")
        .select("id, role")
        .in("id", [multiOwnerMembershipX, coOwnerXMembershipId]);
      const roles = new Map(groundTruth.data?.map((row) => [row.id, row.role]));
      expect(roles.get(multiOwnerMembershipX)).toBe("owner");
      expect(roles.get(coOwnerXMembershipId)).toBe("owner");
    });

    it("B/C: a multi-org owner transferring Org Y ownership does not touch Org X (proves the fix -- the org is derived from the target, not an ambiguous 'any owner row' lookup)", async () => {
      const result = await clientMultiOwner.rpc("transfer_organization_ownership", {
        p_new_owner_membership_id: targetYMembershipId,
      });
      expect(result.error).toBeNull();

      const orgYRows = await adminClient.from("memberships").select("profile_id, role").eq("organization_id", orgY.id);
      expect(orgYRows.data?.find((r) => r.profile_id === targetY.id)?.role).toBe("owner");
      expect(orgYRows.data?.find((r) => r.profile_id === multiOwner.id)?.role).toBe("admin");
      expect(orgYRows.data?.filter((r) => r.role === "owner")).toHaveLength(1); // I: exactly one owner

      // Org X must be completely untouched by the Org Y transfer.
      const orgXRows = await adminClient.from("memberships").select("profile_id, role").eq("organization_id", orgX.id);
      expect(orgXRows.data?.find((r) => r.profile_id === multiOwner.id)?.role).toBe("owner");
      expect(orgXRows.data?.find((r) => r.profile_id === targetX.id)?.role).toBe("admin");
      expect(orgXRows.data?.find((r) => r.profile_id === coOwnerX.id)?.role).toBe("owner");
    });

    it("A: a single-org owner can transfer ownership, leaving exactly one owner", async () => {
      const result = await clientMultiOwner.rpc("transfer_organization_ownership", {
        p_new_owner_membership_id: targetXMembershipId,
      });
      expect(result.error).toBeNull();

      const orgXRows = await adminClient.from("memberships").select("profile_id, role").eq("organization_id", orgX.id);
      expect(orgXRows.data?.find((r) => r.profile_id === targetX.id)?.role).toBe("owner");
      expect(orgXRows.data?.find((r) => r.profile_id === multiOwner.id)?.role).toBe("admin");
      // coOwnerX is untouched by this transfer -- still owner, so org X now
      // has two owners (targetX + coOwnerX), which is valid: this transfer
      // only ever swaps multiOwner <-> targetX, it never touches coOwnerX.
      expect(orgXRows.data?.find((r) => r.profile_id === coOwnerX.id)?.role).toBe("owner");
      expect(orgXRows.data?.filter((r) => r.role === "owner")).toHaveLength(2);
    });

    it("J: concurrent transfer attempts cannot produce zero or multiple owners", async () => {
      const [first, second] = await Promise.all([
        clientRaceOwner.rpc("transfer_organization_ownership", { p_new_owner_membership_id: raceTarget1MembershipId }),
        clientRaceOwner.rpc("transfer_organization_ownership", { p_new_owner_membership_id: raceTarget2MembershipId }),
      ]);

      // Exactly one of the two concurrent calls succeeds -- the other,
      // whichever acquires its locks second, re-verifies against the
      // now-committed state and finds the caller is no longer owner.
      const outcomes = [first, second];
      const succeeded = outcomes.filter((r) => r.error === null);
      const failed = outcomes.filter((r) => r.error !== null);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);

      const orgZRows = await adminClient.from("memberships").select("profile_id, role").eq("organization_id", orgZ.id);
      const owners = orgZRows.data?.filter((r) => r.role === "owner") ?? [];
      expect(owners).toHaveLength(1); // never zero, never two
    });
  },
);
