import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient } from "../rls/helpers";
import { setupFixtures, teardownFixtures, type RlsFixtures } from "../rls/fixtures";

// Phase 8 mutation-reliability fixes. These exercise the exact Supabase
// query shapes the fixed Server Actions now use (.select() + a row-count
// check, and a sort_order guard in the WHERE clause), through real
// authenticated sessions -- not the "use server" action functions
// themselves, which call getTenantScope() -> cookies() and can't run
// outside a real Next.js request (see features/submissions/status.ts and
// activity.test.ts for the established precedent: test the extracted/
// underlying behavior, not the thin action wrapper).

let fx: RlsFixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 60_000);

afterAll(async () => {
  if (fx) await teardownFixtures(fx);
}, 60_000);

describe("zero-row UPDATE is distinguishable from a real update (Phase 8 fix)", () => {
  it("notifications: updating a nonexistent notification id affects zero rows, not a fabricated success", async () => {
    const result = await fx.clientOwnerA
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", randomUUID())
      .eq("profile_id", fx.ownerA.id)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });

  it("categories: updating a nonexistent category id affects zero rows", async () => {
    const result = await fx.clientOwnerA
      .from("categories")
      .update({ name: `Ghost ${randomUUID().slice(0, 8)}` })
      .eq("id", randomUUID())
      .eq("organization_id", fx.orgA.id)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });

  it("categories: updating the real category id affects exactly one row", async () => {
    const result = await fx.clientOwnerA
      .from("categories")
      .update({ description: "still General" })
      .eq("id", fx.categoryA)
      .eq("organization_id", fx.orgA.id)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);

    await adminClient.from("categories").update({ description: null }).eq("id", fx.categoryA);
  });

  it("statuses: updating a nonexistent status id affects zero rows", async () => {
    const result = await fx.clientOwnerA
      .from("statuses")
      .update({ name: `Ghost ${randomUUID().slice(0, 8)}` })
      .eq("id", randomUUID())
      .eq("organization_id", fx.orgA.id)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });

  it("statuses: updating the real status id affects exactly one row", async () => {
    const result = await fx.clientOwnerA
      .from("statuses")
      .update({ is_closed: false })
      .eq("id", fx.statusA)
      .eq("organization_id", fx.orgA.id)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });
});

describe("optimistic-concurrency guard for reordering (Phase 8 fix)", () => {
  it("categories: a swap UPDATE with a stale sort_order in the WHERE clause affects zero rows and leaves the row untouched", async () => {
    const result = await fx.clientOwnerA
      .from("categories")
      .update({ sort_order: 5 })
      .eq("id", fx.categoryA)
      .eq("organization_id", fx.orgA.id)
      .eq("sort_order", 999_999) // deliberately wrong -- simulates a stale read
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);

    const groundTruth = await adminClient
      .from("categories")
      .select("sort_order")
      .eq("id", fx.categoryA)
      .single();
    expect(groundTruth.data?.sort_order).not.toBe(5);
  });

  it("categories: a swap UPDATE using the real current sort_order succeeds and affects exactly one row", async () => {
    const before = await fx.clientOwnerA
      .from("categories")
      .select("sort_order")
      .eq("id", fx.categoryA)
      .single();
    const currentSortOrder = before.data?.sort_order as number;

    const result = await fx.clientOwnerA
      .from("categories")
      .update({ sort_order: currentSortOrder })
      .eq("id", fx.categoryA)
      .eq("organization_id", fx.orgA.id)
      .eq("sort_order", currentSortOrder)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it("statuses: a swap UPDATE with a stale sort_order in the WHERE clause affects zero rows", async () => {
    const result = await fx.clientOwnerA
      .from("statuses")
      .update({ sort_order: 5 })
      .eq("id", fx.statusA)
      .eq("organization_id", fx.orgA.id)
      .eq("sort_order", 999_999)
      .select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });
});
