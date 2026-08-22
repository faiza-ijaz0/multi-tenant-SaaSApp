import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/uuid";

// Phase 8: app/dashboard/submissions/[id]/page.tsx and
// app/feedback/[slug]/[id]/page.tsx now gate a malformed dynamic-route id
// with isUuid() before it ever reaches a uuid-typed column comparison
// (which Postgres previously rejected with an uncaught "invalid input
// syntax for type uuid" error instead of a clean notFound()). This is a
// pure shape check, testable without any Supabase session.

describe("isUuid", () => {
  it("accepts a well-formed uuid", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("accepts uppercase hex digits", () => {
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects a route-param-style non-uuid string", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  it("rejects a uuid with the wrong segment lengths", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false);
  });
});
