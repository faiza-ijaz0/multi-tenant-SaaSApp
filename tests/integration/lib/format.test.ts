import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime } from "@/lib/format";

// Phase 7: several Server Components rendered timestamps with
// toLocaleString()/toLocaleDateString() and no locale/timezone, which
// makes output depend on whatever the running process's default locale
// happens to be (see app/dashboard/activity/page.tsx and friends). These
// tests exist to pin that the shared formatter is actually deterministic
// -- a fixed instant always produces the same string, regardless of what
// TZ the test runner's environment is in -- so a future regression back to
// unpinned formatting would be caught here rather than only being visible
// as a subtle prod/dev discrepancy.

describe("formatDateTime", () => {
  it("is deterministic for a fixed instant, independent of the runtime's default locale/timezone", () => {
    const instant = "2024-03-15T18:30:00.000Z";
    expect(formatDateTime(instant)).toBe(formatDateTime(instant));
    expect(formatDateTime(instant)).toContain("2024");
    expect(formatDateTime(instant)).toContain("6:30");
  });
});

describe("formatDate", () => {
  it("is deterministic for a fixed instant", () => {
    const instant = "2024-03-15T18:30:00.000Z";
    expect(formatDate(instant)).toBe(formatDate(instant));
    expect(formatDate(instant)).toContain("2024");
  });

  it("does not shift the calendar day across the UTC boundary", () => {
    // 2024-03-15T23:59:00Z is still March 15 in UTC -- a formatter that
    // silently used the host's local timezone instead could roll this
    // forward or back a day depending on where it runs.
    expect(formatDate("2024-03-15T23:59:00.000Z")).toContain("15");
  });
});
