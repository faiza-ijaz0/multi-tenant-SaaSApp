import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Proves (rather than assumes) the two RLS gaps called out in the Phase 5
// report: notifications has no INSERT policy for any role, and
// audit_events INSERT requires the actor to be an org admin. These tests
// exist specifically so "no notification/audit row can be created for a
// member/customer action under the current schema" is a verified fact,
// not a claim -- and so a future migration that changes this gets caught
// by a real, currently-failing-by-design assertion instead of silently
// changing behavior.

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("notifications: no INSERT policy exists for any role (documented RLS gap)", () => {
  it("an org owner cannot insert a notification row directly", async () => {
    const result = await fx.clientOwnerA.from("notifications").insert({
      id: randomUUID(),
      profile_id: fx.ownerA.id,
      organization_id: fx.orgA.id,
      type: "test",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });

  it("a customer cannot insert a notification row directly either", async () => {
    const result = await fx.clientCustomerA.from("notifications").insert({
      id: randomUUID(),
      profile_id: fx.customerA.id,
      organization_id: fx.orgA.id,
      type: "test",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });
});

describe("audit_events: INSERT requires the actor to be an org admin", () => {
  it("a customer cannot insert an audit event, even attributed to themselves", async () => {
    const result = await fx.clientCustomerA.from("audit_events").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      actor_profile_id: fx.customerA.id,
      action: "test.action",
      entity_type: "submission",
      entity_id: fx.submissionA,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });

  it("an org owner CAN insert an audit event for their own admin-gated action -- this is the one path updateSubmissionStatus relies on", async () => {
    const auditId = randomUUID();
    const result = await fx.clientOwnerA.from("audit_events").insert({
      id: auditId,
      organization_id: fx.orgA.id,
      actor_profile_id: fx.ownerA.id,
      action: "test.status_changed",
      entity_type: "submission",
      entity_id: fx.submissionA,
    });
    expect(result.error).toBeNull();

    await adminClient.from("audit_events").delete().eq("id", auditId);
  });
});
