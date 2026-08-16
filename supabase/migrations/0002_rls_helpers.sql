-- 0002_rls_helpers.sql
-- SECURITY DEFINER helper functions used by the RLS policies in
-- 0003_rls_policies.sql.
--
-- Why SECURITY DEFINER: a policy on, say, `submissions` that queried
-- `memberships` directly would trigger memberships' own RLS policies during
-- evaluation, which query memberships again, and so on -- exactly the
-- recursive-policy trap this file exists to avoid. These functions run with
-- the definer's privileges (bypassing RLS on the tables they read) so any
-- policy can call them without ever re-entering RLS evaluation.
--
-- Every function below:
--   - is STABLE (safe to call multiple times per statement, enables the
--     planner to cache/inline it)
--   - sets `search_path = ''` and fully qualifies every identifier, so it
--     cannot be hijacked by a malicious search_path (the standard Supabase
--     SECURITY DEFINER hardening pattern)
--   - resolves the acting user exclusively from auth.uid() (the JWT the
--     platform verified), never from a caller-supplied user/profile id --
--     so a policy built on these functions can never be tricked into
--     checking someone else's access
--   - takes only an organization_id parameter, and that value is always the
--     row's own stored organization_id column in the policy that calls it,
--     never a raw client input the row hasn't already been matched against

create or replace function public.get_organization_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.profile_id = auth.uid()
  limit 1;
$$;

comment on function public.get_organization_role(uuid) is
  'Role (owner/admin/member) of the authenticated user in the given org, or '
  'NULL if not a member. SECURITY DEFINER to read memberships without '
  'recursing into its own RLS policies.';

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
  );
$$;

create or replace function public.is_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_organization_role(p_organization_id) in ('owner', 'admin');
$$;

create or replace function public.is_organization_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_organization_role(p_organization_id) = 'owner';
$$;

create or replace function public.is_organization_customer(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customers c
    where c.organization_id = p_organization_id
      and c.profile_id = auth.uid()
  );
$$;

create or replace function public.has_organization_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_organization_member(p_organization_id)
      or public.is_organization_customer(p_organization_id);
$$;

comment on function public.has_organization_access(uuid) is
  'True if the authenticated user is either a team member or a customer of '
  'the org -- i.e. has some legitimate, non-anonymous relationship to it.';

create or replace function public.is_portal_public(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ps.is_public
      from public.portal_settings ps
      where ps.organization_id = p_organization_id
    ),
    false
  );
$$;

comment on function public.is_portal_public(uuid) is
  'True only if the org has a portal_settings row with is_public = true. '
  'Governs anonymous (not-logged-in-or-unrelated) access; team members and '
  'customers get access independent of this flag -- see 0003_rls_policies.sql.';
