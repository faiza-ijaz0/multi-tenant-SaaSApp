-- 0006_membership_trigger_service_role_fix.sql
-- NOT APPLIED. Proposed fix for a bug discovered during Phase 10A
-- post-application verification of 0004_membership_ownership_hardening.sql.
-- Requires the same explicit approval as 0004/0005 before being applied.
--
-- ---------------------------------------------------------------------------
-- THE BUG
-- ---------------------------------------------------------------------------
-- enforce_membership_owner_delete_protection (and, for the same reason,
-- enforce_membership_role_invariants) resolve the acting user's role via
-- auth.uid(). When a memberships row is deleted as part of a CASCADE --
-- e.g. Supabase Auth deleting an auth.users row (via the Admin API, or a
-- user closing their own account: auth.users -> profiles ON DELETE CASCADE
-- -> memberships ON DELETE CASCADE) -- there is no PostgREST/RLS session
-- at all, so auth.uid() is NULL. get_organization_role() then returns NULL
-- (its WHERE clause `profile_id = auth.uid()` can never match a row), and
-- `NULL IS DISTINCT FROM 'owner'` evaluates true -- so the trigger
-- incorrectly treats "no session context" the same as "a real,
-- authenticated non-owner," and blocks the cascade outright.
--
-- In practice this means an organization owner's account could never be
-- deleted at all once 0004 was applied -- not a hypothetical: verified
-- directly against the live database. Every test-identity cleanup for an
-- owner role started failing with "Database error deleting user"
-- immediately after 0004 was applied (48 orphaned test accounts
-- accumulated across one verification run), where the identical cleanup
-- code had been reliable (aside from ordinary transient network flakiness)
-- through every prior phase. This is a real production defect, not just a
-- test-cleanup inconvenience: any real user who owns an organization would
-- be unable to delete their own account.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Both trigger functions now return immediately (allowing the operation)
-- when auth.uid() is null, treating "no session context" as "not a normal
-- RLS-gated client request" rather than "an unauthorized actor."
--
-- Why this is safe, not a weakening:
--   - Every path that reaches these triggers via a real client request
--     already passed memberships_update_admin / memberships_delete_admin_or_self
--     first (both `to authenticated`) -- so auth.uid() is guaranteed
--     non-null for any real user-initiated request. The only way to reach
--     these triggers with auth.uid() = null is a service-role-privileged
--     operation (RLS bypassed entirely for that role already), which this
--     whole codebase already treats as outside the RLS-governed
--     application model -- service-role is confined to tests/integration
--     and Supabase's own internal Auth Admin API, never application code
--     (verified by grep in every prior phase's security review).
--   - This does not reopen the vulnerability 0004 exists to close: a
--     non-owner admin acting through their own authenticated session still
--     has a non-null auth.uid() and is still blocked exactly as before --
--     nothing about the actual privilege-escalation protection changes.
--   - profile_id immutability (the other check in
--     enforce_membership_role_invariants) is deliberately NOT given this
--     same exemption: no FK relationship in this schema ever cascades an
--     UPDATE into memberships (only DELETE cascades exist), so this bug
--     cannot affect it, and there is no legitimate reason for profile_id
--     to ever change regardless of caller -- keeping it unconditional is
--     the more conservative, correct choice.
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
    if coalesce(current_setting('app.membership_trusted_transfer', true), 'false') = 'true' then
      return new;
    end if;

    -- No session context (service-role / cascade): every real client
    -- request that reaches this point already passed
    -- memberships_update_admin's `to authenticated` RLS check, which
    -- guarantees a non-null auth.uid(). A null auth.uid() here can only
    -- mean this is a service-role-privileged operation (RLS bypassed
    -- entirely for that role already) -- not a normal user request this
    -- trigger is meant to gate.
    if auth.uid() is null then
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
    -- See enforce_membership_role_invariants above for why a null
    -- auth.uid() means "not a normal client request" and must not be
    -- treated as an unauthorized non-owner. This is the specific fix for
    -- the account-deletion cascade bug documented at the top of this file.
    if auth.uid() is null then
      return old;
    end if;

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
