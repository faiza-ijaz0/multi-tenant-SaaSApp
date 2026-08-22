-- 0013_membership_action_permissions.sql
-- NOT APPLIED. Prepared for review per the Phase 14 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- 0009_page_permissions.sql adds per-membership PAGE visibility -- whether a
-- non-owner can reach a dashboard route at all -- and says explicitly in its
-- own header: "CRUD authority within a page is still governed by the
-- existing role-based policies." That's exactly right as far as it goes, but
-- it means today (0009 alone) an admin who can see the Members page can
-- always add/remove/promote every non-owner member; there is no way to grant
-- a member "Submissions: view + create, but not edit/delete," or an admin
-- "Members: view only, no invite/remove," without changing their role. This
-- migration adds that second axis: per-membership, per-resource ACTION
-- grants, layered on top of 0009's page grants exactly the same way 0009 is
-- layered on top of role.
--
-- ---------------------------------------------------------------------------
-- SHAPE: mirrors 0009 deliberately
-- ---------------------------------------------------------------------------
-- Same normalized table (structural, not just RLS-enforced, tenant scoping
-- via membership_id -> memberships.organization_id), same owner-bypass
-- helper-function shape, same "AND has_..._permission(...)" one-clause
-- extension technique applied to existing admin-gated policies, same
-- self-access carve-outs where a user must always be able to read their own
-- grants regardless of what they've been granted. See 0009's header for the
-- full reasoning; not repeated here except where this migration diverges.
--
-- permission_key is a single 'resource:action' text column (e.g.
-- 'submissions:edit'), CHECK-constrained to a fixed allowlist -- the same
-- "text + CHECK IN (...)" convention 0001/0009 already use for role/page,
-- rather than a second reference table. The allowlist mirrors
-- lib/authorization/registry.ts's ACTION_PERMISSIONS exactly; keep both in
-- sync by hand, there is no single source of truth spanning SQL and
-- TypeScript (documented in both files).
--
-- ---------------------------------------------------------------------------
-- WHAT'S GATED AND WHAT ISN'T
-- ---------------------------------------------------------------------------
-- Action permissions only ever apply to the MEMBER branch of a policy that
-- also has a customer or public branch (submissions/comments insert) -- a
-- portal customer has no memberships row at all, so has_action_permission
-- always returns false for one; gating a customer's own path with it would
-- silently break public portal participation. Every such policy below keeps
-- its customer/anon branch completely untouched, exactly like 0009 kept
-- categories/statuses/portal_settings SELECT untouched.
--
-- "Own row" authorship (a member editing/deleting their own submission or
-- comment) is likewise untouched and ungated -- the existing author branch
-- (submitted_by = auth.uid() / author_profile_id = auth.uid()) is
-- unconditional, matching 0010's own reasoning. Action-permission grants
-- below extend the non-authorship branch of a policy: acting on someone
-- else's row, or on a resource with no authorship concept at all.
--
-- CRITICAL DESIGN POINT, not obvious on first read: every extended policy
-- below gates on has_page_permission(...)/has_action_permission(...) ALONE
-- -- never additionally AND'd with is_organization_admin(...). An earlier
-- draft of this migration paired them (mirroring 0009's own
-- is_organization_admin(...) AND has_page_permission(...) shape), which
-- turned out to be a real bug, not harmless redundancy: is_organization_admin
-- checks the caller's ROLE, and a 'member'-role membership can never satisfy
-- it no matter what it's been granted -- so pairing it with
-- has_action_permission made every "member" role permanently unable to be
-- elevated beyond default member behavior via a permission grant, directly
-- contradicting this migration's own stated purpose (independent page/
-- action grants, orthogonal to role). has_page_permission/has_action_permission
-- already structurally imply a real relationship to the org (owner bypass,
-- or a join through memberships for a grant row) -- they don't need role
-- layered on top. Caught during real-database verification (see the Phase 14
-- report) via a test asserting a plain member, granted submissions:edit,
-- could edit another author's submission -- and could not, until this was
-- fixed.
--
-- can_manage_membership_permissions is the one deliberate exception,
-- explicitly kept is_organization_admin-gated below: granting or editing
-- ANYONE's page/action permissions (including another member's) stays an
-- inherently admin-tier capability, never delegable to a plain member even
-- via a roles_permissions:manage_permissions grant. This is the trust floor
-- that keeps the rest of the system safe -- only an admin/owner can ever
-- grant a member elevated capability in the first place, so no runaway
-- delegation chain is possible.
--
-- roles_permissions:assign_role / roles_permissions:manage_permissions are
-- deliberately excluded from the Admin default preset (see the backfill
-- section and lib/authorization/registry.ts's ROLE_PRESETS) -- an admin can
-- freely manage members/invitations/content by default, but changing a
-- role or another membership's permission grants requires an explicit grant
-- from the owner. This is an intentional tightening versus this codebase's
-- current behavior, where any admin can already change any non-owner's role
-- via memberships_update_admin -- flagged prominently in the Phase 14
-- report, not a silent behavior change.
--
-- Ownership itself (organizations_delete_owner, transfer_organization_ownership,
-- and every 0004 trigger) is completely untouched by this migration and is
-- never routed through has_action_permission -- no permission_key exists for
-- "delete organization" or "transfer ownership" at all, so no grant
-- combination can ever reach those paths. See registry.ts's comment on
-- organization_settings for the same point stated in TypeScript.
--
-- ---------------------------------------------------------------------------
-- BACKFILL
-- ---------------------------------------------------------------------------
-- Neither this migration nor 0009 grants anything by default -- has_page_
-- permission/has_action_permission require an explicit row for any
-- non-owner. Applied with zero backfill, every existing admin/member would
-- lose all page and action access the instant this migration commits. 0009
-- ships with no backfill of its own (it only materializes grants going
-- forward, via accept_invitation, for invitations accepted after it's
-- applied). This migration backfills BOTH tables together, in one place, for
-- every membership that already exists at apply time -- computed from
-- current role, using the exact same Owner/Admin/Member preset values as
-- lib/authorization/registry.ts's ROLE_PRESETS (kept in sync by hand,
-- documented at both ends). Owners are skipped entirely (bypass, never need
-- rows). This is the one place this migration doesn't just additively layer
-- on top of 0009 -- it also repairs a gap 0009 itself left open.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - owner bypasses every has_action_permission check with zero rows
--   - admin default preset (post-backfill or post-accept_invitation) can
--     manage submissions/categories/statuses/members/invitations; cannot
--     assign roles or manage permissions without an explicit grant
--   - member default preset can view/create own submissions/comments;
--     denied editing/deleting someone else's, denied every admin surface
--   - a member granted submissions:edit can edit another author's
--     submission; without it, cannot -- RLS-level denial, not just a
--     hidden button
--   - a customer's ability to create submissions/comments is completely
--     unaffected by any member's action-permission grants (or lack thereof)
--     in the same org
--   - a grant in Org A never satisfies has_action_permission for Org B
--   - a caller without roles_permissions:manage_permissions cannot insert/
--     update/delete any row in membership_page_permissions or
--     membership_action_permissions, even their own
--   - every pre-existing (pre-migration) membership retains access matching
--     its role immediately after this migration applies
--   - accept_invitation materializes both page_permissions and
--     action_permissions from the invitation, only for a newly created
--     membership, exactly like 0009 already does for pages alone
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.membership_action_permissions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  constraint membership_action_permissions_key_check
    check (
      permission_key in (
        'submissions:view', 'submissions:create', 'submissions:edit', 'submissions:delete', 'submissions:manage',
        'comments:view', 'comments:create', 'comments:edit', 'comments:moderate',
        'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
        'statuses:view', 'statuses:create', 'statuses:edit', 'statuses:delete',
        'members:view', 'members:invite', 'members:delete',
        'invitations:view', 'invitations:create', 'invitations:revoke',
        'roles_permissions:view', 'roles_permissions:assign_role', 'roles_permissions:manage_permissions',
        'portal_settings:edit',
        'organization_settings:edit'
      )
    ),
  constraint membership_action_permissions_unique unique (membership_id, permission_key)
);

