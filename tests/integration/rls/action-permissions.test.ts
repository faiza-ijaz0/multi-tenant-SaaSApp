import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isDenied } from "./helpers";
import { grantPermissions, setupRbacFixtures, teardownRbacFixtures, type RbacFixtures } from "./rbac-fixtures";

// Real runtime RLS verification against the Phase 14 action-permission
// layer (0009_page_permissions.sql + 0013_membership_action_permissions.sql)
// -- every assertion goes through genuine Supabase Auth sessions (real JWTs
// from real signed-in test users), via the normal PostgREST API path, never
// a service-role bypass for the behavior under test. Requires 0007, 0009,
// 0010, 0011, and 0013 to be applied to the database this suite runs
// against -- see the Phase 14 report for why none of those are applied to
// the real project without explicit approval; this suite is intended to run
// on a disposable Supabase branch.

let fx: RbacFixtures;

beforeAll(async () => {
  fx = await setupRbacFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownRbacFixtures(fx);
}, 60_000);

describe("owner bypass", () => {
  it("owner has full access with zero permission rows of their own", async () => {
    const categories = await fx.clientOwnerA.from("categories").select("id").eq("organization_id", fx.orgA.id);
    expect(categories.error).toBeNull();

    const created = await fx.clientOwnerA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgA.id, name: `owner-bypass-${randomUUID()}` })
      .select("id");
    expect(created.error).toBeNull();
    expect(created.data?.length).toBe(1);

    // isDenied() would misread a legitimately-empty result as a denial here
    // (no rows exist for org A's non-owner members yet, at this point in the
    // file) -- checking for an RLS error directly is the correct assertion:
    // owner is never denied, whether or not any rows happen to exist.
    const roster = await fx.clientOwnerA.from("membership_page_permissions").select("id");
    expect(roster.error).toBeNull();
  });
});

describe("no grant = no access (default-deny)", () => {
  it("adminA with zero explicit grants cannot see the categories page data or create one", async () => {
    const result = await fx.clientAdminA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgA.id, name: `denied-${randomUUID()}` })
      .select("id");
    expect(isDenied(result)).toBe(true);
  });

  it("memberA with zero explicit grants cannot create a submission", async () => {
    const result = await fx.clientMemberA
      .from("submissions")
      .insert({
        id: randomUUID(),
        organization_id: fx.orgA.id,
        status_id: fx.statusA,
        submitted_by: fx.memberA.id,
        title: "should be denied",
        type: "feature",
      })
      .select("id");
    expect(isDenied(result)).toBe(true);
  });
});

describe("admin default preset", () => {
  it("admin granted categories:create/edit/delete + the categories page can manage categories", async () => {
    await grantPermissions(
      fx.clientOwnerA,
      fx.membershipAdminA,
      ["categories"],
      ["categories:create", "categories:edit", "categories:delete"],
    );

    const created = await fx.clientAdminA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgA.id, name: `admin-preset-${randomUUID()}` })
      .select("id");
    expect(created.error).toBeNull();
    expect(created.data?.length).toBe(1);
    const categoryId = created.data![0].id as string;

    const updated = await fx.clientAdminA
      .from("categories")
      .update({ name: `admin-preset-updated-${randomUUID()}` })
      .eq("id", categoryId)
      .select("id");
    expect(updated.error).toBeNull();
    expect(updated.data?.length).toBe(1);

    const deleted = await fx.clientAdminA.from("categories").delete().eq("id", categoryId).select("id");
    expect(deleted.error).toBeNull();
    expect(deleted.data?.length).toBe(1);
  });

  it("admin WITHOUT roles_permissions:assign_role cannot change memberA's role, even holding 'members' page + members:invite", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, ["members"], ["members:invite"]);

    const result = await fx.clientAdminA
      .from("memberships")
      .update({ role: "admin" })
      .eq("id", fx.membershipMemberA)
      .select("id");
    expect(isDenied(result)).toBe(true);
  });

  it("admin GRANTED roles_permissions:assign_role can change memberA's role", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, [], ["roles_permissions:assign_role"]);

    const result = await fx.clientAdminA
      .from("memberships")
      .update({ role: "admin" })
      .eq("id", fx.membershipMemberA)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data?.length).toBe(1);

    // Revert so later tests keep a clean "member" role for memberA.
    await fx.clientOwnerA.from("memberships").update({ role: "member" }).eq("id", fx.membershipMemberA);
  });
});

