/**
 * Authenticated identity, resolved exclusively from a verified Supabase Auth
 * session (see user.ts) -- never from a client-supplied id.
 */
export interface AuthenticatedUserContext {
  id: string;
  email: string | null;
  /** From the JWT's user_metadata.full_name, set at signup (see
   * lib/auth/customer-auth-actions.ts) -- best-effort display name, not an
   * authorization input. null when never set (e.g. accounts created before
   * this field existed, or via the admin-created-member RPC path, which
   * writes full_name straight to profiles instead). */
  fullName: string | null;
}

/** Mirrors the memberships.role check constraint (0001_initial_schema.sql). */
export type OrganizationRole = "owner" | "admin" | "member";

export interface OrganizationMembership {
  membershipId: string;
  role: OrganizationRole;
  organization: {
    id: string;
    name: string;
  };
}

/**
 * The single authoritative tenant context for a request: which organization
 * the authenticated user is acting within, and their real, server-verified
 * role there. Only ever constructed by resolveOrganizationContext -- never
 * assembled by hand from client input.
 */
export interface OrganizationContext {
  organization: {
    id: string;
    name: string;
  };
  membership: {
    id: string;
    role: OrganizationRole;
  };
}