create index membership_action_permissions_membership_id_idx
  on public.membership_action_permissions (membership_id);

comment on table public.membership_action_permissions is
  'Per-membership grants for which resource:action operations a non-owner '
  'may perform, orthogonal to and layered on top of membership_page_permissions. '
  'Owners bypass this table entirely (see has_action_permission below). '
  'Never gates a submission/comment author acting on their own row, and '
  'never gates a portal customer -- see this file''s header.';

alter table public.membership_action_permissions enable row level security;

-- Pending invitations carry their intended action grants until accepted,
-- exactly like 0009's invitations.page_permissions.
alter table public.invitations
  add column action_permissions text[] not null default '{}'::text[];

alter table public.invitations
  add constraint invitations_action_permissions_check
  check (
    action_permissions <@ array[
      'submissions:view', 'submissions:create', 'submissions:edit', 'submissions:delete', 'submissions:manage',
      'comments:view', 'comments:create', 'comments:edit', 'comments:moderate',
      'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
      'statuses:view', 'statuses:create', 'statuses:edit', 'statuses:delete',
      'members:view', 'members:invite', 'members:delete',
      'invitations:view', 'invitations:create', 'invitations:revoke',
      'roles_permissions:view', 'roles_permissions:assign_role', 'roles_permissions:manage_permissions',
      'portal_settings:edit',
      'organization_settings:edit'
    ]::text[]
  );