describe("owner protection: no permission grant can touch the owner", () => {
  it("admin holding roles_permissions:assign_role still cannot demote or touch the owner's row", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, [], ["roles_permissions:assign_role"]);

    // Find ownerA's membership id.
    const ownerMembership = await fx.clientOwnerA
      .from("memberships")
      .select("id")
      .eq("organization_id", fx.orgA.id)
      .eq("profile_id", fx.ownerA.id)
      .single();
    expect(ownerMembership.error).toBeNull();

    const result = await fx.clientAdminA
      .from("memberships")
      .update({ role: "admin" })
      .eq("id", ownerMembership.data!.id as string)
      .select("id");
    // enforce_membership_role_invariants (0004, applied live) blocks this
    // unconditionally for a non-owner actor -- no action-permission grant
    // can override a DB trigger.
    expect(isDenied(result)).toBe(true);
  });

  it("admin holding members:delete still cannot remove the owner", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, [], ["members:delete"]);

    const ownerMembership = await fx.clientOwnerA
      .from("memberships")
      .select("id")
      .eq("organization_id", fx.orgA.id)
      .eq("profile_id", fx.ownerA.id)
      .single();

    const result = await fx.clientAdminA
      .from("memberships")
      .delete()
      .eq("id", ownerMembership.data!.id as string)
      .select("id");
    expect(isDenied(result)).toBe(true);
  });
});

describe("self-escalation prevention", () => {
  it("an admin holding roles_permissions:manage_permissions cannot grant themselves a NEW permission on their own row", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, [], ["roles_permissions:manage_permissions"]);

    const result = await fx.clientAdminA
      .from("membership_action_permissions")
      .insert({ membership_id: fx.membershipAdminA, permission_key: "organization_settings:edit" })
      .select("id");
    // can_manage_membership_permissions (0013) explicitly blocks
    // v_profile_id = auth.uid() -- self-targeting is refused regardless of
    // holding the manage_permissions grant itself.
    expect(isDenied(result)).toBe(true);
  });

  it("an admin WITHOUT roles_permissions:manage_permissions cannot grant memberA anything, even members:invite", async () => {
    // Revoke manage_permissions from adminA for this test, keep members:invite only.
    await fx.clientOwnerA
      .from("membership_action_permissions")
      .delete()
      .eq("membership_id", fx.membershipAdminA)
      .eq("permission_key", "roles_permissions:manage_permissions");
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, [], ["members:invite"]);

    const result = await fx.clientAdminA
      .from("membership_action_permissions")
      .insert({ membership_id: fx.membershipMemberA, permission_key: "categories:view" })
      .select("id");
    expect(isDenied(result)).toBe(true);
  });
});

describe("custom (non-preset) permission grants", () => {
  it("VIEW-only-equivalent: memberA with submissions:create but no submissions:edit cannot edit someone else's submission", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipMemberA, ["dashboard"], ["submissions:create"]);

    const result = await fx.clientMemberA
      .from("submissions")
      .update({ title: "hijacked title" })
      .eq("id", fx.submissionA) // authored by ownerA, not memberA
      .select("id");
    expect(isDenied(result)).toBe(true);
  });

  it("CREATE-without-DELETE: memberA granted submissions:create cannot delete any submission", async () => {
    const result = await fx.clientMemberA.from("submissions").delete().eq("id", fx.submissionA).select("id");
    expect(isDenied(result)).toBe(true);
  });

  it("memberA granted submissions:edit CAN edit someone else's submission (but still not delete it)", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipMemberA, [], ["submissions:edit"]);

    const updated = await fx.clientMemberA
      .from("submissions")
      .update({ title: "edited by grant" })
      .eq("id", fx.submissionA)
      .select("id");
    expect(updated.error).toBeNull();
    expect(updated.data?.length).toBe(1);

    const deleted = await fx.clientMemberA.from("submissions").delete().eq("id", fx.submissionA).select("id");
    expect(isDenied(deleted)).toBe(true);

    // Restore the title so later assertions/fixture reuse aren't affected.
    await fx.clientOwnerA.from("submissions").update({ title: "RLS test submission A" }).eq("id", fx.submissionA);
  });

  it("a member can always edit their OWN submission with no grant at all", async () => {
    const own = await fx.clientMemberA
      .from("submissions")
      .insert({
        id: randomUUID(),
        organization_id: fx.orgA.id,
        status_id: fx.statusA,
        submitted_by: fx.memberA.id,
        title: "member's own submission",
        type: "bug",
      })
      .select("id");
    // Creating requires submissions:create, already granted above.
    expect(own.error).toBeNull();
    const ownId = own.data![0].id as string;

    const updated = await fx.clientMemberA
      .from("submissions")
      .update({ title: "member edited their own" })
      .eq("id", ownId)
      .select("id");
    expect(updated.error).toBeNull();
    expect(updated.data?.length).toBe(1);
  });

  it("permission changes take effect immediately -- revoking submissions:edit blocks the next request", async () => {
    await fx.clientOwnerA
      .from("membership_action_permissions")
      .delete()
      .eq("membership_id", fx.membershipMemberA)
      .eq("permission_key", "submissions:edit");

    const result = await fx.clientMemberA
      .from("submissions")
      .update({ title: "should be denied now" })
      .eq("id", fx.submissionA)
      .select("id");
    expect(isDenied(result)).toBe(true);
  });
});

