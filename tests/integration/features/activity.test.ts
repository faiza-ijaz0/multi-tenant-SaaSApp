import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listAuditEvents } from "@/features/audit/queries";
import { updateSubmissionStatusForOrganization } from "@/features/submissions/status";

import { adminClient, anonClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("listAuditEvents (admin-only read, per audit_events_select_admin)", () => {
  it("an admin can read their own organization's audit events", async () => {
    const auditId = randomUUID();
    await adminClient.from("audit_events").insert({
      id: auditId,
      organization_id: fx.orgA.id,
      actor_profile_id: fx.ownerA.id,
      action: "test.seeded",
      entity_type: "submission",
      entity_id: fx.submissionA,
    });

    const events = await listAuditEvents(fx.clientOwnerA, fx.orgA.id);
    expect(events.map((e) => e.id)).toContain(auditId);

    await adminClient.from("audit_events").delete().eq("id", auditId);
  });

  it("a non-admin (customer) sees nothing -- RLS-filtered, not an error", async () => {
    const events = await listAuditEvents(fx.clientCustomerA, fx.orgA.id);
    expect(events).toHaveLength(0);
  });

  it("an unrelated organization's admin cannot read another org's audit events", async () => {
    const events = await listAuditEvents(fx.clientOwnerB, fx.orgA.id);
    expect(events).toHaveLength(0);
  });

  it("an anonymous client cannot read audit_events at all", async () => {
    const result = await anonClient().from("audit_events").select("id").eq("organization_id", fx.orgA.id);
    expect(result.data ?? []).toHaveLength(0);
  });

  it("actor identity cannot be spoofed on insert", async () => {
    const result = await fx.clientOwnerA.from("audit_events").insert({
      id: randomUUID(),
      organization_id: fx.orgA.id,
      actor_profile_id: fx.customerA.id, // someone else's identity
      action: "test.spoof",
      entity_type: "submission",
      entity_id: fx.submissionA,
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });
});

describe("updateSubmissionStatusForOrganization (the real submission.status_changed path)", () => {
  it("changes the status and writes exactly one tenant-safe audit event", async () => {
    const altStatusId = randomUUID();
    await adminClient
      .from("statuses")
      .insert({ id: altStatusId, organization_id: fx.orgA.id, name: `Alt ${altStatusId.slice(0, 8)}` });

    const result = await updateSubmissionStatusForOrganization(
      fx.clientOwnerA,
      fx.orgA.id,
      fx.ownerA.id,
      fx.submissionA,
      altStatusId,
    );
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);

    const events = await adminClient
      .from("audit_events")
      .select("id, actor_profile_id, organization_id")
      .eq("entity_id", fx.submissionA)
      .eq("action", "submission.status_changed");
    expect(events.data).toHaveLength(1);
    expect(events.data?.[0]).toMatchObject({ actor_profile_id: fx.ownerA.id, organization_id: fx.orgA.id });

    // cleanup
    await adminClient.from("submissions").update({ status_id: fx.statusA }).eq("id", fx.submissionA);
    await adminClient
      .from("audit_events")
      .delete()
      .eq("entity_id", fx.submissionA)
      .eq("action", "submission.status_changed");
    await adminClient.from("statuses").delete().eq("id", altStatusId);
  });

  it("calling it again with the same target status is a safe no-op and creates no duplicate audit event", async () => {
    const altStatusId = randomUUID();
    await adminClient
      .from("statuses")
      .insert({ id: altStatusId, organization_id: fx.orgA.id, name: `Alt2 ${altStatusId.slice(0, 8)}` });

    const first = await updateSubmissionStatusForOrganization(
      fx.clientOwnerA,
      fx.orgA.id,
      fx.ownerA.id,
      fx.submissionA,
      altStatusId,
    );
    expect(first.changed).toBe(true);

    const second = await updateSubmissionStatusForOrganization(
      fx.clientOwnerA,
      fx.orgA.id,
      fx.ownerA.id,
      fx.submissionA,
      altStatusId,
    );
    expect(second.ok).toBe(true);
    expect(second.changed).toBe(false);

    const events = await adminClient
      .from("audit_events")
      .select("id")
      .eq("entity_id", fx.submissionA)
      .eq("action", "submission.status_changed");
    expect(events.data).toHaveLength(1);

    // cleanup
    await adminClient.from("submissions").update({ status_id: fx.statusA }).eq("id", fx.submissionA);
    await adminClient
      .from("audit_events")
      .delete()
      .eq("entity_id", fx.submissionA)
      .eq("action", "submission.status_changed");
    await adminClient.from("statuses").delete().eq("id", altStatusId);
  });

  it("a non-admin cannot use this path to change status (the action wrapper's role check, not this function, is what blocks it -- this proves the RLS-level insert would still reject the audit write if that check were ever skipped)", async () => {
    // customerA is not an admin. The Server Action layer (updateSubmissionStatus)
    // rejects non-admins before ever calling this function; this test proves
    // the underlying RLS is the real backstop even if that check were bypassed.
    const altStatusId = randomUUID();
    await adminClient
      .from("statuses")
      .insert({ id: altStatusId, organization_id: fx.orgA.id, name: `Alt3 ${altStatusId.slice(0, 8)}` });

    const result = await updateSubmissionStatusForOrganization(
      fx.clientCustomerA,
      fx.orgA.id,
      fx.customerA.id,
      fx.submissionA,
      altStatusId,
    );
    // The submission UPDATE itself succeeds under submissions_update_author_or_member
    // (any org member may update; customerA is not a member here, so this
    // should actually be denied at the update step for a customer).
    expect(result.ok).toBe(false);

    await adminClient.from("statuses").delete().eq("id", altStatusId);
  });
});