comment on column public.invitations.action_permissions is
  'Action-permission keys to grant on acceptance, materialized into '
  'membership_action_permissions by accept_invitation(). Same semantics as '
  'page_permissions (0009): ignored for owner-role invitations, which never '
  'happen (invitations cannot grant owner).';

-- ---------------------------------------------------------------------------
-- Helper function
-- ---------------------------------------------------------------------------
create or replace function public.has_action_permission(p_organization_id uuid, p_permission_key text)
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
      from public.membership_action_permissions ap
      join public.memberships m on m.id = ap.membership_id
      where m.organization_id = p_organization_id
        and m.profile_id = auth.uid()
        and ap.permission_key = p_permission_key
    );
$$;

comment on function public.has_action_permission(uuid, text) is
  'True if the authenticated user is the org owner (unconditional bypass) '
  'or holds an explicit membership_action_permissions grant for '
  'p_permission_key in that org. Companion to has_page_permission (0009) -- '
  'a resource:action authority check, not a page-visibility check.';

-- Supersedes 0009's version: gates managing EITHER permission table (page or
-- action) on the SAME action-permission grant, roles_permissions:manage_permissions,
-- instead of 0009's has_page_permission(org, 'members'). This is a deliberate
-- narrowing -- being able to see the Members page no longer implies being
-- able to edit anyone's permissions; that now requires its own explicit
-- grant, consistent with roles_permissions being excluded from the Admin
-- default preset. Every other check (target not owner, target not self) is
-- preserved verbatim from 0009.
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

  if v_role = 'owner' then
    return false;
  end if;

  if v_profile_id = auth.uid() then
    return false;
  end if;

  return public.is_organization_admin(v_organization_id)
    and public.has_action_permission(v_organization_id, 'roles_permissions:manage_permissions');
end;
$$;

comment on function public.can_manage_membership_permissions(uuid) is
  'True if the caller may add/change/remove page- or action-permission '
  'grants on the given membership: caller must be an admin/owner holding '
  'roles_permissions:manage_permissions themselves, the target must not be '
  'the owner, and the target must not be the caller''s own membership row. '
  'Supersedes 0009''s version (previously gated on the members page '
  'permission alone) -- see this file''s header for why.';

-- ---------------------------------------------------------------------------
-- RLS: membership_action_permissions
-- ---------------------------------------------------------------------------
create policy membership_action_permissions_select on public.membership_action_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_action_permissions.membership_id
        and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.memberships m
      where m.id = membership_action_permissions.membership_id
        and public.is_organization_member(m.organization_id)
        and public.has_page_permission(m.organization_id, 'members')
    )
  );

create policy membership_action_permissions_insert on public.membership_action_permissions
  for insert
  to authenticated
  with check (public.can_manage_membership_permissions(membership_id));

create policy membership_action_permissions_update on public.membership_action_permissions
  for update
  to authenticated
  using (public.can_manage_membership_permissions(membership_id))
  with check (public.can_manage_membership_permissions(membership_id));