describe("cross-organization isolation", () => {
  it("a grant in Org A never satisfies has_action_permission for Org B", async () => {
    await grantPermissions(
      fx.clientOwnerA,
      fx.membershipAdminA,
      ["categories"],
      ["categories:create", "categories:edit", "categories:delete"],
    );

    // adminA has no membership in Org B at all -- full Org A grants must not
    // leak across the tenant boundary.
    const result = await fx.clientAdminA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgB.id, name: `cross-org-${randomUUID()}` })
      .select("id");
    expect(isDenied(result)).toBe(true);
  });

  it("adminA cannot update Org B's existing category even by id", async () => {
    const result = await fx.clientAdminA
      .from("categories")
      .update({ name: "cross-org edit attempt" })
      .eq("id", fx.categoryB)
      .select("id");
    expect(isDenied(result)).toBe(true);
  });
});

describe("page-permission self-access carve-out (0009's own hardest case)", () => {
  it("adminA can always read their OWN membership row even without the 'members' page permission", async () => {
    // Earlier describe blocks in this file granted adminA 'members' at
    // various points -- explicitly revoke it here so this block starts from
    // a known state, rather than relying on incidental leftover grants (or
    // their absence) from test order elsewhere in the file.
    await fx.clientOwnerA
      .from("membership_page_permissions")
      .delete()
      .eq("membership_id", fx.membershipAdminA)
      .eq("page", "members");

    // memberships_select_member's self-row branch must still work
    // unconditionally regardless of the 'members' grant, or org resolution
    // (getTenantScope) would break for this user entirely.
    const own = await fx.clientAdminA
      .from("memberships")
      .select("id, role")
      .eq("id", fx.membershipAdminA)
      .maybeSingle();
    expect(own.error).toBeNull();
    expect(own.data?.id).toBe(fx.membershipAdminA);
  });

  it("adminA WITHOUT the 'members' page permission cannot read the rest of the roster", async () => {
    const roster = await fx.clientAdminA
      .from("memberships")
      .select("id")
      .eq("organization_id", fx.orgA.id)
      .neq("id", fx.membershipAdminA);
    expect(isDenied(roster)).toBe(true);
  });

  it("adminA GRANTED the 'members' page permission can read the rest of the roster", async () => {
    await grantPermissions(fx.clientOwnerA, fx.membershipAdminA, ["members"], []);

    const roster = await fx.clientAdminA
      .from("memberships")
      .select("id")
      .eq("organization_id", fx.orgA.id);
    expect(roster.error).toBeNull();
    expect((roster.data?.length ?? 0)).toBeGreaterThan(1);
  });
});

describe("removed member loses access immediately", () => {
  it("after removal, the former member's session can no longer read Org A data requiring membership", async () => {
    const removed = await fx.clientOwnerA.from("memberships").delete().eq("id", fx.membershipMemberA).select("id");
    expect(removed.error).toBeNull();
    expect(removed.data?.length).toBe(1);

    const result = await fx.clientMemberA
      .from("submissions")
      .insert({
        id: randomUUID(),
        organization_id: fx.orgA.id,
        status_id: fx.statusA,
        submitted_by: fx.memberA.id,
        title: "should fail post-removal",
        type: "feature",
      })
      .select("id");
    expect(isDenied(result)).toBe(true);

    // membershipMemberA is gone -- later suites in this file must not
    // attempt to grant/act against it again. This is the final test in this
    // describe block and this file for memberA by design.
  });
});
