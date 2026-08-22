const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape-only check, not a lookup or an authorization decision. Used to turn
 * a malformed dynamic-route id (e.g. /dashboard/submissions/not-a-uuid)
 * into a clean notFound() instead of letting it reach a uuid-typed column
 * comparison, which Postgres rejects with "invalid input syntax for type
 * uuid" -- an uncaught throw that would otherwise fall through to the
 * nearest error.tsx instead of the correct not-found behavior.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