create policy membership_action_permissions_delete on public.membership_action_permissions
  for delete
  to authenticated
  using (public.can_manage_membership_permissions(membership_id));

-- ---------------------------------------------------------------------------
-- Extend existing (0003/0009/0010-current) policies with one
-- "AND has_action_permission(...)" clause each, on the admin/non-authorship
-- branch only. See this file's header for why customer/public/own-row
-- branches are never touched.
-- ---------------------------------------------------------------------------

-- memberships: role changes now require BOTH the 'members' page permission
-- (0009) AND the roles_permissions:assign_role action grant -- being able to
-- see the roster no longer implies being able to change anyone's role.
-- Also supersedes 0009's memberships_select_member (dropping
-- is_organization_admin from the "see the roster" branch -- see header).
drop policy memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.has_page_permission(organization_id, 'members')
  );

drop policy memberships_insert_admin on public.memberships;
create policy memberships_insert_admin on public.memberships
  for insert
  to authenticated
  with check (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'members:invite')
  );

drop policy memberships_update_admin on public.memberships;
create policy memberships_update_admin on public.memberships
  for update
  to authenticated
  using (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'roles_permissions:assign_role')
  )
  with check (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'roles_permissions:assign_role')
  );

-- Self-leave keeps working unconditionally (untouched from 0009); only the
-- admin-removes-someone-else branch gains the members:delete gate.
drop policy memberships_delete_admin_or_self on public.memberships;
create policy memberships_delete_admin_or_self on public.memberships
  for delete
  to authenticated
  using (
    (
      public.has_page_permission(organization_id, 'members')
      and public.has_action_permission(organization_id, 'members:delete')
    )
    or profile_id = auth.uid()
  );

-- invitations: no self-row concept (acceptance goes through the SECURITY
-- DEFINER RPCs, bypassing RLS) -- straightforward AND on every policy.
drop policy invitations_select_admin on public.invitations;
create policy invitations_select_admin on public.invitations
  for select
  to authenticated
  using (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'invitations:view')
  );

drop policy invitations_insert_admin on public.invitations;
create policy invitations_insert_admin on public.invitations
  for insert
  to authenticated
  with check (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'invitations:create')
    and created_by = auth.uid()
  );

drop policy invitations_update_admin on public.invitations;
create policy invitations_update_admin on public.invitations
  for update
  to authenticated
  using (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'invitations:revoke')
  )
  with check (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'invitations:revoke')
  );

drop policy invitations_delete_admin on public.invitations;
create policy invitations_delete_admin on public.invitations
  for delete
  to authenticated
  using (
    public.has_page_permission(organization_id, 'members')
    and public.has_action_permission(organization_id, 'invitations:revoke')
  );

-- audit_events: supersedes 0009's version the same way -- role no longer
-- gates read access, only the 'activity' page permission does.
drop policy audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin on public.audit_events
  for select
  to authenticated
  using (public.has_page_permission(organization_id, 'activity'));

-- categories
drop policy categories_insert_admin on public.categories;
create policy categories_insert_admin on public.categories
  for insert
  to authenticated
  with check (
    public.has_page_permission(organization_id, 'categories')
    and public.has_action_permission(organization_id, 'categories:create')
  );

drop policy categories_update_admin on public.categories;
create policy categories_update_admin on public.categories
  for update
  to authenticated
  using (
    public.has_page_permission(organization_id, 'categories')
    and public.has_action_permission(organization_id, 'categories:edit')
  )
  with check (
    public.has_page_permission(organization_id, 'categories')
    and public.has_action_permission(organization_id, 'categories:edit')
  );

drop policy categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
  for delete
  to authenticated
  using (
    public.has_page_permission(organization_id, 'categories')
    and public.has_action_permission(organization_id, 'categories:delete')
  );

-- statuses
drop policy statuses_insert_admin on public.statuses;
create policy statuses_insert_admin on public.statuses
  for insert
  to authenticated
  with check (
    public.has_page_permission(organization_id, 'statuses')
    and public.has_action_permission(organization_id, 'statuses:create')
  );

