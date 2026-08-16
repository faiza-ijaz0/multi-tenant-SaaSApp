-- 0001_initial_schema.sql
-- SignalBoard Phase 1: production database foundation.
-- Tables, constraints, and indexes for the multi-tenant feedback platform.
-- RLS is enabled per-table here but policies are defined in 0003_rls_policies.sql
-- (helper functions land first, in 0002_rls_helpers.sql).

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth.users identity. id intentionally mirrors auth.users.id
-- (not a separate surrogate key) so every other table can FK straight to
-- profiles without an extra join to auth.users.
--
-- Row creation is expected to happen via an auth.users trigger in a later
-- phase (full auth flow is explicitly out of scope for Phase 1). The shape
-- here is already safe for that: INSERT ... ON CONFLICT (id) DO NOTHING
-- against this table is idempotent because id is the primary key and the
-- only NOT NULL columns are the identity + timestamps.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One-to-one with auth.users. Populated idempotently (insert ... on conflict (id) do nothing), '
  'expected trigger source: auth.users after insert. Trigger itself is a later-phase concern.';

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- organizations
-- Tenant root. Every tenant-owned table below carries organization_id and
-- cascades from here.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> '')
);

create trigger set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships
-- Org-team relationship. Role is one of owner/admin/member -- see docs on
-- keeping the permission matrix in application code (no roles/permissions
-- tables in Phase 1).
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_role_check check (role in ('owner', 'admin', 'member')),
  constraint memberships_org_profile_unique unique (organization_id, profile_id)
);

-- memberships_org_profile_unique already indexes organization_id as its
-- leftmost column; profile_id still needs its own index for reverse lookups
-- ("which orgs does this profile belong to").
create index memberships_profile_id_idx on public.memberships (profile_id);

create trigger set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invitations
-- Pending org invites. The raw invitation token is never persisted -- only
-- a hash of it, so a leaked database backup can't be used to accept invites.
-- The app is expected to generate the raw token, email it to the invitee,
-- and store only sha256(raw_token) (or equivalent) here.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_role_check check (role in ('owner', 'admin', 'member')),
  constraint invitations_email_format_check check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint invitations_expires_after_created_check check (expires_at > created_at),
  constraint invitations_token_hash_unique unique (token_hash)
);

comment on column public.invitations.token_hash is
  'Hash of the invitation token (e.g. sha256), never the raw token. The raw '
  'token exists only transiently in the invite email/link.';

create index invitations_organization_id_idx on public.invitations (organization_id);

-- One pending (unaccepted) invitation per email per org.
create unique index invitations_org_email_pending_unique
  on public.invitations (organization_id, lower(email))
  where accepted_at is null;

create trigger set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- customers
-- Public-portal participation, scoped per organization. Deliberately NOT a
-- membership role: a profile can be a team member of one org and a customer
-- of a different org at the same time.
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_format_check check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint customers_org_profile_unique unique (organization_id, profile_id)
);

create index customers_profile_id_idx on public.customers (profile_id);

create trigger set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- portal_settings
-- Exactly one row per organization. slug is globally unique (it's the public
-- URL segment at /feedback/[orgSlug]).
-- ---------------------------------------------------------------------------
create table public.portal_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  slug text not null unique,
  brand_name text,
  logo_url text,
  accent_color text not null default '#6366F1',
  welcome_message text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_settings_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint portal_settings_slug_length_check check (char_length(slug) between 3 and 63),
  constraint portal_settings_accent_color_format_check check (accent_color ~* '^#[0-9a-f]{6}$')
);

create trigger set_updated_at
  before update on public.portal_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories
-- organization_id + id is unique (in addition to the id primary key) so that
-- submissions can take a composite foreign key against it -- see submissions
-- below for why that matters.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> ''),
  constraint categories_org_id_unique unique (organization_id, id)
);

create unique index categories_org_name_unique on public.categories (organization_id, lower(name));
create index categories_org_sort_idx on public.categories (organization_id, sort_order);

create trigger set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- statuses
-- Same organization_id + id uniqueness pattern as categories, for the same
-- composite-FK reason.
-- ---------------------------------------------------------------------------
create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  color text not null default '#6B7280',
  sort_order integer not null default 0,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statuses_name_not_blank check (btrim(name) <> ''),
  constraint statuses_color_format_check check (color ~* '^#[0-9a-f]{6}$'),
  constraint statuses_org_id_unique unique (organization_id, id)
);

