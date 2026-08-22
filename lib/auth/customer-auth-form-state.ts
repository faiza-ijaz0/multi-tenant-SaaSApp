export const MAX_FULL_NAME_LENGTH = 120;

/**
 * Separate from AuthFormState (auth-form-state.ts): the customer signup
 * form has one extra field (fullName) that the internal member signup form
 * doesn't collect, so this isn't a drop-in reuse of the same shape.
 */
export interface CustomerAuthFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
}

export const initialCustomerAuthFormState: CustomerAuthFormState = { status: "idle" };

/** Where a customer lands after signing up or signing in -- see
 * lib/auth/customer-auth-actions.ts for the full rationale. */
export const CUSTOMER_ENTRY_PATH = "/feedback/portal";

/**
 * Same shape/intent as sanitizeNextPath (this file's sibling for the
 * internal member flow) -- only ever a same-origin relative path, never an
 * open redirect -- but scoped to the customer journey: a `next` value
 * outside /feedback (e.g. a crafted `?next=/dashboard`) must never be
 * honored, since this entry point exists precisely so a customer is never
 * accidentally routed into the internal dashboard. Also rejects a leading
 * "/\" -- see sanitizeNextPath's comment on why that's an open-redirect
 * vector distinct from a literal "//" prefix.
 */
export function sanitizeCustomerNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return CUSTOMER_ENTRY_PATH;
  if (!value.startsWith("/feedback") || value.startsWith("//") || value.startsWith("/\\")) {
    return CUSTOMER_ENTRY_PATH;
  }
  return value;
}
