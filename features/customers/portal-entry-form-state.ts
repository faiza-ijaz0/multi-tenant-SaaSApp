export interface PortalEntryFormState {
  status: "idle" | "error";
  message?: string;
}

export const initialPortalEntryFormState: PortalEntryFormState = { status: "idle" };
