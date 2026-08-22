-- 0008_notification_creation_rpc.sql
-- NOT APPLIED. Prepared for review per the Phase 12 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- notifications has no INSERT policy for any role (0003_rls_policies.sql's
-- own comment: "Deliberately no INSERT policy at all -- direct client
-- inserts are blocked entirely (default deny), so one member can't spam
-- fake notifications at another. Real creation will go through a SECURITY
-- DEFINER trigger/function in whichever later phase adds the triggering
-- events... which bypasses RLS by design rather than needing a
-- client-facing INSERT policy here."). features/notifications/service.ts's
-- createNotification() has been a deliberate, documented stub since Phase 6
-- for exactly this reason -- it throws rather than silently no-op-ing or
-- reaching for service-role credentials.
--
-- This migration is the "later phase" that comment anticipated: a single,
-- narrowly-validated SECURITY DEFINER RPC. It does NOT wire up any actual
-- triggering event (comment posted, status changed, invited, etc.) --
-- deciding when to call this RPC from which feature is separate,
-- feature-level work outside this migration's scope. This migration only
-- closes the schema-level gap that makes notification creation possible at
-- all, safely.
--
-- ---------------------------------------------------------------------------
-- WHY AN RPC, NOT A BROADER INSERT POLICY
-- ---------------------------------------------------------------------------
-- A direct INSERT RLS policy permissive enough to let one member notify
-- another (necessarily: WITH CHECK allowing profile_id <> auth.uid()) would
-- let any authenticated member insert an arbitrary number of notifications,
-- of any `type` string, with any `payload` jsonb, at any other member in
-- shared organizations, with no per-action validation -- a real (if
-- org-bounded) spam/abuse vector, and exactly what the original "so one
-- member can't spam fake notifications at another" design goal was
-- protecting against.
--
-- A single SECURITY DEFINER RPC is this codebase's already-established
-- pattern for exactly this class of problem (see
-- transfer_organization_ownership in 0004, accept_invitation in 0005): a
-- narrow, server-validated function is the one sanctioned way to cross an
-- RLS boundary, rather than a client-facing policy permissive enough to
-- allow it directly.
--
-- ---------------------------------------------------------------------------
-- THE PROPOSED FUNCTION
-- ---------------------------------------------------------------------------
-- create_notification(p_profile_id, p_organization_id, p_type, p_payload):
--   - Caller (actor) identity is derived from auth.uid() only -- never a
--     parameter, never trusted from the client.
--   - The actor must actually be a member of p_organization_id -- a caller
--     with no relationship to an organization cannot notify anyone in it.
--   - The recipient (p_profile_id) must also actually be a member of
--     p_organization_id -- notifications can't be sent to an arbitrary,
--     unrelated profile_id; both parties must share the same organization.
--   - p_type is restricted to a fixed allowlist matching this application's
--     actual known event vocabulary (see the CHECK below) -- not an
--     arbitrary string -- so this RPC cannot be used to inject arbitrary
--     notification "types" the UI was never designed to render.
--   - p_payload defaults to '{}'::jsonb and is inserted as-is; the UI layer
--     (features/notifications/notification-item.tsx) is responsible for
--     safely rendering whatever shape a given `type` implies, same as it
--     already does today.
--   - Returns the new notification's id.
--
-- WHY THIS IS SAFE:
--   - No RLS policy changes -- notifications_select_own/_update_own/_delete_own
--     (0003) are completely untouched. A recipient still only ever sees
--     their own notifications.
--   - The actor-is-a-member and recipient-is-a-member checks bound this
--     strictly within organizations both parties already legitimately
--     belong to -- this cannot be used to notify a stranger, or to notify
--     someone in an organization the caller has no relationship to.
--   - The type allowlist prevents this from becoming a generic
--     "insert anything" backdoor into the notifications table.
--   - Matches the exact architecture the original 0003 comment already
--     anticipated for this feature.
--
-- LIMITATIONS OF THIS PROPOSAL (deliberately out of scope here):
--   - No rate-limiting/dedup is included (e.g. ten comments in a minute on
--     the same submission would produce ten separate notification rows).
--     If that turns out to matter in practice once real triggering events
--     are wired up, it belongs in whichever future change adds those
--     triggers, not in this schema-level migration.
--   - No actual caller of this RPC is added by this migration -- see above.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
-- New integration tests needed once approved and applied, using disposable
-- fixtures (matching this codebase's existing RLS-test conventions):
--   - a member can create a notification for a co-member of the same org
--   - a member CANNOT create a notification for a profile_id that is not a
--     member of that organization (42501)
--   - a caller who is not a member of the organization at all CANNOT create
--     a notification in it, even for a real member of that org (42501)
--   - an invalid/unrecognized `type` is rejected (22023)
--   - the created row is visible to the recipient via notifications_select_own
--     and invisible to everyone else
--   - an unauthenticated caller is rejected (28000)
-- ---------------------------------------------------------------------------

create or replace function public.create_notification(
  p_profile_id uuid,
  p_organization_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_notification_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_profile_id is null or p_organization_id is null then
    raise exception 'profile_id and organization_id are required' using errcode = '22023';
  end if;

  -- Actor must actually be a member of the organization they're notifying
  -- within -- a caller with no relationship to this org cannot use it to
  -- notify anyone in it at all.
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and profile_id = v_actor_id
  ) then
    raise exception 'you are not a member of this organization' using errcode = '42501';
  end if;

  -- Recipient must also actually be a member of the same organization --
  -- this cannot be used to notify an arbitrary, unrelated profile_id.
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and profile_id = p_profile_id
  ) then
    raise exception 'recipient is not a member of this organization' using errcode = '42501';
  end if;

  if p_type not in (
    'submission.status_changed',
    'submission.comment_added',
    'member.invited',
    'member.role_changed',
    'ownership.transferred'
  ) then
    raise exception 'unrecognized notification type: %', p_type using errcode = '22023';
  end if;

  insert into public.notifications (id, profile_id, organization_id, type, payload)
  values (gen_random_uuid(), p_profile_id, p_organization_id, p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

comment on function public.create_notification(uuid, uuid, text, jsonb) is
  'The only sanctioned way to create a notification. Derives the actor from '
  'auth.uid() only; requires both actor and recipient to be real members of '
  'the same organization; restricts type to a fixed allowlist. Does not by '
  'itself trigger any real event -- callers (future feature work) decide '
  'when to invoke this.';

revoke all on function public.create_notification(uuid, uuid, text, jsonb) from public;
grant execute on function public.create_notification(uuid, uuid, text, jsonb) to authenticated;
