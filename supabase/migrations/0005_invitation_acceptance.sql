-- 0005_invitation_acceptance.sql
-- NOT APPLIED. Prepared for review per the Phase 10 approval gate.
--
-- Closes the second Phase 9 gap: invitations_select_admin/_insert_admin/
-- _update_admin/_delete_admin (0003_rls_policies.sql) fully support an
-- admin creating/listing/revoking invitation rows, but there is no RLS
-- policy letting the invitee -- who is, by definition, not yet a member --
-- insert their own membership row when accepting one. memberships_insert_
-- bootstrap_owner requires zero existing memberships for the org (false
-- for any org that already has an inviting admin); memberships_insert_admin
-- requires the caller already be an admin. Neither applies to an invitee.
--
-- This migration adds exactly one new RPC and does not touch any existing
-- policy, table, or column.

-- ---------------------------------------------------------------------------
-- accept_invitation: the only sanctioned way an invitation becomes a
-- membership.
--
-- Why SECURITY DEFINER: the caller (the invitee) has no SELECT access to
-- invitations at all (invitations_select_admin is admin-only) and no
-- INSERT access to memberships for this org (see above) -- both by
-- design. This function is the single, narrow, validated exception:
-- everything it trusts comes from auth.uid()/auth.email() (JWT-verified,
-- never a parameter) or from the invitation row itself, looked up only by
-- a caller-supplied token hashed the same way it was stored (never the
-- raw token persisted anywhere, matching 0001_initial_schema.sql's own
-- documented intent for token_hash).
--
-- Never accepts organization_id, profile_id, or role as parameters --
-- every one of those is derived: profile_id from auth.uid(), email from
-- auth.email(), organization_id and role from the matched invitation row.
-- Deliberately refuses to grant 'owner' through this path at all (see
-- below) -- ownership only ever changes through
-- transfer_organization_ownership() (0004_membership_ownership_hardening.sql),
-- which requires the caller already be the current owner. Without this
-- check, invitations_insert_admin (any admin, not just the owner, may
-- create an invitation) would let a non-owner admin grant ownership to an
-- arbitrary email by simply inviting them with role='owner' -- a
-- privilege-escalation path this whole phase exists to close, not reopen.
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

  select i.id, i.organization_id, i.email, i.role, i.expires_at, i.accepted_at
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
    -- Defense in depth: the application layer is expected to never let an
    -- admin create an owner-role invitation in the first place (see
    -- features/members/invitations.ts), but this is the actual point
    -- where a membership would be created, so it is where this is
    -- enforced regardless of whether that app-layer restriction holds.
    raise exception 'invitations cannot grant ownership -- use ownership transfer instead'
      using errcode = '42501';
  end if;

  -- Idempotent, mirroring ensureProfileExists's own pattern (lib/auth/profile.ts)
  -- -- this may be the caller's first authenticated write of any kind.
  insert into public.profiles (id) values (v_caller_id)
  on conflict (id) do nothing;

  -- Already a member of this org (e.g. joined some other way, or this is a
  -- second invitation for the same org/email)? Reuse the existing
  -- membership rather than erroring on the unique constraint or
  -- overwriting a role they may since have been given directly.
  select m.id into v_membership_id
  from public.memberships m
  where m.organization_id = v_invitation.organization_id
    and m.profile_id = v_caller_id;

  if v_membership_id is null then
    insert into public.memberships (id, organization_id, profile_id, role)
    values (gen_random_uuid(), v_invitation.organization_id, v_caller_id, v_invitation.role)
    returning id into v_membership_id;
  end if;

  update public.invitations
  set accepted_at = now()
  where id = v_invitation.id;

  return query select v_invitation.organization_id, v_invitation.role;
end;
$$;

