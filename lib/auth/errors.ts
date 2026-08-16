/** No verified Supabase Auth session on this request. */
export class UnauthenticatedError extends Error {
  constructor(message = "Not authenticated.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * The authenticated user has no organization context to fall back to (no
 * memberships at all). Distinct from access-denied: this is about the
 * caller's own state, not another organization's existence.
 */
export class OrganizationNotFoundError extends Error {
  constructor(message = "No organization found for this account.") {
    super(message);
    this.name = "OrganizationNotFoundError";
  }
}

/**
 * A specific organization was requested/selected but the authenticated user
 * is not a member of it. Deliberately used whether that organization exists
 * or not -- the response must not reveal which, to avoid leaking another
 * organization's existence to a caller with no access to it.
 */
export class OrganizationAccessDeniedError extends Error {
  constructor(message = "You do not have access to this organization.") {
    super(message);
    this.name = "OrganizationAccessDeniedError";
  }
}

/** The supplied organization id is malformed input, not an authorization decision. */
export class InvalidOrganizationContextError extends Error {
  constructor(message = "Invalid organization context.") {
    super(message);
    this.name = "InvalidOrganizationContextError";
  }
}
