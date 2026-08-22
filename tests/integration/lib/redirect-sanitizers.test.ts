import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "@/lib/auth/auth-form-state";
import { sanitizeCustomerNextPath } from "@/lib/auth/customer-auth-form-state";

// Phase 8: regression coverage for the open-redirect fix to both sanitizers
// -- browsers normalize a leading backslash to a forward slash when parsing
// a Location header's path, so "/\evil.com" becomes "//evil.com" on
// navigation even though the raw string never contains a literal "//"
// prefix. Pure functions, no Supabase session required.

describe("sanitizeNextPath", () => {
  it("keeps a well-formed same-origin dashboard path", () => {
    expect(sanitizeNextPath("/dashboard/submissions")).toBe("/dashboard/submissions");
  });

  it("falls back to /dashboard for a missing value", () => {
    expect(sanitizeNextPath(null)).toBe("/dashboard");
    expect(sanitizeNextPath(undefined)).toBe("/dashboard");
    expect(sanitizeNextPath("")).toBe("/dashboard");
  });

  it("rejects a path not starting with /", () => {
    expect(sanitizeNextPath("dashboard")).toBe("/dashboard");
  });

  it("rejects a protocol-relative open redirect", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/dashboard");
  });

  it("rejects the backslash-normalization open-redirect bypass", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/dashboard");
  });
});

describe("sanitizeCustomerNextPath", () => {
  it("keeps a well-formed same-origin feedback path", () => {
    expect(sanitizeCustomerNextPath("/feedback/acme")).toBe("/feedback/acme");
  });

  it("falls back to the customer entry path for a missing value", () => {
    expect(sanitizeCustomerNextPath(null)).toBe("/feedback/portal");
  });

  it("rejects a path outside /feedback, e.g. a crafted /dashboard target", () => {
    expect(sanitizeCustomerNextPath("/dashboard")).toBe("/feedback/portal");
  });

  it("rejects a protocol-relative open redirect", () => {
    expect(sanitizeCustomerNextPath("//evil.com")).toBe("/feedback/portal");
  });

  it("rejects the backslash-normalization open-redirect bypass", () => {
    expect(sanitizeCustomerNextPath("/\\evil.com")).toBe("/feedback/portal");
  });
});
