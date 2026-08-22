-- 0014_member_account_creation.sql
-- NOT APPLIED to any project until explicitly run. Prepared for review per
-- the Phase 15 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP THIS CLOSES (found during Phase 15 research, not introduced by it)
-- ---------------------------------------------------------------------------
-- memberships_insert_admin (0003, extended by 0013) checks only
-- has_page_permission(org, 'members') AND has_action_permission(org,
-- 'members:invite') -- it never inspects the `role` column being inserted.
-- Contrast with enforce_membership_role_invariants (0004, applied live),
-- which already blocks a non-owner from granting the owner role via
-- UPDATE. Nothing symmetrical exists for INSERT: today, any admin holding
-- members:invite could already insert a brand-new membership row with
-- role='owner' directly against PostgREST, with no owner-only check at all.
-- This was reachable but unused before Phase 15 (no code path inserted
-- memberships directly with a client-chosen role). Phase 15 adds exactly
-- that code path (direct member/account creation with an admin-chosen
-- role, including 'owner' -- see create_member_account below), which is
-- the first time an authenticated request can reach this gap on purpose.
-- Confirmed live via `select polname, pg_get_expr(polwithcheck, polrelid)
-- from pg_policy where polrelid = 'public.memberships'::regclass and
-- polname = 'memberships_insert_admin'` against project
-- mosczhxreynyoeneztfm before writing this migration.
--
-- ---------------------------------------------------------------------------
-- THE FIX: a BEFORE INSERT trigger, symmetrical to 0004's BEFORE UPDATE one
-- ---------------------------------------------------------------------------
-- enforce_membership_owner_insert_protection: if the new row's role is
-- 'owner' AND the organization already has at least one membership row
-- (i.e. this is not the very first, bootstrap membership -- see
-- memberships_insert_bootstrap_owner, 0003, whose own WITH CHECK already
-- guarantees zero existing rows and profile_id = auth.uid() for that one
-- case), the caller must already be an owner of that organization. This is
-- the same invariant 0004 already enforces for role changes via UPDATE,
-- applied to INSERT for the first time. Every other insert path
-- (bootstrap, or role in ('admin','member')) is completely unaffected.
--
-- WHY THIS IS SAFE, NOT A WEAKENING:
--   - Does not change who may see/create memberships at all -- RLS
--     (memberships_insert_admin, unmodified) is still evaluated first, and
--     still requires has_page_permission/has_action_permission exactly as
--     before. This trigger only adds a role-specific check on top, exactly
--     mirroring 0004's own reasoning for UPDATE.
--   - Bootstrap org creation (lib/auth/organization.ts's
--     createOrganizationForUser, and every existing RLS/onboarding
--     integration test) is unaffected: a brand-new org has zero membership
--     rows at insert time, so the "organization already has a membership"
--     condition is false and the check is skipped entirely.
--   - accept_invitation() and create_member_account() (below) are both
--     SECURITY DEFINER, but triggers fire regardless of the calling
--     function's privilege level, and auth.uid() inside a trigger still
--     reads the real caller's JWT claim (SECURITY DEFINER elevates table
--     privilege, not identity) -- so this trigger applies to every INSERT
--     path uniformly, direct or via RPC.
--
-- ---------------------------------------------------------------------------
-- create_member_account: the only sanctioned way to create a member's
-- profile + membership + initial page/action grants in one call
-- ---------------------------------------------------------------------------
-- Phase 15 replaces "invite by link" with direct account creation
-- (name + email + password + role + pages + actions, immediately usable at
-- /login). The Supabase Auth user itself (with the admin-chosen password)
-- can only be created via the Auth Admin API (supabase.auth.admin.createUser),
-- which requires the service-role key and is therefore called from the
-- server action (features/members/create-account.ts), never from SQL --
-- there is no way to set a user's password from a plain Postgres function.
-- Once that call returns a new auth.users id, this RPC is what turns it
-- into a real, permissioned member of the calling organization: it is
-- called by the ACTOR's own authenticated (non-service-role) client, so
-- every check below runs as that real user, not as an elevated bypass.
--
-- WHY AN RPC, NOT A DIRECT MULTI-TABLE INSERT FROM THE SERVER ACTION:
--   - profiles_insert_own requires id = auth.uid() -- the actor cannot
--     insert a profiles row for someone else's id through ordinary RLS.
--     Exactly the same structural problem accept_invitation (0005) already
--     solves for invitation-based membership creation; this is that same
--     solution applied to direct creation.
--   - Bundling profile + membership + page grants + action grants into one
--     SECURITY DEFINER call makes the whole operation atomic (single
--     transaction, single statement from the caller's perspective) --
--     a partial failure (e.g. an invalid page key) leaves nothing behind
--     for the server action to have to clean up beyond the already-created
--     auth user (which it does, on any error from this RPC -- see the
--     server action).
--
-- AUTHORIZATION, ALL SERVER-SIDE, NONE OF IT TRUSTED FROM THE CLIENT:
--   - p_organization_id is NEVER the organization the RPC trusts for
--     authorization -- it re-derives the caller's real role in that org via
--     is_organization_admin/is_organization_owner, which read auth.uid()
--     internally. A caller who is not actually a member of p_organization_id
--     fails has_page_permission/has_action_permission (both false for a
--     non-member) and is rejected.
--   - p_role = 'owner' additionally requires is_organization_owner(caller).
--     Combined with enforce_membership_owner_insert_protection above, this
--     is checked twice, independently, at two different layers.
--   - p_pages/p_actions are constrained by membership_page_permissions'/
--     membership_action_permissions' own existing CHECK constraints
--     (0009/0013) -- an invalid key errors the whole transaction rather
--     than silently being dropped or accepted.
--
-- ---------------------------------------------------------------------------
-- update_member_profile: the only sanctioned way for an admin/owner to
-- rename ANOTHER member's profile (full_name)
-- ---------------------------------------------------------------------------
-- profiles_update_own only allows a caller to update their OWN row --
-- there is no existing policy letting an admin rename a co-member's
-- profile. Email changes for another user go through the Auth Admin API
-- from the server action (same reasoning as account creation -- no SQL
-- path can reach auth.users' email column safely); this RPC covers the
-- one field (full_name) that legitimately lives in `profiles` and is safe
-- to change here. Reuses can_manage_membership_permissions' exact
-- authorization shape (0013) -- admin/owner with roles_permissions:assign_role
-- (the same grant already required to change this member's role, since
-- this RPC is invoked from the same combined Edit Member form), target not
-- self, target not owner unless caller is owner.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - bootstrap org creation is completely unaffected (existing onboarding
--     tests must still pass unmodified)
--   - an admin (members:invite + 'members' page) can create a new member
--     with role='admin' or role='member', chosen pages, chosen actions
--   - an admin (not owner) attempting to create a member with role='owner'
--     is rejected, both via the RPC's own check and via the INSERT trigger
--     if that check were ever bypassed
--   - an owner CAN create a new member with role='owner' -- multiple
--     owners coexist afterward, no invariant blocks this
--   - a caller without members:invite/the 'members' page cannot call the
--     RPC successfully, even naming their own real organization_id
--   - a caller cannot create a member in an organization they don't belong
--     to at all
--   - invalid page/action keys are rejected, not silently dropped
--   - update_member_profile: same admin/owner + roles_permissions:assign_role
--     gate as role changes; rejects self-target and non-owner-targeting-owner,
--     mirroring can_manage_membership_permissions exactly
-- ---------------------------------------------------------------------------

create or replace function public.enforce_membership_owner_insert_protection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role text;
begin
  if new.role = 'owner' then
    if exists (select 1 from public.memberships where organization_id = new.organization_id) then
      acting_role := public.get_organization_role(new.organization_id);
      if acting_role is distinct from 'owner' then
        raise exception 'only an owner can grant the owner role' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_membership_owner_insert_protection() is
  'BEFORE INSERT trigger on public.memberships. Blocks inserting a new '
  'owner-role row unless the caller is already an owner of that '
  'organization, or this is the organization''s very first membership row '
  '(bootstrap). Symmetrical to enforce_membership_role_invariants (0004), '
  'which enforces the same rule for UPDATE.';

drop trigger if exists enforce_membership_owner_insert_protection on public.memberships;
create trigger enforce_membership_owner_insert_protection
  before insert on public.memberships
  for each row execute function public.enforce_membership_owner_insert_protection();

create or replace function public.create_member_account(
  p_organization_id uuid,
  p_profile_id uuid,
  p_full_name text,
  p_role text,
  p_pages text[],
  p_actions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_membership_id uuid;
  v_page text;
  v_action_key text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null or p_profile_id is null then
    raise exception 'organization_id and profile_id are required' using errcode = '22023';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  if not (
    public.has_page_permission(p_organization_id, 'members')
    and public.has_action_permission(p_organization_id, 'members:invite')
  ) then
    raise exception 'you do not have permission to create members in this organization'
      using errcode = '42501';
  end if;

  if p_role = 'owner' and not public.is_organization_owner(p_organization_id) then
    raise exception 'only an owner can create another owner' using errcode = '42501';
  end if;

  insert into public.profiles (id, full_name)
  values (p_profile_id, nullif(btrim(coalesce(p_full_name, '')), ''))
  on conflict (id) do update set full_name = excluded.full_name;

  insert into public.memberships (id, organization_id, profile_id, role)
  values (gen_random_uuid(), p_organization_id, p_profile_id, p_role)
  returning id into v_membership_id;

  foreach v_page in array coalesce(p_pages, array[]::text[])
  loop
    insert into public.membership_page_permissions (membership_id, page)
    values (v_membership_id, v_page)
    on conflict (membership_id, page) do nothing;
  end loop;

  foreach v_action_key in array coalesce(p_actions, array[]::text[])
  loop
    insert into public.membership_action_permissions (membership_id, permission_key)
    values (v_membership_id, v_action_key)
    on conflict (membership_id, permission_key) do nothing;
  end loop;

  return v_membership_id;
end;
$$;

comment on function public.create_member_account(uuid, uuid, text, text, text[], text[]) is
  'The only sanctioned way to turn a freshly-created auth.users id (created '
  'separately via the Auth Admin API, which this function cannot reach) '
  'into a real organization member: profile + membership + initial page/'
  'action grants, in one transaction. Caller identity is auth.uid() only, '
  'never a parameter. p_role=''owner'' additionally requires the caller '
  'already be an owner -- backstopped independently by '
  'enforce_membership_owner_insert_protection above. Never trusts '
  'p_organization_id for authorization beyond using it as the lookup key '
  'for the caller''s own real grants.';

revoke all on function public.create_member_account(uuid, uuid, text, text, text[], text[]) from public;
grant execute on function public.create_member_account(uuid, uuid, text, text, text[], text[]) to authenticated;

create or replace function public.update_member_profile(
  p_membership_id uuid,
  p_full_name text
)
returns void
language plpgsql
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
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_profile_id = auth.uid() then
    raise exception 'use your own account settings to edit your own profile' using errcode = '42501';
  end if;

  if v_role = 'owner' and not public.is_organization_owner(v_organization_id) then
    raise exception 'only an owner can edit another owner''s profile' using errcode = '42501';
  end if;

  if not (
    public.is_organization_admin(v_organization_id)
    and public.has_page_permission(v_organization_id, 'members')
    and public.has_action_permission(v_organization_id, 'roles_permissions:assign_role')
  ) then
    raise exception 'you do not have permission to edit this member' using errcode = '42501';
  end if;

  update public.profiles
  set full_name = nullif(btrim(coalesce(p_full_name, '')), '')
  where id = v_profile_id;
end;
$$;

comment on function public.update_member_profile(uuid, text) is
  'The only sanctioned way for an admin/owner to rename ANOTHER member''s '
  'profile. Same authorization shape as can_manage_membership_permissions '
  '(0013): admin/owner holding roles_permissions:assign_role, target not '
  'self, target not owner unless caller is owner. Email changes for '
  'another user go through the Auth Admin API in the server action -- no '
  'SQL function can reach auth.users.email safely.';

revoke all on function public.update_member_profile(uuid, text) from public;
grant execute on function public.update_member_profile(uuid, text) to authenticated;
