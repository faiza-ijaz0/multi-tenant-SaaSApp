-- 0015_organization_members_page.sql
-- Applied live against project mosczhxreynyoeneztfm.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- Phase 16 added a real, distinct dashboard route --
-- /dashboard/settings/organization/members (app/dashboard/settings/organization/members/page.tsx)
-- -- but it was gated by the existing `settings` page key (bundled with
-- Organization Settings) rather than getting its own. That meant an admin
-- could never be granted access to one without the other, and the Create/
-- Edit Member permission editors (both driven by PAGE_KEYS) had no
-- checkbox for it at all -- "Sidebar has a page, but Role Management
-- cannot assign it," the exact inconsistency a Phase 17 audit was asked to
-- rule out. Confirmed live via `select conname, pg_get_constraintdef(oid)
-- from pg_constraint where conrelid = 'public.membership_page_permissions'::regclass
-- and contype = 'c'` against mosczhxreynyoeneztfm before writing this
-- migration -- the current allow-list is exactly the 7 pre-existing keys.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Adds 'organization_members' as an eighth valid page key, extending both
-- CHECK constraints that enumerate the allow-list (membership_page_permissions
-- and invitations.page_permissions, kept in sync since 0009). No other
-- schema object needs to change: has_page_permission(organization_id, page)
-- (0002_rls_helpers.sql) is fully generic over its `p_page text` parameter
-- (confirmed live via pg_get_functiondef) -- it has no hardcoded list to
-- update. The TypeScript-side registry (lib/authorization/registry.ts)
-- adds the matching PageKey/PAGE_LABEL entry in the same commit as this
-- migration; the app/dashboard/settings/organization/members route guard
-- switches from hasPage(permissions, "settings") to
-- hasPage(permissions, "organization_members").
--
-- WHY THIS IS SAFE, NOT A WEAKENING:
--   - Purely additive: every existing valid page value remains valid, no
--     existing grant row is touched, no existing policy's *logic* changes.
--   - An organization_members grant is a subset of what `settings` already
--     implied before this migration (visibility, not a new capability) --
--     this only lets the two be delegated independently going forward. No
--     membership retroactively gains organization_members here (no backfill
--     insert); ROLE_PRESETS.admin (TypeScript, applied only to brand-new
--     memberships going forward) is what actually grants it by default for
--     newly-created admins.
-- ---------------------------------------------------------------------------

alter table public.membership_page_permissions
  drop constraint membership_page_permissions_page_check;

alter table public.membership_page_permissions
  add constraint membership_page_permissions_page_check
  check (page in ('dashboard', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings', 'organization_members'));

alter table public.invitations
  drop constraint invitations_page_permissions_check;

alter table public.invitations
  add constraint invitations_page_permissions_check
  check (
    page_permissions <@ array['dashboard', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings', 'organization_members']::text[]
  );
