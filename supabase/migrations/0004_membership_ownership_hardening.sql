-- 0004_membership_ownership_hardening.sql
-- NOT APPLIED. Prepared for review per the Phase 10 approval gate.
--
-- Closes the gap documented in the Phase 9 report and re-verified in
-- Phase 10 Part A: memberships_update_admin and memberships_delete_admin_or_self
-- (0003_rls_policies.sql) only check that the caller is an admin/owner of
-- the organization -- neither restricts which role can be set, protects a
-- currently-owner row, or stops profile_id from being rewritten. The
-- application layer (features/members/membership.ts) already guards the
-- one path that goes through this app, but a caller with valid admin
-- credentials calling PostgREST directly is not protected by any of that.
--
-- This migration does not touch existing RLS policies -- it adds triggers
-- on top of them (both layers must agree for a write to succeed) plus one
-- new SECURITY DEFINER RPC that is the only sanctioned way to change who
-- owns an organization.

-- ---------------------------------------------------------------------------
-- Trigger 1: identity + owner-role invariants on UPDATE.
--
-- Why a trigger and not a tighter WITH CHECK: WITH CHECK only ever sees the
-- proposed NEW row. Expressing "reject this only if the row's OLD role was
-- owner" would require a self-referencing subquery back into memberships,
-- which is exactly the recursive-RLS-evaluation trap 0002_rls_helpers.sql's
-- SECURITY DEFINER helper functions exist to avoid. A BEFORE UPDATE trigger
-- sees OLD and NEW directly with no such recursion risk.
--
-- Why SECURITY DEFINER: the "at least one owner remains" check below counts
-- OTHER rows in the same organization. The calling admin can already see
-- those rows today via memberships_select_member, so this isn't expanding
-- visibility -- it's the same SECURITY DEFINER-to-avoid-recursion pattern
-- used by public.get_organization_role itself, applied consistently.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_membership_role_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role text;
  remaining_owners integer;
begin
  if new.profile_id is distinct from old.profile_id then
    raise exception 'membership profile_id cannot be changed'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    -- public.transfer_organization_ownership() below sets this flag,
    -- transaction-locally, for the duration of its own already-validated
    -- writes -- so its two coupled UPDATEs (promote new owner, demote the
    -- caller) aren't blocked by the same rule that blocks everyone else
    -- from touching the owner role directly. Nothing else may set it:
    -- ordinary client requests never run inside that function.
    if coalesce(current_setting('app.membership_trusted_transfer', true), 'false') = 'true' then
      return new;
    end if;

    acting_role := public.get_organization_role(old.organization_id);

    if old.role = 'owner' or new.role = 'owner' then
      if acting_role is distinct from 'owner' then
        raise exception 'only an owner can change the owner role'
          using errcode = '42501';
      end if;
    end if;

    if old.role = 'owner' and new.role is distinct from 'owner' then
      select count(*) into remaining_owners
      from public.memberships
      where organization_id = old.organization_id
        and role = 'owner'
        and id <> old.id;

      if remaining_owners = 0 then
        raise exception 'organization must always have at least one owner'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_membership_role_invariants() is
  'BEFORE UPDATE trigger on public.memberships. Blocks profile_id reassignment '
  'and blocks any owner-role grant/revoke except through '
  'transfer_organization_ownership() or by an existing owner acting on a '
  'non-owner row (e.g. an owner directly demoting a co-owner, which does not '
  'need the transfer RPC since it does not need to atomically promote anyone).';

drop trigger if exists enforce_membership_role_invariants on public.memberships;
create trigger enforce_membership_role_invariants
  before update on public.memberships
  for each row execute function public.enforce_membership_role_invariants();

-- ---------------------------------------------------------------------------
-- Trigger 2: owner-row delete protection.
--
-- Kept separate from the UPDATE trigger above (rather than folded into a
-- single generic function) because DELETE has no NEW row and a different
-- failure message is clearer for admins using the "Remove member" feature.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_membership_owner_delete_protection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_role text;
  remaining_owners integer;
begin
  if old.role = 'owner' then
    acting_role := public.get_organization_role(old.organization_id);
    if acting_role is distinct from 'owner' then
      raise exception 'the organization owner cannot be removed by a non-owner'
        using errcode = '42501';
    end if;

    select count(*) into remaining_owners
    from public.memberships
    where organization_id = old.organization_id
      and role = 'owner'
      and id <> old.id;

    if remaining_owners = 0 then
      raise exception 'organization must always have at least one owner'
        using errcode = '23514';
    end if;
  end if;

  return old;
end;
$$;

comment on function public.enforce_membership_owner_delete_protection() is
  'BEFORE DELETE trigger on public.memberships. Blocks removing an owner row '
  'unless the caller is themselves an owner AND at least one other owner row '
  'would remain afterward -- so the org can never end up with zero owners, '
  'whether via a non-owner deleting the owner or the sole owner deleting '
  'themselves.';

drop trigger if exists enforce_membership_owner_delete_protection on public.memberships;
create trigger enforce_membership_owner_delete_protection
  before delete on public.memberships
  for each row execute function public.enforce_membership_owner_delete_protection();