comment on function public.accept_invitation(text) is
  'The only sanctioned way an invitation becomes a membership. Derives '
  'caller identity from auth.uid()/auth.email() only -- never accepts '
  'organization_id, profile_id, or role as parameters. Locks the '
  'invitation row (FOR UPDATE) for the duration of the check-and-accept, '
  'so two concurrent accept attempts with the same token cannot both '
  'succeed (the second sees accepted_at already set and fails cleanly). '
  'Refuses to grant role=owner under any circumstance.';

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_invitation_preview: Phase 10A addition, closing the gap found in the
-- Phase 10 migration review -- app/invite/[token]/page.tsx already calls
-- this RPC (to show "you've been invited to join X as Y" before the
-- invitee commits to accepting), but no earlier migration ever created it.
--
-- Read-only and SECURITY DEFINER for the same reason as accept_invitation:
-- invitations_select_admin is admin-only, so a non-admin invitee has no
-- direct SELECT access to the invitations row at all -- this is the one
-- narrow, validated exception, and unlike accept_invitation it never
-- mutates anything (previewing must never consume/accept as a side effect).
--
-- Return shape matches app/invite/[token]/page.tsx's actual caller code
-- exactly: { status, organization_name, role }, where status is one of
-- 'valid' | 'expired' | 'accepted' | 'wrong_email' | 'not_found'. The page
-- already renders distinct copy for each of these -- collapsing them into
-- a single valid/invalid boolean would be a real behavior change for
-- already-shipped application code, not a simplification.
--
-- Anti-enumeration: email is checked BEFORE accepted_at/expires_at, and
-- 'wrong_email' returns the exact same null organization_name/role as
-- 'not_found' -- a caller whose authenticated email doesn't match the
-- invitation never learns whether it exists, is expired, or was already
-- accepted, only that it isn't theirs. Organization details are returned
-- only in the single 'valid' branch, after every other check has passed.
-- Tokens are 256-bit random values (see features/members/invitations.ts,
-- randomBytes(32)) -- not practically guessable -- and this function has no
-- listing/enumeration surface of its own (single token lookup only), so
-- there is no way to discover invitations other than already possessing
-- one's own valid link.
--
-- organizations.name (not portal_settings.brand_name) is returned
-- deliberately: unlike an anonymous public-portal visitor (see
-- getPortalBySlug's own comment in features/portal-settings/queries.ts,
-- which intentionally withholds organizations.name from that unrelated,
-- unverified audience), the caller here has already been verified to be
-- the specific person a real admin of this organization invited by email
-- -- showing them the organization's real name is the expected, informed-
-- consent behavior for an invitation flow, not a leak to an anonymous party.
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation_preview(p_token text)
returns table (
  status text,
  organization_name text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_email text;
  v_token_hash text;
  v_invitation record;
begin
  v_caller_email := auth.email();
  if v_caller_email is null then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if p_token is null or length(p_token) = 0 then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select i.organization_id, i.email, i.role, i.expires_at, i.accepted_at
  into v_invitation
  from public.invitations i
  where i.token_hash = v_token_hash;

  if v_invitation.organization_id is null then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;

  if lower(v_invitation.email) is distinct from lower(v_caller_email) then
    return query select 'wrong_email'::text, null::text, null::text;
    return;
  end if;

  if v_invitation.accepted_at is not null then
    return query select 'accepted'::text, null::text, null::text;
    return;
  end if;
  if v_invitation.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text;
    return;
  end if;

  return query
  select 'valid'::text, o.name, v_invitation.role
  from public.organizations o
  where o.id = v_invitation.organization_id;
end;
$$;

comment on function public.get_invitation_preview(text) is
  'Read-only preview for the invitation acceptance page -- never mutates '
  'invitations or memberships. Matches app/invite/[token]/page.tsx''s '
  'caller exactly: returns {status, organization_name, role} where status '
  'is valid/expired/accepted/wrong_email/not_found. Never returns '
  'token_hash. Organization details are withheld (null) for every status '
  'except valid, including wrong_email -- a caller never learns an '
  'invitation exists, let alone its state, unless their authenticated '
  'email actually matches it.';

revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to authenticated;
