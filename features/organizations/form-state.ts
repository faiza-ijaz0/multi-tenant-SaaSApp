export const MAX_ORGANIZATION_NAME_LENGTH = 120;

export interface UpdateOrganizationNameResult {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: { name?: string };
}

export const initialUpdateOrganizationNameState: UpdateOrganizationNameResult = { status: "idle" };
