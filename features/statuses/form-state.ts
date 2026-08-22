export const MAX_STATUS_NAME_LENGTH = 40;
export const DEFAULT_STATUS_COLOR = "#6b7280";

export interface StatusFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    name?: string;
    color?: string;
  };
}

export const initialStatusFormState: StatusFormState = { status: "idle" };
