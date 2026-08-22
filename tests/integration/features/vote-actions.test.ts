import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addVoteForSubmission,
  removeVoteForSubmission,
  resolveVoteRevalidationPaths,
} from "@/features/votes/actions";

import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";

// Self-contained, dedicated fixture (not the shared tests/integration/rls/fixtures.ts
// setup) -- this file specifically needs to control the exact org/submission/
// portal-slug shape it asserts resolveVoteRevalidationPaths against, without
// any risk of a shared fixture changing underneath it.

let owner: TestIdentity;
let ownerClient: SupabaseClient;
let orgId: string;
let statusId: string;
let submissionId: string;
let slug: string;

beforeAll(async () => {
  owner = await createTestIdentity("vote-actions-owner");
  ownerClient = await signInAs(owner);

  await ownerClient.from("profiles").insert({ id: owner.id });

  orgId = randomUUID();
  await ownerClient.from("organizations").insert({ id: orgId, name: "Vote Actions Test Org" });
  await ownerClient
    .from("memberships")
    .insert({ id: randomUUID(), organization_id: orgId, profile_id: owner.id, role: "owner" });

  statusId = randomUUID();
  await ownerClient.from("statuses").insert({ id: statusId, organization_id: orgId, name: "Open" });

  submissionId = randomUUID();
  await ownerClient.from("submissions").insert({
    id: submissionId,
    organization_id: orgId,
    status_id: statusId,
    submitted_by: owner.id,
    title: "Vote actions test submission",
    type: "feature",
  });

  slug = `vote-actions-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await ownerClient
    .from("portal_settings")
    .insert({ id: randomUUID(), organization_id: orgId, slug, is_public: true });
}, 60_000);

afterAll(async () => {
  if (orgId) await adminClient.from("organizations").delete().eq("id", orgId);
  if (owner) await deleteTestIdentity(owner.id);
}, 60_000);

describe("features/votes/actions.ts: framework-agnostic core", () => {
  it("addVoteForSubmission records a vote", async () => {
    const result = await addVoteForSubmission(ownerClient, owner.id, submissionId);
    expect(result.ok).toBe(true);

    const { data } = await adminClient
      .from("votes")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("user_id", owner.id)
      .maybeSingle();
    expect(data).not.toBeNull();
  });

  it("addVoteForSubmission rejects a duplicate vote with a clean message, not a raw constraint error", async () => {
    const result = await addVoteForSubmission(ownerClient, owner.id, submissionId);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already voted/i);
  });

  it("removeVoteForSubmission removes the vote, allowing a re-vote afterward", async () => {
    const removed = await removeVoteForSubmission(ownerClient, owner.id, submissionId);
    expect(removed.ok).toBe(true);

    const readded = await addVoteForSubmission(ownerClient, owner.id, submissionId);
    expect(readded.ok).toBe(true);
  });

  it(
    "resolveVoteRevalidationPaths derives exactly the dashboard + portal paths for this " +
      "submission from its own organization_id/portal slug -- never from a client-supplied path",
    async () => {
      const paths = await resolveVoteRevalidationPaths(ownerClient, submissionId);
      expect(paths).toEqual([
        `/dashboard/submissions/${submissionId}`,
        `/feedback/${slug}`,
        `/feedback/${slug}/${submissionId}`,
      ]);
    },
  );

  it("resolveVoteRevalidationPaths degrades to just the dashboard path for a nonexistent submission id", async () => {
    const paths = await resolveVoteRevalidationPaths(ownerClient, randomUUID());
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^\/dashboard\/submissions\//);
  });
});
