export const MIN_PASSWORD_LENGTH = 8;

export interface AuthFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
}

export const initialAuthFormState: AuthFormState = { status: "idle" };

/** Only ever redirect to a same-origin relative path -- never an open redirect. */
export function sanitizeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
