# Architecture

## Stack

Next.js 16 App Router, React Server Components by default, TypeScript strict. Supabase (Postgres + Auth + RLS) is the only backend — no separate backend service. Server Actions handle authenticated mutations; Route Handlers exist only where a stable HTTP contract is genuinely needed (webhooks, auth callbacks). Tailwind CSS + shadcn/ui (Radix primitives, Lucide icons) for UI.

## Multi-tenancy

Single shared Postgres database. Every tenant-owned table carries `organization_id`. Row Level Security is the enforcement boundary — `organization_id` is never trusted from the client; it's resolved server-side from the authenticated user's membership/customer rows. App-level checks are defense-in-depth, not the primary boundary.

## Identity and authorization

Supabase Auth is the single identity system for everyone — no separate auth provider for portal customers. Authentication (who) is kept separate from authorization (what):

- **Org roles** (`memberships.role`): Owner, Admin, Member.
- **Customer**: not an org role — a `(organization_id, profile_id)` row in `customers` scoping a profile to a specific org's public portal. The same person can be a team member of one org and a customer of another.

## Voting

Authenticated only, no anonymous voting. One vote per user per submission enforced by a unique constraint on `(user_id, submission_id)`. Vote counts are always server-computed, never client-supplied.

## Public portal

One portal per organization at `/feedback/[orgSlug]` (route currently scaffolded as a static `/feedback` placeholder pending org resolution in a later phase). RLS grants anonymous/customer read access only to intentionally public data — never internal notes, audit history, team info, or analytics.

## Folder structure

```
app/                  routes — Server Components by default
  dashboard/           authenticated org workspace shell
  feedback/            public portal shell
components/
  ui/                  shadcn primitives
  layout/              shell, nav, containers
  states/              empty/error/loading, page header, confirm dialog
features/              one folder per domain (submissions, votes, comments, categories,
                       statuses, customers, members, invitations, notifications, audit,
                       analytics, portal-settings) — owns its own queries/actions/schemas
lib/                   cross-cutting code (supabase clients, auth, validation — added as needed)
supabase/migrations/   version-controlled SQL, source of truth for the schema
tests/                 unit / integration / e2e
```

Business logic lives in `features/*` and `lib/*`, never inline in page components.

## Supabase project and migration workflow

Development runs against a dedicated hosted **`SignalBoard Development`** Supabase project (not local Docker, not production). Production gets its own separate project later.

Schema changes always go: write/update a migration file in `supabase/migrations/` → apply via the Supabase MCP → verify the resulting schema → test the relevant RLS policy → report what changed. No undocumented changes made directly in Supabase Studio.

## Status

Phase 0 (this foundation): scaffolding, design system, app shell, error/loading boundaries, environment config. No auth, no database schema, no feedback features yet — those begin in later phases.
