import type { SupabaseClient } from "@supabase/supabase-js";

export interface Status {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isClosed: boolean;
}

/**
 * organizationId must already be a server-resolved, RLS-verified value --
 * never a raw client-supplied id trusted for authorization. RLS
 * (statuses_select_scoped) independently re-enforces visibility regardless.
 */
export async function listStatuses(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Status[]> {
  const { data, error } = await supabase
    .from("statuses")
    .select("id, name, color, sort_order, is_closed")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load statuses: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    sortOrder: row.sort_order as number,
    isClosed: row.is_closed as boolean,
  }));
}
