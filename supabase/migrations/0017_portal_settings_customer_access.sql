-- 0017_portal_settings_customer_access.sql
--
-- APPLIED to project mosczhxreynyoeneztfm on 2026-08-22 via the Supabase
-- MCP (migration version 20260822125928), per docs/architecture.md's
-- migration workflow. Verified live: portal_settings_select_member_or_public's
-- USING expression now reads
-- "is_organization_member(organization_id) OR is_organization_customer(organization_id) OR (is_public = true)".
--
-- ---------------------------------------------------------------------------
-- THE CHANGE
-- ---------------------------------------------------------------------------
-- portal_settings_select_member_or_public (0003_rls_policies.sql) granted
-- portal_settings visibility to org members and public portals, but had no
-- branch for is_organization_customer -- unlike every sibling policy on a
-- portal-scoped table (categories_select_scoped, statuses_select_scoped,
-- submissions_select_scoped, all in 0003_rls_policies.sql), which already
-- treat "member OR customer OR public" as the standard access shape. That
-- meant a real, registered customer of a *private* portal (is_public =
-- false) could submit feedback and vote -- has_organization_access already
-- covers them for those tables -- but could not re-resolve that same
-- portal's own portal_settings row (brand name, welcome message, slug
-- lookup) on a later visit, since portal_settings alone excluded them. This
-- was flagged as a known gap in the Phase 2 report rather than patched
-- there, per instruction to stop and identify before changing RLS; Phase 3
-- asked for the fix.
--
-- This is a pure widening of one already-narrow SELECT policy: it adds
-- exactly one OR branch (is_organization_customer(organization_id), the
-- same SECURITY DEFINER helper 0002_rls_helpers.sql already defines and
-- every sibling policy already calls) and changes nothing else --
-- INSERT/UPDATE/DELETE on portal_settings stay admin-only
-- (portal_settings_insert_admin / _update_admin / _delete_admin, untouched),
-- the existing member and is_public branches are untouched, and no other
-- table's policies are touched. is_organization_customer resolves strictly
-- from `customers.profile_id = auth.uid()` for the given organization_id --
-- there is no path by which this widens access to any organization a caller
-- isn't already a real, verified customer of, and no path by which a
-- client-supplied organization_id (this function only ever receives the
-- row's own organization_id column, evaluated per-row by Postgres) could
-- forge that relationship.
alter policy portal_settings_select_member_or_public on public.portal_settings
  using (
    public.is_organization_member(organization_id)
    or public.is_organization_customer(organization_id)
    or is_public = true
  );
