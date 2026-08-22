import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listCategories } from "@/features/categories/queries";
import { listComments } from "@/features/comments/queries";
import { ensureCustomerOfOrganization } from "@/features/customers/ensure-customer";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { getDefaultStatusId, listSubmissions } from "@/features/submissions/queries";
import { listStatuses } from "@/features/statuses/queries";
import { getVotedSubmissionIds, hasVoted } from "@/features/votes/queries";

import { adminClient, anonClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Real runtime verification of Phase 5's tenant-scoped query/mutation
// helpers, reusing the exact fixtures Phase 1A already established (two
// orgs, owner/customer identities, categories/statuses/submissions/comments
// already seeded) -- see tests/integration/rls/fixtures.ts. Every
// assertion goes through genuine Supabase Auth sessions or a real
// unauthenticated anon client; the service-role client is used only for
// ground-truth verification and cleanup, per the Phase 1A convention.

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("categories", () => {
  it("lists only the caller's own organization's categories", async () => {
    const categories = await listCategories(fx.clientOwnerA, fx.orgA.id);
    const ids = categories.map((c) => c.id);
    expect(ids).toContain(fx.categoryA);
    expect(ids).not.toContain(fx.categoryB);
  });

  it("rejects a customer (non-admin) creating a category", async () => {
    const result = await fx.clientCustomerA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgA.id, name: "Should not be allowed" });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });

  it("rejects a duplicate category name within the same organization", async () => {
    // fx.categoryA is named "General" (tests/integration/rls/fixtures.ts).
    const result = await fx.clientOwnerA
      .from("categories")
      .insert({ id: randomUUID(), organization_id: fx.orgA.id, name: "General" });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("23505");
  });
});

describe("statuses", () => {
  it("lists only the caller's own organization's statuses", async () => {
    const statuses = await listStatuses(fx.clientOwnerA, fx.orgA.id);
    const ids = statuses.map((s) => s.id);
    expect(ids).toContain(fx.statusA);
    expect(ids).not.toContain(fx.statusB);
  });

  it("rejects deleting a status still referenced by a submission (ON DELETE RESTRICT)", async () => {
    const result = await fx.clientOwnerA.from("statuses").delete().eq("id", fx.statusA);
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("23503");
  });
});

describe("portal settings", () => {
  it("resolves a public portal by slug for an authenticated user unrelated to that org", async () => {
    const portal = await getPortalBySlug(fx.clientCustomerB, fx.orgA.slug);
    expect(portal?.organizationId).toBe(fx.orgA.id);
  });

  it("resolves a public portal by slug for a real anonymous client", async () => {
    const portal = await getPortalBySlug(anonClient(), fx.orgA.slug);
    expect(portal?.organizationId).toBe(fx.orgA.id);
  });

  it("returns nothing for a private portal to an unrelated authenticated user (anti-enumeration)", async () => {
    const portal = await getPortalBySlug(fx.clientCustomerA, fx.orgB.slug);
    expect(portal).toBeNull();
  });

  it("returns nothing for a private portal to an anonymous client", async () => {
    const portal = await getPortalBySlug(anonClient(), fx.orgB.slug);
    expect(portal).toBeNull();
  });
});

describe("submissions", () => {
  it("lists only the caller's own organization's submissions", async () => {
    const submissions = await listSubmissions(fx.clientOwnerA, fx.orgA.id);
    const ids = submissions.map((s) => s.id);
    expect(ids).toContain(fx.submissionA);
    expect(ids).not.toContain(fx.submissionB);
  });

  it("computes vote counts via the embedded votes(count) aggregate, not a denormalized column", async () => {
    const submissions = await listSubmissions(fx.clientOwnerA, fx.orgA.id);
    const submissionA = submissions.find((s) => s.id === fx.submissionA);
    expect(submissionA?.voteCount).toBe(0);
  });

  it("resolves the first open status as the default for new submissions", async () => {
    const statusId = await getDefaultStatusId(fx.clientOwnerA, fx.orgA.id);
    expect(statusId).toBe(fx.statusA);
  });

  it("lets an authenticated visitor self-register as a customer and create a submission, mirroring createPublicSubmission's real code path", async () => {
    // customerB currently belongs only to Org B -- self-registers for Org A here.
    await ensureCustomerOfOrganization(fx.clientCustomerB, fx.customerB.id, fx.orgA.id, fx.customerB.email);

    const statusId = await getDefaultStatusId(fx.clientCustomerB, fx.orgA.id);
    const submissionId = randomUUID();
    const result = await fx.clientCustomerB.from("submissions").insert({
      id: submissionId,
      organization_id: fx.orgA.id,
      status_id: statusId,
      submitted_by: fx.customerB.id,
      title: "Cross-registered submission",
      type: "feature",
    });
    expect(result.error).toBeNull();

    await adminClient.from("submissions").delete().eq("id", submissionId);
    await adminClient
      .from("customers")
      .delete()
      .eq("organization_id", fx.orgA.id)
      .eq("profile_id", fx.customerB.id);
  });

  it("rejects a true anonymous submission attempt -- confirmed RLS gap, see the Phase 5 report", async () => {
    const result = await anonClient().from("submissions").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      status_id: fx.statusA,
      title: "Anonymous attempt",
      type: "feature",
    });
    expect(result.error).not.toBeNull();
  });
});

describe("comments", () => {
  it("listComments returns only the public comment to a customer, never the internal one", async () => {
    const comments = await listComments(fx.clientCustomerA, fx.submissionA);
    const ids = comments.map((c) => c.id);
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).not.toContain(fx.internalCommentA);
  });

  it("listComments returns both public and internal comments to an org member", async () => {
    const comments = await listComments(fx.clientOwnerA, fx.submissionA);
    const ids = comments.map((c) => c.id);
    expect(ids).toContain(fx.publicCommentA);
    expect(ids).toContain(fx.internalCommentA);
  });
});

describe("votes", () => {
  it("hasVoted and getVotedSubmissionIds correctly reflect real vote state", async () => {
    const voteId = randomUUID();
    await fx.clientCustomerA
      .from("votes")
      .insert({ id: voteId, submission_id: fx.submissionA, user_id: fx.customerA.id });

    expect(await hasVoted(fx.clientCustomerA, fx.submissionA, fx.customerA.id)).toBe(true);

    const ids = await getVotedSubmissionIds(fx.clientCustomerA, fx.customerA.id, [
      fx.submissionA,
      fx.submissionB,
    ]);
    expect(ids.has(fx.submissionA)).toBe(true);
    expect(ids.has(fx.submissionB)).toBe(false);

    await adminClient.from("votes").delete().eq("id", voteId);
  });
});
