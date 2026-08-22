-- 0007_organization_self_delete_fix.sql
-- NOT APPLIED. Prepared for review per the Phase 12 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE BUG
-- ---------------------------------------------------------------------------
-- An organization's owner can never delete their own organization via
-- organizations_delete_owner (0003_rls_policies.sql). Deleting the
-- organizations row cascades (ON DELETE CASCADE) to every membership row in
-- that org, including the owner's own row. enforce_membership_owner_delete_protection
-- (0004_membership_ownership_hardening.sql)'s "at least one owner must
-- remain" check counts OTHER owner rows in the same org, excluding the row
-- currently being deleted -- for the organization's last (or only) owner,
-- that count is always 0, so the trigger raises 23514 ("organization must
-- always have at least one owner") and the entire DELETE FROM organizations
-- statement rolls back. Every time, regardless of how many other (non-owner)
-- members exist.
--
-- Verified directly with disposable test organizations/identities only --
-- never the real "reactJs developer" organization or faizaijjaz@gmail.com --
-- see tests/integration/features/membership-cascade.test.ts, which currently
-- pins this exact behavior (asserts the 23514 rejection) as a documented
-- known-bug regression test.
--
-- Distinct from the bug 0006 fixed: 0006 fixed the case where auth.uid() is
-- NULL (service-role/no session, e.g. Supabase Auth deleting a user). This
-- path has a real, non-null, authenticated owner session throughout -- and
-- still fails, because the check has no way to distinguish "someone is
-- removing just this one membership row while the organization continues to
-- exist" (where the invariant is correct and must be enforced) from "the
-- whole organization, including every membership in it, is being deleted in
-- the same statement" (where the invariant does not apply -- there is no
-- remaining organization for it to protect anymore).
--
-- Impact: an availability/correctness bug, not a security hole -- it fails
-- closed (blocks the delete, no data loss, no privilege escalation). Any
-- organization owner who wants to delete their own organization is
-- currently unable to, with no workaround short of a service-role
-- operation.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Add a check, ahead of the owner-role/remaining-owner logic: if
-- public.organizations no longer has a row for old.organization_id, this
-- DELETE on memberships is happening as an ON DELETE CASCADE side effect of
-- the organization itself being deleted in the same statement -- not a
-- standalone attempt to remove this one membership -- so the "at least one
-- owner must remain" invariant does not apply, and the delete is allowed
-- through immediately (same early-return shape as 0006's auth.uid() IS NULL
-- check, applied to a different signal).
--
-- WHY THIS IS SAFE, NOT A WEAKENING:
--   - This relies on standard, well-documented Postgres cascade/MVCC
--     semantics: within a single top-level DELETE statement, an
--     ON DELETE CASCADE action on a referencing table executes after the
--     referenced row's own deletion has been applied within that same
--     command, and observes that effect (Postgres advances the command
--     counter accordingly as it processes the cascade). A membership row
--     being deleted purely because its organization was just deleted will
--     therefore reliably see organizations_delete_owner's target row
--     already gone.
--   - A standalone DELETE on a single memberships row -- the "remove
--     member" (features/members/membership.ts) and any future
--     "leave organization" path this trigger exists to guard -- never
--     touches the organizations table at all, so the parent row is always
--     still present in that case. The check cannot be spoofed or tricked
--     by an ordinary membership delete; it only ever passes when the
--     organization row is genuinely gone in the same transaction.
--   - organizations_delete_owner (0003_rls_policies.sql) already requires
--     the caller to BE the current owner (is_organization_owner(id)) --
--     this fix does not change who may delete an organization, only
--     unblocks the one specific path (the owner's own row, cascaded from
--     deleting their own org) that was incorrectly rejected.
--   - Every other circumstance the trigger guards is completely unchanged:
--     a non-owner deleting the owner's row directly (organization NOT
--     being deleted) is still blocked exactly as before, since the
--     organizations row is still present in that case. The "at least one
--     owner" rule when removing a co-owner while the org continues to
--     exist is untouched.
--   - profile_id immutability (enforce_membership_role_invariants) and
--     every RLS policy are completely untouched by this migration -- it
--     modifies exactly one function, adding one early-return branch.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
-- tests/integration/features/membership-cascade.test.ts was written
-- specifically to pin the CURRENT (broken) behavior with disposable test
-- data -- its three tests currently assert the 23514 rejection and a
-- successful service-role-only delete. When this migration is approved and
-- applied, that file must be updated so the first two tests assert
-- SUCCESS (result.error to be null, memberships and the organization both
-- gone) instead of the 23514 rejection -- that flip is the direct,
-- empirical proof this fix works, not just a plausibility argument. Do not
-- apply this migration without updating and re-running that file
-- immediately afterward against the live database.
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
    -- See enforce_membership_role_invariants (0006) for why a null
    -- auth.uid() means "not a normal client request" and must not be
    -- treated as an unauthorized non-owner.
    if auth.uid() is null then
      return old;
    end if;

    -- The organization itself is being deleted in this same statement
    -- (ON DELETE CASCADE from organizations) -- not a standalone removal
    -- of just this membership. See file header for why this is a reliable,
    -- non-bypassable signal of that specific situation, not a workaround.
    if not exists (select 1 from public.organizations where id = old.organization_id) then
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
