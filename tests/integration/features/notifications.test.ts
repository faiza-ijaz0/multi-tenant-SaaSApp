import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getUnreadNotificationCount, listNotifications } from "@/features/notifications/queries";

import { adminClient, anonClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Notification creation is blocked by RLS for every role, including
// admins (see features/notifications/service.ts and the Phase 5/6
// reports) -- there is no application code path that inserts a
// notification. To test the read/mark-read side for real, these tests
// seed one ground-truth row directly via the service-role client (test
// setup only, per the Phase 1A convention), then verify every actual
// read/write exclusively through real authenticated sessions or a real
// anonymous client.

let fx: RlsFixtures;
let notificationId: string;

beforeAll(async () => {
  fx = await setupFixtures();
  notificationId = randomUUID();
  const { error } = await adminClient.from("notifications").insert({
    id: notificationId,
    profile_id: fx.ownerA.id,
    organization_id: fx.orgA.id,
    type: "test.seeded",
  });
  if (error) throw new Error(`Failed to seed notification fixture: ${error.message}`);
}, 60_000);

afterAll(async () => {
  await adminClient.from("notifications").delete().eq("id", notificationId);
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("reading notifications", () => {
  it("the owning user can read their own notification", async () => {
    const notifications = await listNotifications(fx.clientOwnerA, fx.ownerA.id);
    expect(notifications.map((n) => n.id)).toContain(notificationId);
  });

  it("a different user cannot read someone else's notification, even asking by that user's id", async () => {
    // listNotifications is called *as* customerA but requesting ownerA's
    // id -- RLS (notifications_select_own) scopes strictly to the
    // caller's own auth.uid(), so this must come back empty regardless of
    // what userId is passed in.
    const notifications = await listNotifications(fx.clientCustomerA, fx.ownerA.id);
    expect(notifications.find((n) => n.id === notificationId)).toBeUndefined();
  });

  it("an anonymous client cannot read it", async () => {
    const result = await anonClient().from("notifications").select("id").eq("id", notificationId);
    expect(result.data ?? []).toHaveLength(0);
  });

  it("getUnreadNotificationCount reflects real state for the owner", async () => {
    const count = await getUnreadNotificationCount(fx.clientOwnerA, fx.ownerA.id, fx.orgA.id);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("marking notifications read", () => {
  it("cannot modify another user's notification", async () => {
    const result = await fx.clientCustomerA
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data ?? []).toHaveLength(0);

    const groundTruth = await adminClient
      .from("notifications")
      .select("read_at")
      .eq("id", notificationId)
      .single();
    expect(groundTruth.data?.read_at).toBeNull();
  });

  it("the owner can mark their own notification read", async () => {
    const result = await fx.clientOwnerA
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data?.length).toBe(1);
  });
});

describe("notification creation has no authorized path", () => {
  it("a regular authenticated client cannot insert a notification -- confirms the disabled service.ts boundary is necessary, not just cautious", async () => {
    const result = await fx.clientOwnerA.from("notifications").insert({
      id: randomUUID(),
      profile_id: fx.ownerA.id,
      organization_id: fx.orgA.id,
      type: "test.unauthorized",
    });
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe("42501");
  });
});
