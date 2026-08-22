import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCommentForSubmission } from "@/features/comments/actions";

import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";

// Self-contained fixture, same rationale as vote-actions.test.ts -- needs
// both a member and a customer identity on one org to exercise the
// is_internal authorization boundary the shared fixture doesn't target
// this directly.

let owner: TestIdentity;
let customer: TestIdentity;
let ownerClient: SupabaseClient;
let customerClient: SupabaseClient;
let orgId: string;
let submissionId: string;

beforeAll(async () => {
  owner = await createTestIdentity("comment-actions-owner");
  customer = await createTestIdentity("comment-actions-customer");
  ownerClient = await signInAs(owner);
  customerClient = await signInAs(customer);

  await ownerClient.from("profiles").insert({ id: owner.id });
  await customerClient.from("profiles").insert({ id: customer.id });

  orgId = randomUUID();
  await ownerClient.from("organizations").insert({ id: orgId, name: "Comment Actions Test Org" });
  await ownerClient
    .from("memberships")
    .insert({ id: randomUUID(), organization_id: orgId, profile_id: owner.id, role: "owner" });

  await customerClient
    .from("customers")
    .insert({ id: randomUUID(), organization_id: orgId, profile_id: customer.id, email: customer.email });

  const statusId = randomUUID();
  await ownerClient.from("statuses").insert({ id: statusId, organization_id: orgId, name: "Open" });

  submissionId = randomUUID();
  await ownerClient.from("submissions").insert({
    id: submissionId,
    organization_id: orgId,
    status_id: statusId,
    submitted_by: owner.id,
    title: "Comment actions test submission",
    type: "feature",
  });
}, 60_000);

afterAll(async () => {
  if (orgId) await adminClient.from("organizations").delete().eq("id", orgId);
  if (owner) await deleteTestIdentity(owner.id);
  if (customer) await deleteTestIdentity(customer.id);
}, 60_000);

describe("features/comments/actions.ts: createCommentForSubmission (shared core)", () => {
  it("an org member can post an internal comment through the shared core", async () => {
    const result = await createCommentForSubmission(ownerClient, submissionId, owner.id, "Internal note", true);
    expect(result.ok).toBe(true);

    const { data } = await adminClient
      .from("comments")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("is_internal", true)
      .eq("author_profile_id", owner.id);
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("a customer can post a public (non-internal) comment through the shared core", async () => {
    const result = await createCommentForSubmission(
      customerClient,
      submissionId,
      customer.id,
      "Public customer comment",
      false,
    );
    expect(result.ok).toBe(true);
  });

  it(
    "a customer attempting an internal comment through the shared core is still rejected by RLS -- " +
      "the core function performs no authorization of its own, so this proves " +
      "comments_insert_member_or_customer remains the real backstop even after the core extraction",
    async () => {
      const result = await createCommentForSubmission(
        customerClient,
        submissionId,
        customer.id,
        "Attempted internal note from a customer",
        true,
      );
      expect(result.ok).toBe(false);
    },
  );

  it("author identity cannot be spoofed -- inserting with someone else's profile id is rejected by RLS", async () => {
    const result = await createCommentForSubmission(customerClient, submissionId, owner.id, "Spoofed author", false);
    expect(result.ok).toBe(false);
  });
});
