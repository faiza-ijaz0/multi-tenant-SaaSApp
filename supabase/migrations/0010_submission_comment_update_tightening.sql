-- 0010_submission_comment_update_tightening.sql
-- NOT APPLIED. Prepared for review per the Phase 14 approval gate.
--
-- ---------------------------------------------------------------------------
-- THE GAP
-- ---------------------------------------------------------------------------
-- submissions_update_author_or_member and comments_update_author_or_member
-- (0003_rls_policies.sql) both grant UPDATE to "the author, OR any member of
-- the organization" -- so today, any plain member can silently edit another
-- member's or customer's submission title/description, or edit another
-- member's comment body, with no ownership relationship to it at all. Only
-- DELETE was ever admin-gated (submissions_delete_admin,
-- comments_delete_author_or_admin); UPDATE was not. This is broader than
-- every other admin-gated resource in the schema (categories, statuses,
-- invitations, memberships) and was flagged during the Phase 14 audit as
-- inconsistent with "not all roles get full CRUD by default."
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Replace "is_organization_member" with "is_organization_admin" in both
-- policies' USING/WITH CHECK. The author-of-the-row branch
-- (submitted_by = auth.uid() / author_profile_id = auth.uid()) is completely
-- unchanged -- an author can still always edit their own submission/comment.
-- What changes is who can edit *someone else's*: previously any member,
-- now only an admin/owner. This is a strengthening of existing RLS, not a
-- weakening -- no previously-blocked case becomes newly allowed.
--
-- No application code currently relies on the "any member can edit any
-- submission/comment" behavior (features/submissions/actions.ts only ever
-- updates status, via a separate admin-gated path in status.ts; no update
-- action exists for comments at all yet) -- so this cannot regress any
-- existing shipped feature. It intentionally narrows the policy ahead of
-- Phase 14 adding real submission/comment edit actions, so those new
-- actions inherit the correct boundary from the schema rather than the
-- schema being looser than the feature that's about to use it.
--
-- ---------------------------------------------------------------------------
-- TESTS REQUIRED BEFORE/WHEN APPLYING
-- ---------------------------------------------------------------------------
--   - the author of a submission/comment can still update it
--   - an admin/owner can still update any submission/comment in their org
--   - a plain member who is NOT the author can no longer update a
--     submission/comment authored by someone else (new denial -- was
--     previously allowed)
--   - a customer (portal user) who is the author can still update their own
--     submission/comment (unaffected -- customers were never covered by the
--     is_organization_member branch to begin with, only by the author branch)
-- ---------------------------------------------------------------------------

drop policy submissions_update_author_or_member on public.submissions;
create policy submissions_update_author_or_member on public.submissions
  for update
  to authenticated
  using (
    submitted_by = auth.uid()
    or public.is_organization_admin(organization_id)
  )
  with check (
    submitted_by = auth.uid()
    or public.is_organization_admin(organization_id)
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
        and public.is_organization_admin(s.organization_id)
    )
  )
  with check (
    author_profile_id = auth.uid()
    or exists (
      select 1
      from public.submissions s
      where s.id = comments.submission_id
        and public.is_organization_admin(s.organization_id)
    )
  );
