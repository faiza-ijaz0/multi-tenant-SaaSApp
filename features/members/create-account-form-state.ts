export interface CreateMemberAccountResult {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };
}

export const initialCreateMemberAccountState: CreateMemberAccountResult = { status: "idle" };
