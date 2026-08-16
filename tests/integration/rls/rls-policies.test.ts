import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, isDenied } from "./helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "./fixtures";

// Real runtime RLS verification: every assertion in this file goes through
// genuine Supabase Auth sessions (real JWTs from real signed-in test users)
// or a real unauthenticated anon-key client, via the normal PostgREST API
// path -- never the postgres MCP/superuser connection, never simulated
// request.jwt.claims.

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  await teardownFixtures(fx);
}, 60_000);

describe("positive RLS access (real authenticated sessions)", () => {
  it("Org A member can read permitted Org A data", async () => {
    const org = await fx.clientOwnerA.from("organizations").select("id").eq("id", fx.orgA.id).maybeSingle();
    expect(org.error).toBeNull();
    expect(org.data?.id).toBe(fx.orgA.id);

    const submissions = await fx.clientOwnerA.from("submissions").select("id").eq("organization_id", fx.orgA.id);
    expect(submissions.error).toBeNull();
    expect(submissions.data?.map((r) => r.id)).toContain(fx.submissionA);
  });

  it("Org B member can read permitted Org B data", async () => {
    const org = await fx.clientOwnerB.from("organizations").select("id").eq("id", fx.orgB.id).maybeSingle();
    expect(org.error).toBeNull();
    expect(org.data?.id).toBe(fx.orgB.id);
  });

  it("Org A customer can access permitted customer-scoped Org A data", async () => {
    const categories = await fx.clientCustomerA.from("categories").select("id").eq("organization_id", fx.orgA.id);
    expect(categories.error).toBeNull();
    expect(categories.data?.map((r) => r.id)).toContain(fx.categoryA);

    const ownRow = await fx.clientCustomerA
      .from("customers")
      .select("id")
      .eq("organization_id", fx.orgA.id)
      .eq("profile_id", fx.customerA.id)
      .maybeSingle();
    expect(ownRow.error).toBeNull();
    expect(ownRow.data).not.toBeNull();
  });

  it("an unrelated customer can read Org A's public portal data purely via is_public", async () => {
    // customerB belongs to Org B, not Org A -- this proves public-portal access
    // is governed by is_public, not by any relationship to the org.
    const portal = await fx.clientCustomerB
      .from("portal_settings")
      .select("slug, is_public")
      .eq("organization_id", fx.orgA.id)
      .maybeSingle();
    expect(portal.error).toBeNull();
    expect(portal.data?.is_public).toBe(true);
  });

  it("an authenticated user can create their permitted submission", async () => {
    const id = randomUUID();
    const result = await fx.clientCustomerA
      .from("submissions")
      .insert({
        id,
        organization_id: fx.orgA.id,
        category_id: fx.categoryA,
        status_id: fx.statusA,
        submitted_by: fx.customerA.id,
        title: "Customer-created submission",
        type: "bug",
      })
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data?.[0]?.id).toBe(id);
  });

  it("an authenticated user can create and then remove their own vote", async () => {
    const create = await fx.clientCustomerA
      .from("votes")
      .insert({ id: randomUUID(), submission_id: fx.submissionA, user_id: fx.customerA.id })
      .select("id");
    expect(create.error).toBeNull();
    expect(create.data?.length).toBe(1);

    const remove = await fx.clientCustomerA
      .from("votes")
      .delete()
      .eq("submission_id", fx.submissionA)
      .eq("user_id", fx.customerA.id)
      .select("id");
    expect(remove.error).toBeNull();
    expect(remove.data?.length).toBe(1);

    const verify = await adminClient
      .from("votes")
      .select("id")
      .eq("submission_id", fx.submissionA)
      .eq("user_id", fx.customerA.id);
    expect(verify.data?.length).toBe(0);
  });

  it("authorized org members can read internal comments", async () => {
    const comments = await fx.clientOwnerA.from("comments").select("id, is_internal").eq("submission_id", fx.submissionA);
    expect(comments.error).toBeNull();
    const ids = comments.data?.map((c) => c.id) ?? [];
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).toContain(fx.internalCommentA);
  });
});

