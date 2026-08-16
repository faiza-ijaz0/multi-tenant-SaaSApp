-- 0003_rls_policies.sql
-- RLS policies for every table enabled in 0001_initial_schema.sql, built on
-- the helper functions from 0002_rls_helpers.sql.
--
-- General shape used throughout:
--   - organization_id in every USING/WITH CHECK below is the row's own
--     stored column, resolved by Postgres against the actual table data --
--     never a value taken at face value from client input. That's what
--     makes "don't trust organization_id from the browser" true here: even
--     if a client crafts a request claiming org X, the row it's allowed to
--     touch is still gated by the authenticated user's real membership/
--     customer rows via the helper functions.
--   - Anonymous (anon role) access is granted only where the org's
--     portal_settings.is_public = true (public.is_portal_public), and never
--     to memberships, invitations, audit_events, notifications, internal
--     comments, or customer rows.
--   - Multiple permissive policies on the same command are OR'd together by
--     Postgres, so e.g. memberships has two separate INSERT policies
--     (bootstrap + admin-adds-member) instead of one combined expression.

-- ---------------------------------------------------------------------------
-- profiles: strictly self-service in Phase 1. No cross-member directory
-- read yet -- add that in the phase that actually builds a UI needing it,
-- scoped to whatever that UI requires.
-- ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_select_related on public.organizations
  for select
  to authenticated
  using (public.has_organization_access(id));

-- Any authenticated user may create an org (they become its first owner via
-- the memberships bootstrap policy below, in the same transaction).
create policy organizations_insert_authenticated on public.organizations
  for insert
  to authenticated
  with check (true);

create policy organizations_update_admin on public.organizations
  for update
  to authenticated
  using (public.is_organization_admin(id))
  with check (public.is_organization_admin(id));

-- Deleting the tenant root is owner-only, not admin-level.
create policy organizations_delete_owner on public.organizations
  for delete
  to authenticated
  using (public.is_organization_owner(id));

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create policy memberships_select_member on public.memberships
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

-- Bootstrap: a brand-new org has zero membership rows, so is_organization_admin
-- would otherwise lock everyone out of ever adding the first owner.
create policy memberships_insert_bootstrap_owner on public.memberships
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and role = 'owner'
    and not exists (
      select 1 from public.memberships existing
      where existing.organization_id = memberships.organization_id
    )
  );

create policy memberships_insert_admin on public.memberships
  for insert
  to authenticated
  with check (public.is_organization_admin(organization_id));

create policy memberships_update_admin on public.memberships
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy memberships_delete_admin_or_self on public.memberships
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    or profile_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- invitations: admin/owner-managed only. No customer or anonymous access --
-- and no email-matched "see my own pending invite" policy yet, since
-- accepting an invitation (verifying the raw token, creating the resulting
-- membership) is invitation-*flow* logic, out of scope for Phase 1's schema
-- foundation. See the Phase 1 report for this as a tracked follow-up.
-- ---------------------------------------------------------------------------
create policy invitations_select_admin on public.invitations
  for select
  to authenticated
  using (public.is_organization_admin(organization_id));

create policy invitations_insert_admin on public.invitations
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and created_by = auth.uid()
  );

create policy invitations_update_admin on public.invitations
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy invitations_delete_admin on public.invitations
  for delete
  to authenticated
  using (public.is_organization_admin(organization_id));

-- ---------------------------------------------------------------------------
-- customers: a customer sees/manages their own row; org admins see/manage
-- their org's customers. No anonymous access -- this table holds PII (email).
-- ---------------------------------------------------------------------------
create policy customers_select_self_or_admin on public.customers
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_organization_admin(organization_id)
  );

create policy customers_insert_self_or_admin on public.customers
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    or public.is_organization_admin(organization_id)
  );

create policy customers_update_self_or_admin on public.customers
  for update
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_organization_admin(organization_id)
  )
  with check (
    profile_id = auth.uid()
    or public.is_organization_admin(organization_id)
  );

create policy customers_delete_self_or_admin on public.customers
  for delete
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_organization_admin(organization_id)
  );

-- ---------------------------------------------------------------------------
-- portal_settings: every column here is public-facing branding/config (no
-- secrets), so a public row is exposed in full rather than needing
-- column-level restriction -- members always see their own org's settings,
-- and anon/unrelated users see only rows with is_public = true.
-- ---------------------------------------------------------------------------
create policy portal_settings_select_member_or_public on public.portal_settings
  for select
  to public
  using (
    public.is_organization_member(organization_id)
    or is_public = true
  );

create policy portal_settings_insert_admin on public.portal_settings
  for insert
  to authenticated
  with check (public.is_organization_admin(organization_id));

create policy portal_settings_update_admin on public.portal_settings
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy portal_settings_delete_admin on public.portal_settings
  for delete
  to authenticated
  using (public.is_organization_admin(organization_id));

