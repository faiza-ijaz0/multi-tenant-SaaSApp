export const MAX_BRAND_NAME_LENGTH = 60;
export const MAX_WELCOME_MESSAGE_LENGTH = 500;
export const DEFAULT_ACCENT_COLOR = "#6366f1";

// Mirrors portal_settings' own check constraints (0001_initial_schema.sql).
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

export interface PortalSettingsFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: {
    slug?: string;
    brandName?: string;
    welcomeMessage?: string;
    logoUrl?: string;
  };
}

export const initialPortalSettingsFormState: PortalSettingsFormState = { status: "idle" };

export interface PortalSettingsInput {
  slug: string;
  brandName: string;
  welcomeMessage: string;
  logoUrl: string;
  accentColor: string;
  isPublic: boolean;
}

export type PortalSettingsFieldErrors = NonNullable<PortalSettingsFormState["fieldErrors"]>;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Pure validation, kept out of ./actions.ts deliberately: that file is
 * "use server", and Next.js requires every export from a "use server"
 * module to be an async function -- a plain synchronous helper like this
 * can't live there. Also makes it directly unit-testable with no DB/session.
 */
export function validatePortalSettingsInput(input: PortalSettingsInput): PortalSettingsFieldErrors | null {
  const fieldErrors: PortalSettingsFieldErrors = {};

  if (input.slug.length < SLUG_MIN_LENGTH || input.slug.length > SLUG_MAX_LENGTH) {
    fieldErrors.slug = `Must be ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} characters.`;
  } else if (!SLUG_PATTERN.test(input.slug)) {
    fieldErrors.slug = "Use lowercase letters, numbers, and single hyphens only.";
  }
  if (input.brandName.length > MAX_BRAND_NAME_LENGTH) {
    fieldErrors.brandName = `Keep it under ${MAX_BRAND_NAME_LENGTH} characters.`;
  }
  if (input.welcomeMessage.length > MAX_WELCOME_MESSAGE_LENGTH) {
    fieldErrors.welcomeMessage = `Keep it under ${MAX_WELCOME_MESSAGE_LENGTH} characters.`;
  }
  if (input.logoUrl && !/^https?:\/\/.+/i.test(input.logoUrl)) {
    fieldErrors.logoUrl = "Enter a valid http(s) URL.";
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}
