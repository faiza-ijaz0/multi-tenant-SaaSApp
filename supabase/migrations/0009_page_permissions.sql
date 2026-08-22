-- 0009_page_permissions.sql
-- NOT APPLIED. Prepared for review per the Phase 14 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- Authorization today is exactly one axis: memberships.role (owner/admin/
-- member). Every admin sees and can manage every admin-gated resource in
-- their org; every member sees whatever a plain member can see. Phase 14
-- adds a second, orthogonal axis -- per-membership, per-dashboard-page
-- grants -- so an owner/admin can restrict which of the seven real dashboard
-- pages a given admin or member can even reach, independent of their role.
--
-- Page visibility and CRUD authority remain separate concepts (unchanged by
-- this migration): having the 'categories' page permission makes the
-- Categories page and its data reachable, it does not by itself grant
-- create/update/delete -- categories_insert_admin/_update_admin/_delete_admin
-- still require the caller be an admin/owner, same as today. This migration
-- only adds the visibility gate on top.
--
-- ---------------------------------------------------------------------------
-- WHY A NORMALIZED TABLE, NOT A JSONB/ARRAY COLUMN ON memberships
-- ---------------------------------------------------------------------------
-- A jsonb or text[] column on memberships would still need the same
-- CHECK-constrained allowlist and the same RLS reasoning, but a real table
-- gets tenant-scoping for free: membership_id -> memberships.organization_id
-- makes it structurally impossible for a permission row to apply to any
-- organization other than the one its membership belongs to, without a
-- composite FK -- the same "structural, not just RLS-enforced" isolation
-- 0001_initial_schema.sql already uses for categories/statuses via
-- (organization_id, id) composite FKs on submissions.
--
-- ---------------------------------------------------------------------------
-- THE SEVEN PAGE KEYS
-- ---------------------------------------------------------------------------
-- Derived strictly from real routes in app/dashboard/ (no invented pages):
--   dashboard        -> /dashboard, /dashboard/submissions/[id]
--   categories       -> /dashboard/categories
--   statuses         -> /dashboard/statuses
--   members          -> /dashboard/members (also covers invitation
--                        management -- there is no separate invitations route)
--   activity         -> /dashboard/activity
--   settings         -> /dashboard/settings
--   portal_settings  -> /dashboard/settings/portal
-- Notifications has no dedicated route (bell dropdown only) -- excluded.
--
-- ---------------------------------------------------------------------------
-- SELF-ACCESS CARVE-OUTS (the part most likely to be missed)
-- ---------------------------------------------------------------------------
-- memberships_select_member today lets any org member read the whole
-- roster; that's also how lib/auth/organization.ts's listUserMemberships()
-- resolves a caller's OWN memberships across every org they belong to --
-- which lib/auth/context.ts's getTenantScope() depends on for every single
-- request. Naively AND-ing has_page_permission(organization_id, 'members')
-- into memberships_select_member would make a member without the Members
-- page permission unable to read their OWN membership row, breaking org
-- resolution and login entirely for that user. Every policy below that
-- gates on 'members' therefore keeps an explicit "or this is my own row"
-- branch. membership_page_permissions itself has the same requirement (a
-- user must always be able to read their own permission grants, to know
-- what they can access, independent of whether they have the 'members'
-- page permission) and gets the identical carve-out.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - owner bypasses every has_page_permission check with zero rows present
--   - admin/member with a page permission can reach that page's data;
--     without it, reads return empty and mutations are rejected (42501-style
--     RLS denial, i.e. the affected-row-count-is-zero pattern already used
--     throughout features/*/actions.ts)
--   - a member/admin can always read their own memberships row and their own
--     membership_page_permissions rows regardless of the 'members' grant
--   - a non-owner cannot modify their own permission rows (self-escalation)
--   - an admin without 'members' cannot grant/revoke any permission, even
--     their own or another member's
--   - permissions granted in org A never satisfy has_page_permission for org B
--   - accept_invitation (extended below) materializes exactly the pending
--     invitation's page_permissions, and only valid, allow-listed page keys
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.membership_page_permissions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  page text not null,
  created_at timestamptz not null default now(),
  constraint membership_page_permissions_page_check
    check (page in ('dashboard', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings')),
  constraint membership_page_permissions_unique unique (membership_id, page)
);

create index membership_page_permissions_membership_id_idx
  on public.membership_page_permissions (membership_id);

comment on table public.membership_page_permissions is
  'Per-membership grants for which dashboard pages a non-owner may access. '
  'Owners bypass this table entirely (see has_page_permission below) and '
  'never need rows here. Visibility gate only -- CRUD authority within a '
  'page is still governed by the existing role-based policies.';

alter table public.membership_page_permissions enable row level security;

-- Pending invitations carry their intended page grants until accepted.
alter table public.invitations
  add column page_permissions text[] not null default '{}'::text[];

alter table public.invitations
  add constraint invitations_page_permissions_check
  check (
    page_permissions <@ array['dashboard', 'categories', 'statuses', 'members', 'activity', 'settings', 'portal_settings']::text[]
  );

comment on column public.invitations.page_permissions is
  'Page keys to grant on acceptance, materialized into '
  'membership_page_permissions by accept_invitation(). Ignored/irrelevant '
  'for owner-role invitations (there are none -- invitations can never grant '
  'owner, see 0005_invitation_acceptance.sql).';

-- ---------------------------------------------------------------------------
-- Helper functions (same SECURITY DEFINER / STABLE / search_path='' shape as
-- 0002_rls_helpers.sql)
-- ---------------------------------------------------------------------------
create or replace function public.has_page_permission(p_organization_id uuid, p_page text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_organization_owner(p_organization_id)
    or exists (
      select 1
      from public.membership_page_permissions pp
      join public.memberships m on m.id = pp.membership_id
      where m.organization_id = p_organization_id
        and m.profile_id = auth.uid()
        and pp.page = p_page
    );
$$;

comment on function public.has_page_permission(uuid, text) is
  'True if the authenticated user is the org owner (unconditional bypass) '
  'or holds an explicit membership_page_permissions grant for p_page in '
  'that org. Page-visibility gate only -- does not imply CRUD authority.';

create or replace function public.can_manage_membership_permissions(p_membership_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_role text;
  v_profile_id uuid;
begin
  select organization_id, role, profile_id
  into v_organization_id, v_role, v_profile_id
  from public.memberships
  where id = p_membership_id;

  if v_organization_id is null then
    return false;
  end if;

  -- Owners never hold permission rows and bypass has_page_permission
  -- unconditionally; nothing to manage on their row.
  if v_role = 'owner' then
    return false;
  end if;

  -- Self-escalation guard, mirroring updateMemberRoleForOrganization's
  -- existing "you can't change your own role" rule in
  -- features/members/membership.ts.
  if v_profile_id = auth.uid() then
    return false;
  end if;

  return public.is_organization_admin(v_organization_id)
    and public.has_page_permission(v_organization_id, 'members');
end;
$$;

comment on function public.can_manage_membership_permissions(uuid) is
  'True if the caller may add/change/remove page-permission grants on the '
  'given membership: caller must be an admin/owner with the members page '
  'permission themselves, the target must not be the owner, and the target '
  'must not be the caller''s own membership row.';

-- ---------------------------------------------------------------------------
-- RLS: membership_page_permissions
-- ---------------------------------------------------------------------------
create policy membership_page_permissions_select on public.membership_page_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_page_permissions.membership_id
        and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.memberships m
      where m.id = membership_page_permissions.membership_id
        and public.is_organization_member(m.organization_id)
        and public.has_page_permission(m.organization_id, 'members')
    )
  );

create policy membership_page_permissions_insert on public.membership_page_permissions
  for insert
  to authenticated
  with check (public.can_manage_membership_permissions(membership_id));

create policy membership_page_permissions_update on public.membership_page_permissions
  for update
  to authenticated
  using (public.can_manage_membership_permissions(membership_id))
  with check (public.can_manage_membership_permissions(membership_id));

create policy membership_page_permissions_delete on public.membership_page_permissions
  for delete
  to authenticated
  using (public.can_manage_membership_permissions(membership_id));

-- ---------------------------------------------------------------------------
-- Extend existing policies with the 'members' / 'activity' / 'categories' /
-- 'statuses' / 'settings' / 'portal_settings' gates. Every replacement below
-- adds exactly one AND has_page_permission(...) clause (or, where a
-- self-access carve-out is required, one additional OR branch) to the
-- policy's existing condition -- no other condition changes. Owners satisfy
-- has_page_permission() unconditionally, so none of this narrows owner
-- access.
-- ---------------------------------------------------------------------------

-- memberships: roster visibility and management gated by 'members', with
-- the self-row carve-out explained above. is_organization_admin(...) alone
-- (used for INSERT/UPDATE) already implies has_page_permission would also
-- need to be satisfied since owners always pass it and admins now must
-- explicitly hold the grant.
drop policy memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      public.is_organization_member(organization_id)
      and public.has_page_permission(organization_id, 'members')
    )
  );

drop policy memberships_insert_admin on public.memberships;
create policy memberships_insert_admin on public.memberships
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  );

drop policy memberships_update_admin on public.memberships;
create policy memberships_update_admin on public.memberships
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  )
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  );

-- Self-leave ("remove myself from an org") must keep working regardless of
-- the 'members' grant -- only the admin-removes-someone-else branch is
-- permission-gated.
drop policy memberships_delete_admin_or_self on public.memberships;
create policy memberships_delete_admin_or_self on public.memberships
  for delete
  to authenticated
  using (
    (
      public.is_organization_admin(organization_id)
      and public.has_page_permission(organization_id, 'members')
    )
    or profile_id = auth.uid()
  );

-- invitations: no self-row concept (an invitee previews/accepts through the
-- SECURITY DEFINER RPCs, which bypass RLS entirely) -- straightforward AND.
drop policy invitations_select_admin on public.invitations;
create policy invitations_select_admin on public.invitations
  for select
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  );

drop policy invitations_insert_admin on public.invitations;
create policy invitations_insert_admin on public.invitations
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
    and created_by = auth.uid()
  );

drop policy invitations_update_admin on public.invitations;
create policy invitations_update_admin on public.invitations
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  )
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  );

drop policy invitations_delete_admin on public.invitations;
create policy invitations_delete_admin on public.invitations
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'members')
  );

-- audit_events: read gated by 'activity'. Insert stays admin-only exactly
-- as today (an admin logging their own action doesn't need the activity
-- *page* permission to be visible in the log -- the same way it doesn't
-- need any other page permission to perform the action itself).
drop policy audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin on public.audit_events
  for select
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'activity')
  );

-- categories: management gated by 'categories'. Select is untouched --
-- it already serves customers and the public portal, which are orthogonal
-- to an org member's dashboard page grants.
drop policy categories_insert_admin on public.categories;
create policy categories_insert_admin on public.categories
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'categories')
  );

drop policy categories_update_admin on public.categories;
create policy categories_update_admin on public.categories
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'categories')
  )
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'categories')
  );

drop policy categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'categories')
  );

-- statuses: same shape as categories.
drop policy statuses_insert_admin on public.statuses;
create policy statuses_insert_admin on public.statuses
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'statuses')
  );

drop policy statuses_update_admin on public.statuses;
create policy statuses_update_admin on public.statuses
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'statuses')
  )
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'statuses')
  );

drop policy statuses_delete_admin on public.statuses;
create policy statuses_delete_admin on public.statuses
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'statuses')
  );

-- portal_settings: management gated by 'portal_settings'. Select untouched
-- (already serves the public portal itself).
drop policy portal_settings_insert_admin on public.portal_settings;
create policy portal_settings_insert_admin on public.portal_settings
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'portal_settings')
  );

drop policy portal_settings_update_admin on public.portal_settings;
create policy portal_settings_update_admin on public.portal_settings
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'portal_settings')
  )
  with check (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'portal_settings')
  );

drop policy portal_settings_delete_admin on public.portal_settings;
create policy portal_settings_delete_admin on public.portal_settings
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and public.has_page_permission(organization_id, 'portal_settings')
  );

-- organizations: editing (name, etc.) gated by 'settings'. Delete stays
-- owner-only, untouched -- has_page_permission is irrelevant there since
-- organizations_delete_owner never checked is_organization_admin to begin
-- with.
drop policy organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update
  to authenticated
  using (
    public.is_organization_admin(id)
    and public.has_page_permission(id, 'settings')
  )
  with check (
    public.is_organization_admin(id)
    and public.has_page_permission(id, 'settings')
  );

-- ---------------------------------------------------------------------------
-- accept_invitation: superseding 0005_invitation_acceptance.sql's version
-- (not yet applied) to also materialize invitations.page_permissions into
-- membership_page_permissions for a brand-new membership. Every check from
-- the 0005 version is preserved verbatim; the only addition is the loop at
-- the end, and only when a new membership was actually created (an invitee
-- who already had a membership in this org keeps whatever permissions they
-- already had -- an invitation never downgrades or overwrites an existing
-- member's grants).
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns table (organization_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_email text;
  v_token_hash text;
  v_invitation record;
  v_membership_id uuid;
  v_created_membership boolean := false;
  v_page text;
begin
  v_caller_id := auth.uid();
  v_caller_email := auth.email();
  if v_caller_id is null or v_caller_email is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_token is null or length(p_token) = 0 then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select i.id, i.organization_id, i.email, i.role, i.expires_at, i.accepted_at, i.page_permissions
  into v_invitation
  from public.invitations i
  where i.token_hash = v_token_hash
  for update;

  if v_invitation.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception 'invitation already accepted' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'invitation expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) is distinct from lower(v_caller_email) then
    raise exception 'invitation is for a different email address' using errcode = '42501';
  end if;
  if v_invitation.role = 'owner' then
    raise exception 'invitations cannot grant ownership -- use ownership transfer instead'
      using errcode = '42501';
  end if;

  insert into public.profiles (id) values (v_caller_id)
  on conflict (id) do nothing;

  select m.id into v_membership_id
  from public.memberships m
  where m.organization_id = v_invitation.organization_id
    and m.profile_id = v_caller_id;

  if v_membership_id is null then
    insert into public.memberships (id, organization_id, profile_id, role)
    values (gen_random_uuid(), v_invitation.organization_id, v_caller_id, v_invitation.role)
    returning id into v_membership_id;
    v_created_membership := true;
  end if;

  if v_created_membership then
    foreach v_page in array coalesce(v_invitation.page_permissions, array[]::text[])
    loop
      insert into public.membership_page_permissions (membership_id, page)
      values (v_membership_id, v_page)
      on conflict (membership_id, page) do nothing;
    end loop;
  end if;

  update public.invitations
  set accepted_at = now()
  where id = v_invitation.id;

  return query select v_invitation.organization_id, v_invitation.role;
end;
$$;

comment on function public.accept_invitation(text) is
  'The only sanctioned way an invitation becomes a membership. Derives '
  'caller identity from auth.uid()/auth.email() only. Locks the invitation '
  'row (FOR UPDATE) so two concurrent accept attempts cannot both succeed. '
  'Refuses to grant role=owner under any circumstance. On first acceptance '
  '(new membership only), materializes invitations.page_permissions into '
  'membership_page_permissions -- an already-existing member''s grants are '
  'never touched by accepting a second invitation.';

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;
