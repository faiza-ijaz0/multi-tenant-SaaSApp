// Mirrors the DB's own rule (organizations_name_not_blank: btrim(name) <> '')
// plus a UI-side sanity cap the database doesn't enforce -- the database
// stays the final authority on "not blank"; this only prevents pathological
// input before it ever reaches a query.
export const MAX_ORGANIZATION_NAME_LENGTH = 100;

export interface OrganizationFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    name?: string;
  };
}

export const initialOrganizationFormState: OrganizationFormState = { status: "idle" };
