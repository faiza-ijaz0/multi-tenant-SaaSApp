export const MAX_CUSTOMER_NAME_LENGTH = 120;

export interface UpdateProfileFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: { fullName?: string };
}

export const initialUpdateProfileFormState: UpdateProfileFormState = { status: "idle" };
