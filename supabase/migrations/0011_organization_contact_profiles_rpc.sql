-- 0011_organization_contact_profiles_rpc.sql
-- NOT APPLIED. Prepared for review per the Phase 14 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- profiles_select_own (0003_rls_policies.sql) is strictly self-service --
-- a user can read their own profile row and nobody else's. profiles also
-- has no email column at all (email lives in auth.users, which RLS-scoped
-- clients cannot query). The result: today's dashboard/audit UI can only
-- ever show "You" or "Member <id prefix>" for anyone else -- it is
-- structurally unable to show "Submitted by: Faiza Ijaz,
-- faizaijazz@gmail.com", which Phase 14 Part 9 explicitly requires.
--
-- ---------------------------------------------------------------------------
-- WHY AN RPC, NOT A BROADER profiles SELECT POLICY
-- ---------------------------------------------------------------------------
-- Widening profiles_select_own to "any org member can read any co-member's
-- profile" would still need a second, separate mechanism to expose email at
-- all (it isn't a column on profiles), and would apply globally to every
-- query against profiles rather than the one specific, already-scoped use
-- case (resolving names/emails for submitters and commenters visible on the
-- current dashboard page). A narrow SECURITY DEFINER function -- this
-- codebase's established pattern for crossing an RLS boundary safely (see
-- transfer_organization_ownership, accept_invitation, create_notification)
-- -- keeps profiles_select_own untouched and adds one auditable, tightly
-- scoped read path instead.
--
-- ---------------------------------------------------------------------------
-- THE FUNCTION
-- ---------------------------------------------------------------------------
-- get_organization_contact_profiles(p_organization_id, p_profile_ids):
--   - Caller must actually be a member of p_organization_id -- a portal
--     customer or an unrelated user gets nothing back, ever.
--   - Takes an explicit list of profile ids to resolve (the submitter/author
--     ids already present on the caller's current page of results) rather
--     than returning the whole org's contact list -- callers only ever
--     resolve identities they already have a legitimate reason to display.
--   - Only returns a row for a profile id that actually has a memberships OR
--     customers row in p_organization_id -- this cannot be used to look up
--     an arbitrary, unrelated profile's email by guessing a uuid.
--   - Reads auth.users.email directly (SECURITY DEFINER; ordinary RLS-scoped
--     clients cannot query auth.users at all) -- this is the one place email
--     is exposed to a co-member/admin, and only for people who already share
--     an organization with the caller.
--
-- WHY THIS IS SAFE:
--   - profiles_select_own is completely untouched -- self-reads are
--     unaffected, and this function is the only new way to read anyone
--     else's name/email.
--   - Requires an existing, real relationship (shared organization,
--     verified via is_organization_member/customers/memberships) between
--     caller and every profile returned.
--   - Bounded by the caller-supplied id list -- cannot be used to page
--     through or enumerate an organization's full contact list beyond
--     whatever ids the caller already legitimately has.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - an org member can resolve the name/email of another member and of a
--     customer who has submitted/commented in that org
--   - a caller who is not a member of p_organization_id gets zero rows back,
--     even when passing real member/customer profile ids for that org
--   - a profile id with no memberships/customers row in that org (e.g. a
--     member of a *different* org) is silently omitted, not errored
--   - an unauthenticated caller gets zero rows back
-- ---------------------------------------------------------------------------

create or replace function public.get_organization_contact_profiles(
  p_organization_id uuid,
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  full_name text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_organization_member(p_organization_id)
    and p.id = any(coalesce(p_profile_ids, array[]::uuid[]))
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = p_organization_id and m.profile_id = p.id
      )
      or exists (
        select 1 from public.customers c
        where c.organization_id = p_organization_id and c.profile_id = p.id
      )
    );
$$;

comment on function public.get_organization_contact_profiles(uuid, uuid[]) is
  'Resolves name/email for a caller-supplied set of profile ids, scoped to '
  'people who actually share organization p_organization_id with the '
  'caller (as a member or customer). Caller must themselves be a member of '
  'that org. The only path by which one user can ever see another user''s '
  'email in this app -- profiles_select_own remains self-only.';

revoke all on function public.get_organization_contact_profiles(uuid, uuid[]) from public;
grant execute on function public.get_organization_contact_profiles(uuid, uuid[]) to authenticated;
