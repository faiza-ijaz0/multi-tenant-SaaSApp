// Mirrors portal_settings' check constraints (0001_initial_schema.sql):
// portal_settings_slug_format_check: ^[a-z0-9]+(-[a-z0-9]+)*$
// portal_settings_slug_length_check: char_length(slug) between 3 and 63
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

/**
 * Deterministic, DB-constraint-safe slug from an organization name. Pure
 * function -- no I/O, no uniqueness handling (that's the caller's job,
 * against the database's actual unique constraint, the final authority on
 * whether a slug is taken).
 */
export function generateSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, ""); // slice() can leave a trailing hyphen

  if (normalized.length >= SLUG_MIN_LENGTH) return normalized;

  // The name had nothing slug-safe in it (e.g. all symbols/non-Latin
  // script) -- fall back to a generic, still-valid slug rather than
  // producing something that fails the length/format check constraints.
  return normalized ? `${normalized}-org` : "org";
}