describe("negative tenant isolation (real authenticated sessions)", () => {
  it("Org A member cannot read Org B private data", async () => {
    const org = await fx.clientOwnerA.from("organizations").select("id").eq("id", fx.orgB.id);
    expect(isDenied(org)).toBe(true);

    const memberships = await fx.clientOwnerA.from("memberships").select("id").eq("organization_id", fx.orgB.id);
    expect(isDenied(memberships)).toBe(true);

    const customers = await fx.clientOwnerA.from("customers").select("id").eq("organization_id", fx.orgB.id);
    expect(isDenied(customers)).toBe(true);
  });

  it("Org A member cannot modify Org B data", async () => {
    const update = await fx.clientOwnerA
      .from("organizations")
      .update({ name: "hijacked by org A" })
      .eq("id", fx.orgB.id)
      .select("id");
    expect(update.error).toBeNull(); // RLS denial here is zero affected rows, not an error.
    expect(update.data?.length).toBe(0);

    const unchanged = await adminClient.from("organizations").select("name").eq("id", fx.orgB.id).single();
    expect(unchanged.data?.name).toBe("RLS Test Organization B");
  });

  it("Org A customer cannot access Org B customer data", async () => {
    const result = await fx.clientCustomerA.from("customers").select("id").eq("organization_id", fx.orgB.id);
    expect(isDenied(result)).toBe(true);
  });

  it("Org B customer cannot access Org A private data", async () => {
    const memberships = await fx.clientCustomerB.from("memberships").select("id").eq("organization_id", fx.orgA.id);
    expect(isDenied(memberships)).toBe(true);

    const invitations = await fx.clientCustomerB.from("invitations").select("id").eq("organization_id", fx.orgA.id);
    expect(isDenied(invitations)).toBe(true);

    const audit = await fx.clientCustomerB.from("audit_events").select("id").eq("organization_id", fx.orgA.id);
    expect(isDenied(audit)).toBe(true);
  });

  it("client-provided organization_id cannot bypass tenant isolation", async () => {
    // ownerB has no relationship to Org A; has_organization_access(orgA) is false
    // for them regardless of what organization_id they claim on the row.
    const result = await fx.clientOwnerB.from("submissions").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      category_id: fx.categoryA,
      status_id: fx.statusA,
      submitted_by: fx.ownerB.id,
      title: "cross-tenant bypass attempt",
      type: "bug",
    });
    expect(isDenied(result)).toBe(true);
  });

  it("a user cannot modify another organization's submissions", async () => {
    const update = await fx.clientOwnerB
      .from("submissions")
      .update({ title: "hijacked" })
      .eq("id", fx.submissionA)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data?.length).toBe(0);
  });

  it("a user cannot modify another organization's categories", async () => {
    const update = await fx.clientOwnerB
      .from("categories")
      .update({ name: "hijacked" })
      .eq("id", fx.categoryA)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data?.length).toBe(0);
  });

  it("a user cannot modify another organization's statuses", async () => {
    const update = await fx.clientOwnerB
      .from("statuses")
      .update({ name: "hijacked" })
      .eq("id", fx.statusA)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data?.length).toBe(0);
  });
});

describe("anonymous portal access (real unauthenticated client)", () => {
  it("anon can read Org A's public portal data", async () => {
    const anon = anonClient();

    const portal = await anon.from("portal_settings").select("slug").eq("organization_id", fx.orgA.id).maybeSingle();
    expect(portal.error).toBeNull();
    expect(portal.data?.slug).toBe(fx.orgA.slug);

    const categories = await anon.from("categories").select("id").eq("organization_id", fx.orgA.id);
    expect(categories.data?.map((r) => r.id)).toContain(fx.categoryA);

    const statuses = await anon.from("statuses").select("id").eq("organization_id", fx.orgA.id);
    expect(statuses.data?.map((r) => r.id)).toContain(fx.statusA);

    const submissions = await anon.from("submissions").select("id").eq("organization_id", fx.orgA.id);
    expect(submissions.data?.map((r) => r.id)).toContain(fx.submissionA);

    const comments = await anon.from("comments").select("id").eq("submission_id", fx.submissionA).eq("is_internal", false);
    expect(comments.data?.map((r) => r.id)).toContain(fx.publicCommentA);
  });

  it("anon cannot read Org B's private portal/org data (is_public = false)", async () => {
    const anon = anonClient();

    const portal = await anon.from("portal_settings").select("id").eq("organization_id", fx.orgB.id);
    expect(isDenied(portal)).toBe(true);

    const submissions = await anon.from("submissions").select("id").eq("organization_id", fx.orgB.id);
    expect(isDenied(submissions)).toBe(true);
  });

  it("anon cannot read Org A's organizations row, even though its portal is public", async () => {
    const anon = anonClient();
    const result = await anon.from("organizations").select("id").eq("id", fx.orgA.id);
    expect(isDenied(result)).toBe(true);
  });

  // Values are resolved lazily via a getter so this table doesn't need `fx`
  // (populated by beforeAll) at test-collection time, only at run time.
  it.each([
    ["profiles", "id", (f: RlsFixtures) => f.ownerA.id],
    ["memberships", "organization_id", (f: RlsFixtures) => f.orgA.id],
    ["invitations", "organization_id", (f: RlsFixtures) => f.orgA.id],
    ["customers", "organization_id", (f: RlsFixtures) => f.orgA.id],
    ["notifications", "organization_id", (f: RlsFixtures) => f.orgA.id],
    ["audit_events", "organization_id", (f: RlsFixtures) => f.orgA.id],
  ] as const)("anon cannot access %s", async (table, column, getValue) => {
    const anon = anonClient();
    const result = await anon.from(table).select("id").eq(column, getValue(fx));
    expect(isDenied(result)).toBe(true);
  });
});

