-- 0016_submissions_page.sql
-- Applied live against project mosczhxreynyoeneztfm.
--
-- ---------------------------------------------------------------------------
-- THE CHANGE
-- ---------------------------------------------------------------------------
-- Separates the full submissions management surface from the dashboard
-- overview: /dashboard (stats + a "Recent submissions" summary card) and
-- the new /dashboard/submissions (full filterable list) +
-- /dashboard/submissions/[id] (detail) are now two distinct pages, each
-- with its own page-permission key -- `dashboard` no longer implies
-- `submissions`, and vice versa. Confirmed live before writing this
-- migration (`select m.role, array(select page from
-- membership_page_permissions where membership_id = m.id) from
-- memberships m`) that no real, non-owner membership in this project
-- currently holds `dashboard` at all, so this split narrows nobody's
-- actual current access -- no backfill is included or needed.
--
-- Same shape as 0015_organization_members_page.sql: purely additive,
-- extends the two CHECK constraints that enumerate the page-key allow-list
-- (membership_page_permissions and invitations.page_permissions, kept in
-- sync since 0009). has_page_permission(organization_id, page) (0002) is
-- fully generic over its `p_page text` parameter -- no other schema object
-- needs to change.
-- ---------------------------------------------------------------------------

alter table public.membership_page_permissions
  drop constraint membership_page_permissions_page_check;

alter table public.membership_page_permissions
  add constraint membership_page_permissions_page_check
  check (page in ('dashboard', 'submissions', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings', 'organization_members'));

alter table public.invitations
  drop constraint invitations_page_permissions_check;

alter table public.invitations
  add constraint invitations_page_permissions_check
  check (
    page_permissions <@ array['dashboard', 'submissions', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings', 'organization_members']::text[]
  );