drop policy statuses_update_admin on public.statuses;
create policy statuses_update_admin on public.statuses
  for update
  to authenticated
  using (
    public.has_page_permission(organization_id, 'statuses')
    and public.has_action_permission(organization_id, 'statuses:edit')
  )
  with check (
    public.has_page_permission(organization_id, 'statuses')
    and public.has_action_permission(organization_id, 'statuses:edit')
  );

drop policy statuses_delete_admin on public.statuses;
create policy statuses_delete_admin on public.statuses
  for delete
  to authenticated
  using (
    public.has_page_permission(organization_id, 'statuses')
    and public.has_action_permission(organization_id, 'statuses:delete')
  );

-- portal_settings: spec's view/edit/manage collapsed to one 'edit' key (see
-- registry.ts) -- applied identically to all three mutating policies.
drop policy portal_settings_insert_admin on public.portal_settings;
create policy portal_settings_insert_admin on public.portal_settings
  for insert
  to authenticated
  with check (
    public.has_page_permission(organization_id, 'portal_settings')
    and public.has_action_permission(organization_id, 'portal_settings:edit')
  );

drop policy portal_settings_update_admin on public.portal_settings;
create policy portal_settings_update_admin on public.portal_settings
  for update
  to authenticated
  using (
    public.has_page_permission(organization_id, 'portal_settings')
    and public.has_action_permission(organization_id, 'portal_settings:edit')
  )
  with check (
    public.has_page_permission(organization_id, 'portal_settings')
    and public.has_action_permission(organization_id, 'portal_settings:edit')
  );

drop policy portal_settings_delete_admin on public.portal_settings;
create policy portal_settings_delete_admin on public.portal_settings
  for delete
  to authenticated
  using (
    public.has_page_permission(organization_id, 'portal_settings')
    and public.has_action_permission(organization_id, 'portal_settings:edit')
  );

-- organizations: editing (name, etc.) gated by 'settings' page (0009) plus
-- organization_settings:edit. Delete stays owner-only and completely
-- untouched -- see this file's header on ownership.
drop policy organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update
  to authenticated
  using (
    public.has_page_permission(id, 'settings')
    and public.has_action_permission(id, 'organization_settings:edit')
  )
  with check (
    public.has_page_permission(id, 'settings')
    and public.has_action_permission(id, 'organization_settings:edit')
  );

-- submissions: member branch of insert gated by submissions:create; customer
-- branch (via has_organization_access, which is member-OR-customer)
-- decomposed so the customer path is completely untouched.
drop policy submissions_insert_member_or_customer on public.submissions;
create policy submissions_insert_member_or_customer on public.submissions
  for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and (
      public.is_organization_customer(organization_id)
      or (
        public.is_organization_member(organization_id)
        and public.has_action_permission(organization_id, 'submissions:create')
      )
    )
  );

-- Author branch (own row) stays unconditional. Admin branch (editing
-- someone else's submission, INCLUDING status transitions -- see
-- updateSubmissionStatusForOrganization) requires submissions:edit OR
-- submissions:manage. Postgres RLS is row-level, not column-level, so this
-- one UPDATE policy cannot distinguish "changed the title" from "changed
-- the status" -- there is no way to give 'manage' a materially different
-- RLS effect from 'edit' without column-level grants this codebase doesn't
-- use elsewhere. Both keys are kept distinct in the registry/UI (matching
-- the spec's own separate view/create/edit/delete/manage listing, and for
-- any future column-level split) but are equivalent at this policy today --
-- documented here rather than left as a silent surprise.
drop policy submissions_update_author_or_member on public.submissions;
create policy submissions_update_author_or_member on public.submissions
  for update
  to authenticated
  using (
    submitted_by = auth.uid()
    or public.has_action_permission(organization_id, 'submissions:edit')
    or public.has_action_permission(organization_id, 'submissions:manage')
  )
  with check (
    submitted_by = auth.uid()
    or public.has_action_permission(organization_id, 'submissions:edit')
    or public.has_action_permission(organization_id, 'submissions:manage')
  );

drop policy submissions_delete_admin on public.submissions;
create policy submissions_delete_admin on public.submissions
  for delete
  to authenticated
  using (public.has_action_permission(organization_id, 'submissions:delete'));

