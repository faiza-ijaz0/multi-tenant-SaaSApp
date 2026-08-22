import type { SupabaseClient } from "@supabase/supabase-js";

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

/**
 * organizationId must already be a server-resolved, RLS-verified value
 * (e.g. from getTenantScope() or a portal lookup by slug) -- never a raw
 * client-supplied id trusted for authorization. RLS (categories_select_scoped)
 * independently re-enforces visibility regardless.
 */
export async function listCategories(
  supabase: SupabaseClient,
  organizationId: string,
  options: { activeOnly?: boolean } = {},
): Promise<Category[]> {
  let query = supabase
    .from("categories")
    .select("id, name, description, is_active, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (options.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    isActive: row.is_active as boolean,
    sortOrder: row.sort_order as number,
  }));
}