-- ---------------------------------------------------------------------------
-- categories: members see everything (incl. archived, for management);
-- customers always see active categories regardless of the portal's public
-- flag (they're already a known, scoped relationship); anon/unrelated users
-- see active categories only when the portal is public.
-- ---------------------------------------------------------------------------
create policy categories_select_scoped on public.categories
  for select
  to public
  using (
    public.is_organization_member(organization_id)
    or (
      is_active = true
      and (
        public.is_organization_customer(organization_id)
        or public.is_portal_public(organization_id)
      )
    )
  );

create policy categories_insert_admin on public.categories
  for insert
  to authenticated
  with check (public.is_organization_admin(organization_id));

create policy categories_update_admin on public.categories
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy categories_delete_admin on public.categories
  for delete
  to authenticated
  using (public.is_organization_admin(organization_id));

-- ---------------------------------------------------------------------------
-- statuses: same visibility shape as categories, minus the is_active gate
-- (statuses has no archive concept -- every status is part of the workflow).
-- ---------------------------------------------------------------------------
create policy statuses_select_scoped on public.statuses
  for select
  to public
  using (
    public.is_organization_member(organization_id)
    or public.is_organization_customer(organization_id)
    or public.is_portal_public(organization_id)
  );

create policy statuses_insert_admin on public.statuses
  for insert
  to authenticated
  with check (public.is_organization_admin(organization_id));

create policy statuses_update_admin on public.statuses
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy statuses_delete_admin on public.statuses
  for delete
  to authenticated
  using (public.is_organization_admin(organization_id));

-- ---------------------------------------------------------------------------
-- submissions
-- No anonymous INSERT: creating feedback requires being an authenticated
-- member or customer of the org (spam/abuse surface, and the spec's
-- anonymous-allowed list is read-only). submitted_by is always forced to
-- auth.uid() -- a client can never author a submission as someone else.
-- ---------------------------------------------------------------------------
create policy submissions_select_scoped on public.submissions
  for select
  to public
  using (
    public.is_organization_member(organization_id)
    or public.is_organization_customer(organization_id)
    or public.is_portal_public(organization_id)
  );

create policy submissions_insert_member_or_customer on public.submissions
  for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and public.has_organization_access(organization_id)
  );

create policy submissions_update_author_or_member on public.submissions
  for update
  to authenticated
  using (
    submitted_by = auth.uid()
    or public.is_organization_member(organization_id)
  )
  with check (
    submitted_by = auth.uid()
    or public.is_organization_member(organization_id)
  );

create policy submissions_delete_admin on public.submissions
  for delete
  to authenticated
  using (public.is_organization_admin(organization_id));

-- ---------------------------------------------------------------------------
-- votes
-- Visibility mirrors the submission it belongs to (join, since votes has no
-- organization_id column of its own -- see 0001, "no duplicated
-- authorization state"). No UPDATE policy at all: a vote is cast or
-- retracted (insert/delete), never edited -- so "a user modifying another
-- user's vote" has no code path to even attempt, for anyone, including
-- admins. Duplicate votes are rejected by votes_submission_user_unique
-- regardless of RLS.
-- ---------------------------------------------------------------------------
create policy votes_select_scoped on public.votes
  for select
  to public
  using (
    exists (
      select 1
      from public.submissions s
      where s.id = votes.submission_id
        and (
          public.is_organization_member(s.organization_id)
          or public.is_organization_customer(s.organization_id)
          or public.is_portal_public(s.organization_id)
        )
    )
  );

create policy votes_insert_authenticated on public.votes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.submissions s
      where s.id = votes.submission_id
        and (
          public.is_organization_member(s.organization_id)
          or public.is_organization_customer(s.organization_id)
          or public.is_portal_public(s.organization_id)
        )
    )
  );

create policy votes_delete_self_or_admin on public.votes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = votes.submission_id
        and public.is_organization_admin(s.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- comments
-- is_internal is the load-bearing column here: the customer/public branch of
-- every policy below requires is_internal = false, so an internal note can
-- never satisfy a non-member policy branch no matter what else is true.
-- ---------------------------------------------------------------------------
create policy comments_select_scoped on public.comments
  for select
  to public
  using (
    exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and (
          public.is_organization_member(s.organization_id)
          or (
            comments.is_internal = false
            and (
              public.is_organization_customer(s.organization_id)
              or public.is_portal_public(s.organization_id)
            )
          )
        )
    )
  );

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
          public.is_organization_member(s.organization_id)
          or (
            comments.is_internal = false
            and public.is_organization_customer(s.organization_id)
          )
        )
    )
  );

create policy comments_update_author_or_member on public.comments
  for update
  to authenticated
  using (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.is_organization_member(s.organization_id)
    )
  )
  with check (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.is_organization_member(s.organization_id)
    )
  );

create policy comments_delete_author_or_admin on public.comments
  for delete
  to authenticated
  using (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.is_organization_admin(s.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- notifications: purely personal. Deliberately no INSERT policy at all --
-- direct client inserts are blocked entirely (default deny), so one member
-- can't spam fake notifications at another. Real creation will go through a
-- SECURITY DEFINER trigger/function in whichever later phase adds the
-- triggering events (status change, reply, etc.), which bypasses RLS by
-- design rather than needing a client-facing INSERT policy here.
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete
  to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_events: admin-readable, admin-writable-as-self, and -- deliberately
-- -- no UPDATE or DELETE policy for anyone, including owners. Combined with
-- having no updated_at column at all (0001), this makes the log append-only
-- at the schema level, not just by convention.
-- ---------------------------------------------------------------------------
create policy audit_events_select_admin on public.audit_events
  for select
  to authenticated
  using (public.is_organization_admin(organization_id));

create policy audit_events_insert_admin on public.audit_events
  for insert
  to authenticated
  with check (
    public.is_organization_admin(organization_id)
    and actor_profile_id = auth.uid()
  );