describe("internal comments isolation", () => {
  it("anon can read the public comment but not the internal comment on a public submission", async () => {
    const anon = anonClient();
    const result = await anon.from("comments").select("id").eq("submission_id", fx.submissionA);
    const ids = result.data?.map((c) => c.id) ?? [];
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).not.toContain(fx.internalCommentA);
  });

  it("a customer can read the public comment but not the internal comment", async () => {
    const result = await fx.clientCustomerA.from("comments").select("id").eq("submission_id", fx.submissionA);
    const ids = result.data?.map((c) => c.id) ?? [];
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).not.toContain(fx.internalCommentA);
  });

  it("an unrelated org's customer gets the same public/internal boundary as anon on a public submission", async () => {
    // submissionA belongs to Org A, whose portal is_public = true, so its
    // non-internal comment is visible to anyone (see is_portal_public in
    // comments_select_scoped) -- being a customer of a *different* org does
    // not grant extra access to the internal comment.
    const result = await fx.clientCustomerB.from("comments").select("id").eq("submission_id", fx.submissionA);
    const ids = result.data?.map((c) => c.id) ?? [];
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).not.toContain(fx.internalCommentA);
  });

  it("an unrelated org's customer cannot read comments on a private (non-public) submission at all", async () => {
    // submissionB belongs to Org B, whose portal is_public = false, and
    // customerA has no relationship to Org B -- the submission itself is
    // invisible, so no comment row is reachable regardless of is_internal.
    const result = await fx.clientCustomerA.from("comments").select("id").eq("submission_id", fx.submissionB);
    expect(isDenied(result)).toBe(true);
  });

  it("an authorized org member can read both public and internal comments", async () => {
    const result = await fx.clientOwnerA.from("comments").select("id").eq("submission_id", fx.submissionA);
    const ids = result.data?.map((c) => c.id) ?? [];
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).toContain(fx.internalCommentA);
  });
});

describe("vote security", () => {
  it("rejects a duplicate vote from the same user on the same submission", async () => {
    const voteId = randomUUID();
    const first = await fx.clientCustomerA
      .from("votes")
      .insert({ id: voteId, submission_id: fx.submissionA, user_id: fx.customerA.id });
    expect(first.error).toBeNull();

    const duplicate = await fx.clientCustomerA
      .from("votes")
      .insert({ id: randomUUID(), submission_id: fx.submissionA, user_id: fx.customerA.id });
    expect(duplicate.error).not.toBeNull();
    expect(duplicate.error?.code).toBe("23505");

    // cleanup this test's own vote so later tests start clean
    await adminClient.from("votes").delete().eq("id", voteId);
  });

  it("rejects an unrelated user manipulating (deleting) another user's vote", async () => {
    const voteId = randomUUID();
    const create = await fx.clientCustomerA
      .from("votes")
      .insert({ id: voteId, submission_id: fx.submissionA, user_id: fx.customerA.id });
    expect(create.error).toBeNull();

    // ownerB has no relationship to Org A's submission -- not self, not org admin of it.
    const hijack = await fx.clientOwnerB.from("votes").delete().eq("id", voteId).select("id");
    expect(hijack.error).toBeNull();
    expect(hijack.data?.length).toBe(0);

    const stillThere = await adminClient.from("votes").select("id").eq("id", voteId).maybeSingle();
    expect(stillThere.data?.id).toBe(voteId);

    await adminClient.from("votes").delete().eq("id", voteId);
  });

  it("rejects any UPDATE on a vote, even by its own owner -- votes are cast/retracted, never edited", async () => {
    const voteId = randomUUID();
    await fx.clientCustomerA.from("votes").insert({ id: voteId, submission_id: fx.submissionA, user_id: fx.customerA.id });

    const update = await fx.clientCustomerA
      .from("votes")
      .update({ created_at: new Date().toISOString() })
      .eq("id", voteId)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data?.length).toBe(0); // no UPDATE policy exists for votes, for anyone

    await adminClient.from("votes").delete().eq("id", voteId);
  });
});

describe("cross-org composite FK, exercised through the real API (not just raw SQL)", () => {
  it("rejects an Org A submission referencing Org B's category", async () => {
    const result = await fx.clientOwnerA.from("submissions").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      category_id: fx.categoryB,
      status_id: fx.statusA,
      submitted_by: fx.ownerA.id,
      title: "cross-org category via API",
      type: "bug",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("23503");
  });

  it("rejects an Org A submission referencing Org B's status", async () => {
    const result = await fx.clientOwnerA.from("submissions").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      category_id: fx.categoryA,
      status_id: fx.statusB,
      submitted_by: fx.ownerA.id,
      title: "cross-org status via API",
      type: "bug",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("23503");
  });
});
