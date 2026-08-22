/**
 * Deterministic date formatting for Server Components. `toLocaleString()`/
 * `toLocaleDateString()` with no arguments use the running process's
 * default locale and time zone -- fine for a single dev machine, but not
 * guaranteed to match in production (and not guaranteed to stay constant
 * across deploys), so the same timestamp could render differently depending
 * on where the server happens to run. Pinning both makes output
 * reproducible everywhere. See features/notifications/notification-item.tsx
 * for the client-component version of this same fix (there it also
 * prevents a hydration mismatch; here, server-only, it's purely about
 * deterministic output).
 */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
