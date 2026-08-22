import type { SupabaseClient } from "@supabase/supabase-js";

export interface PortalSettings {
  id: string;
  slug: string;
  brandName: string | null;
  logoUrl: string | null;
  accentColor: string;
  welcomeMessage: string | null;
  isPublic: boolean;
}

// Mirrors the HEX_COLOR_PATTERN this value was validated against on write
// (features/portal-settings/actions.ts). Re-checked here, at the render
// boundary, before any caller uses accentColor as a CSS value -- defense in
// depth against legacy/out-of-band rows, not a substitute for the write-time
// check. Only ever consumed via a CSS custom property (never interpolated
// into a class name, attribute, or dangerouslySetInnerHTML), so the worst a
// malformed value could do pre-validation is fail to parse as a color.
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** A safe-to-render accent color for this portal, or null if missing/invalid
 * (never a customer-controlled or otherwise untrusted value -- this only
 * ever reads what an org admin already saved through the validated portal
 * settings form). Callers should fall back to a neutral/default treatment
 * on null, never skip rendering entirely. */
export function sanitizePortalAccentColor(accentColor: string | null | undefined): string | null {
  return accentColor && HEX_COLOR_PATTERN.test(accentColor) ? accentColor : null;
}

/**
 * organizationId must already be a server-resolved, RLS-verified value --
 * never a raw client-supplied id trusted for authorization.
 */
export async function getPortalSettings(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PortalSettings | null> {
  const { data, error } = await supabase
    .from("portal_settings")
    .select("id, slug, brand_name, logo_url, accent_color, welcome_message, is_public")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load portal settings: ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id as string,
    slug: data.slug as string,
    brandName: (data.brand_name as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
    accentColor: data.accent_color as string,
    welcomeMessage: (data.welcome_message as string | null) ?? null,
    isPublic: data.is_public as boolean,
  };
}

/**
 * Public entry point for the /feedback/[slug] portal: resolves an
 * organization purely from its portal slug. Subject to
 * portal_settings_select_member_or_public -- an unrelated caller (no
 * membership/customer relationship, portal not public) gets nothing back,
 * which is the correct "not found" behavior, not a bypassable check here.
 *
 * Deliberately does NOT embed/return the organization's real name
 * (organizations.name): that table's own RLS (organizations_select_related)
 * requires has_organization_access, with no is_portal_public fallback, so
 * an anonymous or unrelated visitor to a genuinely public portal can read
 * this portal_settings row but not the organizations row it belongs to.
 * That's correct, intentional RLS behavior, not a bug to route around --
 * portal_settings.brand_name exists precisely as the org-controlled,
 * public-facing name for this exact situation. Callers should display
 * `brandName`, never assume an organization name is available.
 */
export async function getPortalBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<(PortalSettings & { organizationId: string }) | null> {
  const { data, error } = await supabase
    .from("portal_settings")
    .select("id, slug, brand_name, logo_url, accent_color, welcome_message, is_public, organization_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load portal: ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id as string,
    slug: data.slug as string,
    brandName: (data.brand_name as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
    accentColor: data.accent_color as string,
    welcomeMessage: (data.welcome_message as string | null) ?? null,
    isPublic: data.is_public as boolean,
    organizationId: data.organization_id as string,
  };
}