-- ---------------------------------------------------------------------------
-- RPC: the only sanctioned way to transfer ownership.
--
-- Atomically promotes the target membership to 'owner' and demotes the
-- caller's own current-owner membership to 'admin', inside one function
-- call -- avoiding the two-separate-UPDATE-statement ordering hazard that
-- would otherwise be needed to satisfy the "at least one owner" invariant
-- above (promoting first, then demoting, must happen in that order and
-- within one transaction; a client issuing two independent requests cannot
-- be trusted to do this correctly or atomically).
--
-- Phase 10A fix: the organization is now derived from the TARGET membership
-- first, not from an unscoped "any owner row belonging to auth.uid()"
-- lookup. The previous version picked an arbitrary organization when the
-- caller owned more than one (LIMIT 1, no ORDER BY, no organization_id
-- filter) -- the schema allows this freely (organizations_insert_authenticated
-- lets any authenticated user found unlimited orgs), so that ambiguity was
-- a real, reachable bug, not a hypothetical.
--
-- Derives every identity from server-side state only:
--   - the caller from auth.uid() (never a parameter)
--   - the organization from the target membership row (the one unambiguous
--     anchor: id is a primary key)
--   - the caller's own membership resolved *within that same organization*,
--     never from an unscoped lookup across all organizations they belong to
-- Never accepts an organization_id, profile_id, or role parameter.
--
-- Locking: an initial unlocked read determines which two membership rows
-- are involved (that requires knowing the target's organization before the
-- caller's membership in it can even be looked up) purely to establish lock
-- *order* -- it is not trusted for any authorization decision. Both rows
-- are then locked in a deterministic order (the smaller uuid first, by the
-- built-in uuid ordering), so two transfers touching the same pair of rows
-- in opposite directions (owner A transfers to B's row while owner B
-- simultaneously transfers to A's row) always acquire their locks in the
-- same global order and cannot deadlock against each other. Every value
-- used for an actual authorization or business-rule decision is re-read
-- from the now-locked rows afterward -- the initial peek is never trusted
-- on its own, since it can be stale by the time the locks are acquired.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_organization_ownership(p_new_owner_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_membership_id uuid;
  v_target_organization_id uuid;
  v_caller_organization_id uuid;
  v_target_role text;
  v_caller_role text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_new_owner_membership_id is null then
    raise exception 'target member not found' using errcode = 'P0002';
  end if;

  -- Unlocked peek: identify which organization is in play, and which of
  -- the caller's own memberships (if any) belongs to it. Used only to
  -- determine lock order below -- not trusted for authorization, since it
  -- is re-verified in full once both rows are actually locked.
  select organization_id into v_target_organization_id
  from public.memberships
  where id = p_new_owner_membership_id;

  if v_target_organization_id is null then
    raise exception 'target member not found' using errcode = 'P0002';
  end if;

  select id into v_caller_membership_id
  from public.memberships
  where organization_id = v_target_organization_id
    and profile_id = v_caller_id;

  if v_caller_membership_id is null then
    raise exception 'only an organization owner can transfer ownership'
      using errcode = '42501';
  end if;

  if p_new_owner_membership_id = v_caller_membership_id then
    raise exception 'you are already the owner' using errcode = '22023';
  end if;

  if p_new_owner_membership_id < v_caller_membership_id then
    select organization_id, role into v_target_organization_id, v_target_role
    from public.memberships where id = p_new_owner_membership_id for update;

    select organization_id, role into v_caller_organization_id, v_caller_role
    from public.memberships where id = v_caller_membership_id for update;
  else
    select organization_id, role into v_caller_organization_id, v_caller_role
    from public.memberships where id = v_caller_membership_id for update;

    select organization_id, role into v_target_organization_id, v_target_role
    from public.memberships where id = p_new_owner_membership_id for update;
  end if;

  -- Authoritative re-verification against the now-locked rows -- the
  -- unlocked peek above is never trusted directly, only used to find these
  -- two ids. Anything could have changed in between (a concurrent transfer,
  -- removal, or demotion), so every business rule is re-checked here.
  if v_target_organization_id is null then
    raise exception 'target member not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'this member is already the owner' using errcode = '22023';
  end if;
  if v_caller_role is distinct from 'owner' then
    raise exception 'only an organization owner can transfer ownership'
      using errcode = '42501';
  end if;
  if v_caller_organization_id is distinct from v_target_organization_id then
    -- Structurally shouldn't be reachable given how v_caller_membership_id
    -- was derived (scoped to v_target_organization_id above), but checked
    -- explicitly rather than assumed.
    raise exception 'target member does not belong to your organization'
      using errcode = '42501';
  end if;

  -- Bypasses enforce_membership_role_invariants' owner-role checks for
  -- exactly these two writes (see that function, above). Kept deliberately
  -- even though tracing through shows the natural promote-then-demote
  -- statement order would likely satisfy the trigger's own checks on their
  -- own: relying on that would couple this function's correctness to the
  -- trigger's exact internal logic and evaluation order, both of which are
  -- separate code that could change independently. The flag makes this
  -- function self-contained -- its own re-verification above is the sole
  -- source of truth for whether the transfer is valid, not an incidental
  -- side effect of statement ordering.
  perform set_config('app.membership_trusted_transfer', 'true', true);

  update public.memberships set role = 'owner' where id = p_new_owner_membership_id;
  update public.memberships set role = 'admin' where id = v_caller_membership_id;

  perform set_config('app.membership_trusted_transfer', 'false', true);
end;
$$;

comment on function public.transfer_organization_ownership(uuid) is
  'The only sanctioned way to change who owns an organization. Derives the '
  'organization from the target membership row (never from an unscoped '
  '"any owner row" lookup on the caller, which is ambiguous for a caller '
  'who owns multiple organizations) and the caller identity from auth.uid() '
  'only -- never accepts an organization_id, profile_id, or role parameter. '
  'Row locks (FOR UPDATE) on both the caller''s and target''s membership '
  'rows, acquired in a deterministic smaller-uuid-first order, prevent '
  'concurrent transfers -- including two transfers touching the same pair '
  'of rows in opposite directions -- from deadlocking or racing.';

revoke all on function public.transfer_organization_ownership(uuid) from public;
grant execute on function public.transfer_organization_ownership(uuid) to authenticated;
