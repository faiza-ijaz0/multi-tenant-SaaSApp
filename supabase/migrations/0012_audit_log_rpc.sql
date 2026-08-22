-- 0012_audit_log_rpc.sql
-- NOT APPLIED. Prepared for review per the Phase 14 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- audit_events_insert_admin (0003_rls_policies.sql) requires the actor be an
-- admin/owner of the organization. That's exactly right for admin-authored
-- events (member role changed, category deleted, etc.) and is why
-- features/submissions/status.ts's inline insert (a status change is
-- already admin-gated at the app layer) already works today. It structurally
-- cannot cover two events Phase 14 Part 13 explicitly asks for:
-- submission.created and comment.created -- both performable by a plain
-- member OR a portal customer, neither of whom is an admin.
--
-- ---------------------------------------------------------------------------
-- WHY AN RPC, NOT A BROADER INSERT POLICY
-- ---------------------------------------------------------------------------
-- Same reasoning as create_notification (0008_notification_creation_rpc.sql):
-- an INSERT policy permissive enough to let any member/customer write
-- audit_events directly would let them write an arbitrary action/
-- entity_type/metadata row, not just the two specific, already-validated
-- events this needs to support -- audit_events has no per-action shape
-- validation today (unlike notifications' type allowlist, there's no CHECK
-- constraint on audit_events.action at all). A narrow SECURITY DEFINER RPC
-- with a fixed action allowlist is this codebase's established pattern for
-- exactly this class of problem.
--
-- ---------------------------------------------------------------------------
-- THE FUNCTION
-- ---------------------------------------------------------------------------
-- log_audit_event(p_organization_id, p_action, p_entity_type, p_entity_id,
-- p_metadata):
--   - Actor is always auth.uid() -- never a parameter.
--   - Actor must have organization access (member OR customer) to
--     p_organization_id -- an unrelated caller cannot write into any org's
--     log.
--   - p_action restricted to a fixed two-value allowlist: 'submission.created',
--     'comment.created' -- the only events a non-admin actor can legitimately
--     produce. Every other event type (member/invitation/organization/
--     ownership/category/status changes) is admin-or-owner-authored and
--     keeps using the existing direct insert under audit_events_insert_admin,
--     unchanged by this migration.
--   - p_entity_type is NOT restricted to an allowlist (unlike action) --
--     it's simply stored alongside, matching how the existing direct-insert
--     call sites already pass it through as a plain label.
--
-- WHY THIS IS SAFE:
--   - audit_events_select_admin/_insert_admin are completely untouched --
--     the log is still only readable by admins/owners (with the 'activity'
--     page permission, per 0009), and this RPC is the only new way to add a
--     row outside that policy.
--   - The two-value action allowlist prevents this from becoming a generic
--     "insert anything" backdoor, matching create_notification's own
--     reasoning.
--   - has_organization_access bounds this strictly to organizations the
--     caller already has a real, existing relationship to.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - a member can log submission.created/comment.created for their org
--   - a customer can log submission.created/comment.created for the org
--     they're a customer of
--   - a caller with no relationship to the organization is rejected (42501)
--   - an unrecognized action string is rejected (22023)
--   - an unauthenticated caller is rejected (28000)
--   - the resulting row is visible to admins/owners with the 'activity'
--     permission via audit_events_select_admin, exactly like any other
--     audit_events row
-- ---------------------------------------------------------------------------

create or replace function public.log_audit_event(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_event_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required' using errcode = '22023';
  end if;

  if not public.has_organization_access(p_organization_id) then
    raise exception 'you do not have access to this organization' using errcode = '42501';
  end if;

  if p_action not in ('submission.created', 'comment.created') then
    raise exception 'unrecognized audit action: %', p_action using errcode = '22023';
  end if;

  if p_entity_type is null or btrim(p_entity_type) = '' then
    raise exception 'entity_type is required' using errcode = '22023';
  end if;

  insert into public.audit_events (
    id, organization_id, actor_profile_id, action, entity_type, entity_id, metadata
  )
  values (
    gen_random_uuid(), p_organization_id, v_actor_id, p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.log_audit_event(uuid, text, text, uuid, jsonb) is
  'The sanctioned way for a non-admin (member or customer) actor to write '
  'audit_events -- restricted to submission.created/comment.created. Every '
  'admin-authored event keeps using the existing direct insert under '
  'audit_events_insert_admin. Actor is always auth.uid(), never a parameter.';

revoke all on function public.log_audit_event(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) to authenticated;