-- comments: member branch of insert gated by comments:create; customer
-- branch (is_internal = false only) untouched.
drop policy comments_insert_member_or_customer on public.comments;
create policy comments_insert_member_or_customer on public.comments
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and (
          (
            public.is_organization_member(s.organization_id)
            and public.has_action_permission(s.organization_id, 'comments:create')
          )
          or (
            comments.is_internal = false
            and public.is_organization_customer(s.organization_id)
          )
        )
    )
  );

drop policy comments_update_author_or_member on public.comments;
create policy comments_update_author_or_member on public.comments
  for update
  to authenticated
  using (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.has_action_permission(s.organization_id, 'comments:edit')
    )
  )
  with check (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.has_action_permission(s.organization_id, 'comments:edit')
    )
  );

drop policy comments_delete_author_or_admin on public.comments;
create policy comments_delete_author_or_admin on public.comments
  for delete
  to authenticated
  using (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.has_action_permission(s.organization_id, 'comments:moderate')
    )
  );

-- ---------------------------------------------------------------------------
-- accept_invitation: superseding 0009's version to also materialize
-- invitations.action_permissions into membership_action_permissions, on the
-- exact same "only for a newly created membership" condition as pages.
-- Every check from 0009's version is preserved verbatim.
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
  v_action_key text;
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

  select i.id, i.organization_id, i.email, i.role, i.expires_at, i.accepted_at,
         i.page_permissions, i.action_permissions
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

    foreach v_action_key in array coalesce(v_invitation.action_permissions, array[]::text[])
    loop
      insert into public.membership_action_permissions (membership_id, permission_key)
      values (v_membership_id, v_action_key)
      on conflict (membership_id, permission_key) do nothing;
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
  'row (FOR UPDATE). Refuses to grant role=owner. On first acceptance (new '
  'membership only), materializes both invitations.page_permissions and '
  'invitations.action_permissions -- an already-existing member''s grants '
  'are never touched by accepting a second invitation. Supersedes the '
  '0009 version (page permissions only).';

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: every existing non-owner membership gets its role's preset rows
-- in both tables, so nobody loses access when this migration (and 0009,
-- applied immediately before it) commit. See header. Values here must match
-- lib/authorization/registry.ts's ROLE_PRESETS exactly.
-- ---------------------------------------------------------------------------
insert into public.membership_page_permissions (membership_id, page)
select m.id, p.page
from public.memberships m
cross join (
  values ('dashboard'), ('categories'), ('statuses'), ('members'), ('activity'), ('settings'), ('portal_settings')
) as p(page)
where m.role = 'admin'
on conflict (membership_id, page) do nothing;

insert into public.membership_page_permissions (membership_id, page)
select m.id, p.page
from public.memberships m
cross join (values ('dashboard'), ('categories'), ('statuses')) as p(page)
where m.role = 'member'
on conflict (membership_id, page) do nothing;

insert into public.membership_action_permissions (membership_id, permission_key)
select m.id, k.key
from public.memberships m
cross join (
  values
    ('submissions:view'), ('submissions:create'), ('submissions:edit'), ('submissions:delete'), ('submissions:manage'),
    ('comments:view'), ('comments:create'), ('comments:edit'), ('comments:moderate'),
    ('categories:view'), ('categories:create'), ('categories:edit'), ('categories:delete'),
    ('statuses:view'), ('statuses:create'), ('statuses:edit'), ('statuses:delete'),
    ('members:view'), ('members:invite'), ('members:delete'),
    ('invitations:view'), ('invitations:create'), ('invitations:revoke'),
    ('roles_permissions:view'),
    ('portal_settings:edit'),
    ('organization_settings:edit')
) as k(key)
where m.role = 'admin'
on conflict (membership_id, permission_key) do nothing;

insert into public.membership_action_permissions (membership_id, permission_key)
select m.id, k.key
from public.memberships m
cross join (
  values ('submissions:view'), ('submissions:create'), ('comments:view'), ('comments:create')
) as k(key)
where m.role = 'member'
on conflict (membership_id, permission_key) do nothing;