create unique index statuses_org_name_unique on public.statuses (organization_id, lower(name));
create index statuses_org_sort_idx on public.statuses (organization_id, sort_order);

create trigger set_updated_at
  before update on public.statuses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- submissions
-- category_id and status_id use composite foreign keys against
-- (organization_id, id) on categories/statuses, not plain id references.
-- That makes it *structurally impossible* -- enforced by Postgres, not just
-- RLS or app code -- for a submission to reference a category or status that
-- belongs to a different organization, no matter what organization_id a
-- client supplies.
--
-- category_id is nullable (a category can be archived/removed without
-- destroying submissions -- ON DELETE SET NULL, column-scoped so only
-- category_id is nulled, not organization_id). status_id is required and
-- ON DELETE RESTRICT: a status in use cannot be deleted until submissions
-- are reassigned, since a submission without a workflow state is a bug, not
-- a valid state. Requires Postgres 15+ for column-scoped SET NULL.
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid,
  status_id uuid not null,
  submitted_by uuid references public.profiles (id) on delete set null,
  title text not null,
  description text,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_title_not_blank check (btrim(title) <> ''),
  constraint submissions_type_check check (type in ('feature', 'bug')),
  constraint submissions_category_org_fk
    foreign key (organization_id, category_id)
    references public.categories (organization_id, id)
    on delete set null (category_id),
  constraint submissions_status_org_fk
    foreign key (organization_id, status_id)
    references public.statuses (organization_id, id)
    on delete restrict
);

comment on constraint submissions_category_org_fk on public.submissions is
  'Composite FK against categories(organization_id, id): a submission cannot '
  'reference another organization''s category even if a client-supplied '
  'organization_id were somehow accepted upstream.';
comment on constraint submissions_status_org_fk on public.submissions is
  'Composite FK against statuses(organization_id, id), same cross-tenant '
  'guarantee as submissions_category_org_fk. RESTRICT because every '
  'submission must always have a valid workflow status.';

create index submissions_organization_id_idx on public.submissions (organization_id);
create index submissions_org_status_idx on public.submissions (organization_id, status_id);
create index submissions_org_category_idx on public.submissions (organization_id, category_id);
create index submissions_submitted_by_idx on public.submissions (submitted_by);

create trigger set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- votes
-- Deliberately no updated_at: a vote isn't edited, it's cast or retracted
-- (insert or delete). Vote counts are always computed with count(*) at query
-- time -- there is no stored aggregate to drift out of sync.
-- ---------------------------------------------------------------------------
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint votes_submission_user_unique unique (submission_id, user_id)
);

create index votes_user_id_idx on public.votes (user_id);

-- ---------------------------------------------------------------------------
-- comments
-- is_internal splits team-only notes from portal-visible replies. Enforcing
-- that split is entirely the job of RLS (0003_rls_policies.sql) -- this
-- table makes no assumption about who can read what.
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  author_profile_id uuid references public.profiles (id) on delete set null,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_not_blank check (btrim(body) <> '')
);

create index comments_submission_id_idx on public.comments (submission_id);
create index comments_submission_internal_idx on public.comments (submission_id, is_internal);
create index comments_author_profile_id_idx on public.comments (author_profile_id);

create trigger set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- Purely personal -- read/write scoped to profile_id in RLS, no org-wide or
-- customer/anonymous access at all.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_type_not_blank check (btrim(type) <> '')
);

create index notifications_profile_created_idx on public.notifications (profile_id, created_at desc);
create index notifications_profile_unread_idx on public.notifications (profile_id) where read_at is null;
create index notifications_organization_id_idx on public.notifications (organization_id);

create trigger set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_events
-- Append-only by design: created_at only, no updated_at, and (see
-- 0003_rls_policies.sql) no UPDATE/DELETE policy at all -- not even for
-- owners. An audit log that can be edited isn't an audit log.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_not_blank check (btrim(action) <> ''),
  constraint audit_events_entity_type_not_blank check (btrim(entity_type) <> '')
);

create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Enable RLS on every tenant-owned/identity table. Policies land in
-- 0003_rls_policies.sql, after the helper functions in 0002_rls_helpers.sql.
-- Enabling here with no policies yet means these tables default-deny all
-- access (other than the table owner / service role) in the gap between
-- migrations, which is the safe direction to fail in.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.customers enable row level security;
alter table public.portal_settings enable row level security;
alter table public.categories enable row level security;
alter table public.statuses enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;
