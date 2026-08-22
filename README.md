# SignalBoard

A multi-tenant customer feedback platform. Organizations get an isolated workspace, a branded public feedback portal, role-based team management, and analytics — all on a single shared Postgres database secured end-to-end by Supabase Row Level Security.

---

## Table of contents

1. [Overview](#1-overview)
2. [What SignalBoard Does](#2-what-signalboard-does)
3. [Core Problem It Solves](#3-core-problem-it-solves)
4. [Key Features](#4-key-features)
5. [Product Architecture](#5-product-architecture)
6. [Multi-Tenant Architecture](#6-multi-tenant-architecture)
7. [Organization Model](#7-organization-model)
8. [Customer Model](#8-customer-model)
9. [Authentication Architecture](#9-authentication-architecture)
10. [Internal vs Customer Authentication](#10-internal-vs-customer-authentication)
11. [Role-Based Access Control](#11-role-based-access-control)
12. [Permissions Architecture](#12-permissions-architecture)
13. [Owner / Admin / Member Roles](#13-owner--admin--member-roles)
14. [Customer Portal](#14-customer-portal)
15. [Feedback Lifecycle](#15-feedback-lifecycle)
16. [Submission Workflow](#16-submission-workflow)
17. [Categories](#17-categories)
18. [Statuses](#18-statuses)
19. [Comments](#19-comments)
20. [Votes](#20-votes)
21. [Organization Members](#21-organization-members)
22. [Invitations](#22-invitations)
23. [Activity / Audit](#23-activity--audit)
24. [Analytics](#24-analytics)
25. [Dashboard](#25-dashboard)
26. [Marketing Website](#26-marketing-website)
27. [Portal Branding](#27-portal-branding)
28. [Security / RLS](#28-security--rls)
29. [Database Architecture](#29-database-architecture)
30. [Data Isolation](#30-data-isolation)
31. [Authorization Boundaries](#31-authorization-boundaries)
32. [Project Structure](#32-project-structure)
33. [Technology Stack](#33-technology-stack)
34. [Installation](#34-installation)
35. [Environment Variables](#35-environment-variables)
36. [Local Development](#36-local-development)
37. [Database / Supabase Setup](#37-database--supabase-setup)
38. [Migrations](#38-migrations)
39. [Testing](#39-testing)
40. [Linting](#40-linting)
41. [Type Checking](#41-type-checking)
42. [Production Build](#42-production-build)
43. [Deployment](#43-deployment)
44. [Vercel Deployment](#44-vercel-deployment)
45. [Supabase Deployment](#45-supabase-deployment)
46. [Security Considerations](#46-security-considerations)
47. [Production Checklist](#47-production-checklist)
48. [Known Limitations](#48-known-limitations)
49. [Future Roadmap](#49-future-roadmap)
50. [License](#50-license)

---

## 1. Overview

SignalBoard is a SaaS product for collecting, triaging, and acting on customer feedback. An organization signs up, gets its own workspace, and opens a public (or private, invite-only) feedback portal branded to that organization. Customers submit feature requests and bug reports, vote on what matters to them, and get replies from the team. Internally, the organization's staff triage submissions with categories and statuses, discuss them via comments, and track engagement through analytics — all governed by a role- and permission-based access model enforced at the database layer.

## 2. What SignalBoard Does

- Lets an organization create an isolated workspace with its own team, categories, statuses, and branded portal.
- Lets that organization's customers register, submit feedback, vote, comment, and track their own submissions.
- Lets the organization's team triage, categorize, respond to, and resolve feedback from a shared dashboard.
- Surfaces aggregate analytics (volume, status distribution, engagement) so decisions are based on real signal, not anecdote.

## 3. Core Problem It Solves

Product teams collect feedback across scattered channels — email, chat, spreadsheets — with no shared, customer-facing record of what was asked for or what happened to it. SignalBoard gives each organization a single, structured, tenant-isolated home for that feedback: customers can see their request move from submitted to shipped, and the team gets one filterable, permission-gated queue instead of a scattered inbox.

## 4. Key Features

- Multi-tenant organizations with fully isolated data
- Public or private, brandable customer feedback portal per organization
- Customer registration, sign-in, submission, voting, commenting, and a personal "My Feedback" view
- Internal dashboard: submissions queue, categories, statuses, activity log, analytics
- Owner / Admin / Member roles, layered with granular per-page and per-action permission grants
- Email-based invitations *and* direct admin-created member accounts
- Audit log of admin- and member-authored events
- Notification scaffolding for in-app alerts
- Ownership transfer with structural single-owner invariants
- Marketing site explaining the product to prospective organizations

## 5. Product Architecture

Next.js 16 (App Router, React Server Components by default) is both the frontend and the application server. There is no separate backend service — Supabase (Postgres + Auth + Row Level Security) is the entire backend. Server Actions handle authenticated mutations directly against Supabase from the server; Route Handlers exist only where a stable HTTP contract is genuinely required (the Supabase Auth email-confirmation callback).

Two flows converge on the same database and the same Supabase Auth system, kept structurally separate at the routing and RLS layer:

```
Organization:
Marketing (/) → Internal Signup (/signup) → Onboarding (/onboarding) →
Dashboard (/dashboard) → Members/Roles → Feedback Management → Analytics

Customer:
Marketing (/) → Customer Auth (/feedback/sign-in, /feedback/sign-up) →
Portal Connect (/feedback/portal) → Organization Portal (/feedback/[slug]) →
Submit Feedback → visible on the Organization's Dashboard
```

## 6. Multi-Tenant Architecture

Single shared Postgres database. Every tenant-owned table carries an `organization_id` column. `organization_id` is **never** trusted from the client — it is always resolved server-side from the authenticated caller's real `memberships` or `customers` row (`lib/auth/organization.ts`'s `resolveOrganizationContext`), then re-enforced independently by Row Level Security on every query. Composite foreign keys (e.g. `submissions (organization_id, category_id) → categories (organization_id, id)`) make it structurally impossible for a submission to reference a category or status belonging to a different organization, not just conventionally unlikely.

## 7. Organization Model

An `organizations` row is the tenant boundary. Every internal user relates to it through a `memberships` row (`organization_id`, `profile_id`, `role`). A `profiles` row (one-to-one with `auth.users`) is the shared identity both internal members and customers are built on. A single person can hold a `memberships` row in one organization and a `customers` row in a completely different one — the same Supabase Auth account, two independent, RLS-scoped relationships.

## 8. Customer Model

A "customer" is not a role — it's a `(organization_id, profile_id)` row in the `customers` table, representing a real, registered relationship between a person and one specific organization's portal. Customers and internal members share the same Supabase Auth system and the same `profiles` table, but the two relationships are independently resolved and never conflated: `features/customers/customer-eligibility.ts`'s `isEligibleCustomerForOrganization` explicitly checks that an authenticated account either (a) has a real `customers` row for the target organization, or (b) holds *no* internal `memberships` row there — so an org's own owner/admin/member is never silently treated as a customer of their own organization just because they can authenticate.

## 9. Authentication Architecture

Supabase Auth is the **single** identity system for everyone — there is no second, parallel auth provider for customers. Authentication (proving who you are) and authorization (what you're allowed to do once identified) are kept strictly separate: a successful sign-in only proves identity; every subsequent read/write is re-authorized against real `memberships`/`customers`/permission-grant rows, enforced by RLS.

## 10. Internal vs Customer Authentication

Two front doors onto the one auth system, deliberately separated by route and by post-login logic:

- **Internal**: `/login`, `/signup` → lands in `/dashboard` (or `/onboarding` if the account has no organization yet).
- **Customer**: `/feedback/sign-in`, `/feedback/sign-up` → lands in `/feedback/portal` or a specific organization's portal.

`customerLogin` (`lib/auth/customer-auth-actions.ts`) is the concrete fix for the obvious risk here: a valid Supabase Auth session is *not* by itself proof of customer-portal eligibility. When the login targets a specific organization's portal, it re-checks `isEligibleCustomerForOrganization` and signs the session back out immediately if the authenticated account turns out to be that organization's own internal staff rather than a real customer. `next` redirect targets are sanitized on both sides (`sanitizeNextPath` / `sanitizeCustomerNextPath`) to same-origin, audience-scoped paths only — protocol-relative (`//host`) and backslash-normalized (`/\host`) redirect payloads are both rejected, so neither flow can be used as an open redirect or to cross into the other flow's route space.

## 11. Role-Based Access Control

Every internal member has exactly one role — Owner, Admin, or Member — stored on their `memberships` row and structurally protected (a non-owner can never grant themselves ownership; the real owner can never be demoted or removed by anyone but themselves via ownership transfer). Role alone answers "what tier is this person," not "exactly what can they touch" — that's the permissions layer described next.

## 12. Permissions Architecture

Layered on top of role, two independent, per-membership grant tables:

- **Page permissions** (`membership_page_permissions`) — which of the nine dashboard routes (`lib/authorization/registry.ts`'s `PAGE_KEYS`: Dashboard, Submissions, Categories, Statuses, Role Management, Activity, Organization Settings, Portal Settings, Organization Members) a non-owner may even navigate to.
- **Action permissions** (`membership_action_permissions`) — fine-grained `resource:action` grants (e.g. `submissions:edit`, `categories:delete`, `roles_permissions:manage_permissions`) governing what a non-owner may *do* once on a page.

Both are enforced by RLS itself (`has_page_permission` / `has_action_permission`, SECURITY DEFINER SQL functions), not just hidden in the UI — a member without a grant can't perform the action via a raw API call either. The owner bypasses both tables unconditionally and never holds grant rows. An author acting on their own submission/comment is always allowed regardless of grants; action permissions only gate acting on *someone else's* row or on resources with no authorship concept. Invitations carry their intended page/action grants and materialize them into real grant rows only on first acceptance (`accept_invitation`).

## 13. Owner / Admin / Member Roles

- **Owner**: exactly one per organization at all times, enforced by database triggers (`enforce_membership_owner_insert_protection`, `enforce_membership_owner_delete_protection`, `enforce_membership_role_invariants`). Bypasses every page/action permission check. Can transfer ownership (`transfer_organization_ownership`) and delete the organization. Cannot be demoted or removed by anyone else.
- **Admin**: broad default access (submissions, categories, statuses, members, activity, settings, portal settings) but — by deliberate design — does *not* get `roles_permissions:assign_role` / `manage_permissions` by default. Changing another member's role or permission grants requires an explicit grant from the owner, even for an admin.
- **Member**: default access to view/create submissions and comments, and view categories/statuses. Everything beyond that requires an explicit action-permission grant.

## 14. Customer Portal

A public (or private, customer-only) feedback site at `/feedback/[slug]`, brandable per organization (`portal_settings`: brand name, logo, accent color, welcome message). The customer journey: sign up or sign in → land on `/feedback/portal` (or directly on their organization's portal via a saved link) → browse/submit feedback → vote → comment → track their own submissions on `/feedback/[slug]/my-feedback` → manage their profile → sign out. A private portal (`is_public = false`) is still reachable by its own real, registered customers — enforced by the `is_organization_customer` branch on `portal_settings`' and every sibling portal-scoped table's SELECT policy.

## 15. Feedback Lifecycle

```
Customer submits → appears in the organization's dashboard submissions queue →
triaged with a category and a status → discussed via comments (internal-only
or customer-visible) → status progressed by the team → customer sees the
same status update on their own submission
```

Every step is logged for admin visibility (see Activity / Audit) and reflected in dashboard analytics.

## 16. Submission Workflow

A `submissions` row always carries `organization_id`, `type` (`feature` or `bug`), a `category_id`/`status_id` (composite-FK-bound to that same organization), and `submitted_by`. Both internal members and real customers can create submissions in their respective organization; only the author or a member holding `submissions:edit`/`submissions:manage` can update someone else's; only `submissions:delete` can remove one. Status changes go through `updateSubmissionStatusForOrganization`, which is also the one real code path that writes a `submission.status_changed` audit event.

## 17. Categories

Per-organization, admin-managed (`categories:create/edit/delete` action permissions, `categories` page permission) labels submissions are triaged into. Customers and members alike can view active categories; only admins/owners with the relevant grant can manage them.

## 18. Statuses

Per-organization, admin-managed workflow states (each with a color and an `is_closed` flag) a submission progresses through. Same permission shape as Categories. Optimistic-concurrency-safe reordering (a stale `sort_order` in the WHERE clause is a documented, tested no-op, not a silent overwrite).

## 19. Comments

Attached to a submission, authored by either an internal member or a customer. `is_internal` distinguishes team-only notes from customer-visible replies — a customer can never insert or see an internal comment. Editing/deleting someone else's comment (not your own) requires `comments:edit`/`comments:moderate`.

## 20. Votes

One vote per authenticated user per submission (`(user_id, submission_id)` unique constraint) — authenticated only, no anonymous voting, no client-supplied vote counts. Adding/removing a vote is a straightforward self-scoped insert/delete; there is no admin override concept for another user's vote.

## 21. Organization Members

The organization's real internal roster, managed from `/dashboard/settings/organization/members` (viewing/removing members) and `/dashboard/role-management` (role and permission grants). Self-removal is allowed for non-owners; the owner can never be removed, and a member can never remove someone else without `members:delete`.

## 22. Invitations

Two paths onto membership:

- **Invitation link** (`invitations` table, `accept_invitation` RPC): time-limited, single-use, token-hashed (never a raw token at rest), carries the intended role plus page/action grants, and cannot grant `owner`. No email provider is wired up yet (`features/members/email-delivery.ts`'s `sendInvitationEmail` is a deliberate no-op) — delivery today is the admin sharing the generated invite link directly, shown as a copyable link in the invitation-management UI regardless of whether email delivery is ever added.
- **Direct admin-created account** (`create_member_account` RPC + the Auth Admin API via a server-only service-role client): an admin sets a password directly; if the RPC's own independent authorization check rejects the membership, the just-created auth user is rolled back rather than left as a dangling, orgless account.

## 23. Activity / Audit

`audit_events` records admin-authored events (role changes, category/status edits, ownership transfers) via direct RLS-gated inserts, readable only by admins/owners holding the `activity` page permission. A narrow, allowlisted RPC for two non-admin events — `submission.created`/`comment.created`, so a plain member or customer could log their own action without a broader insert policy — is drafted (`supabase/migrations/0012_audit_log_rpc.sql`, `log_audit_event`) but **not yet applied** to the hosted database and not called anywhere in application code; see [§48](#48-known-limitations).

## 24. Analytics

Dashboard-level aggregate reporting (`lib/analytics/`, `components/analytics/`) over submission volume, status distribution, and member engagement, rendered with Chart.js. Charts are always fed pre-aggregated, server-computed data scoped to the caller's organization — never a raw full-table fetch to the client.

## 25. Dashboard

The internal workspace shell (`app/dashboard/`) — sidebar navigation filtered server-side to exactly the pages the caller's real, RLS-backed permissions allow (never client-side hiding of links the API would still accept), a topbar with identity and notifications, and the submissions/categories/statuses/activity/settings pages themselves.

## 26. Marketing Website

The public `/` route explains the product to prospective organizations: what SignalBoard is, who it's for, the organization and customer journeys, multi-tenancy, roles and permissions, and the feedback lifecycle — all built from real product capabilities, with no fabricated metrics or certifications.

## 27. Portal Branding

Each organization's `portal_settings` row controls its public-facing identity: `brand_name`, `logo_url`, `accent_color`, `welcome_message`, and `is_public`/`slug` for the portal's visibility and URL. Only an admin/owner holding `portal_settings:edit` can change it; view access follows the same member-or-customer-or-public shape every other portal-scoped table uses.

## 28. Security / RLS

Row Level Security is the actual authorization boundary on every tenant-owned table — enabled on all of them, with no table left open to a default-allow policy. Cross-boundary operations that a client-facing policy could never safely express (accepting an invitation, transferring ownership, creating a member account with an admin-chosen password) go through narrow, single-purpose `SECURITY DEFINER` functions that independently re-derive the caller's identity from `auth.uid()`/`auth.email()` and re-validate every precondition themselves — never trusting a parameter the client could forge.

## 29. Database Architecture

Core tables: `organizations`, `profiles`, `memberships`, `membership_page_permissions`, `membership_action_permissions`, `invitations`, `customers`, `portal_settings`, `categories`, `statuses`, `submissions`, `comments`, `votes`, `notifications`, `audit_events`. Schema and every policy change live as numbered, version-controlled SQL files in `supabase/migrations/`, applied to a dedicated hosted Supabase project — the migration files are the source of truth for the schema, not ad hoc Studio edits.

## 30. Data Isolation

Enforced at three layers that all have to agree, not just one:

1. **Structural** — every tenant table carries `organization_id`; composite foreign keys prevent a row from ever referencing another organization's category/status.
2. **RLS** — every policy scopes reads/writes to rows the caller's real membership/customer relationship covers for that specific `organization_id`.
3. **Application** — `resolveOrganizationContext` re-derives `organization_id` server-side from the caller's session on every request; a client-supplied organization id is never trusted, and is rejected at the database level even if the app layer were bypassed.

## 31. Authorization Boundaries

- **Authentication**: Supabase Auth — proves identity only.
- **Authorization**: the combination of role + page/action permission grants — what an identified user is allowed to do.
- **RLS**: the database-level enforcement of that authorization, independent of and not trusting the application layer.
- **Application-layer checks**: pre-checks that produce clean, specific error messages before a request ever reaches the database — defense-in-depth and UX, never the primary boundary. Every RLS-gated table remains safe even if an application-layer check were skipped.

## 32. Project Structure

```
app/                      routes (Next.js App Router) — Server Components by default
  (auth)/                 internal login/signup/reset-password
  dashboard/               authenticated org workspace: submissions, categories,
                           statuses, role-management, activity, settings, no-access
  feedback/                public/customer portal: sign-in/up, portal connect,
                           [slug] organization portal, my-feedback, profile
  invite/[token]/          invitation acceptance landing
  auth/confirm/            Supabase email-confirmation Route Handler
components/
  ui/                      shadcn/Radix primitives
  layout/                  dashboard shell, nav, topbar, sidebar
  states/                  empty/error/loading states, page headers
  marketing/               homepage sections
  customer-portal/         portal-specific chrome
  analytics/               charts, stat cards, activity timeline
  domain/                  shared cross-feature presentational components
features/                  one folder per domain — owns its own queries/actions/forms:
                           submissions, categories, statuses, comments, votes,
                           customers, members, invitations, notifications,
                           audit, organizations, portal-settings, analytics
lib/                       cross-cutting: auth (session/context/permissions),
                           authorization (registry), supabase clients, analytics helpers
supabase/migrations/       version-controlled SQL — source of truth for the schema
tests/integration/         RLS and feature integration tests against the real
                           hosted Supabase project (no mocking of the database)
docs/                      architecture and getting-started notes
```

## 33. Technology Stack

Read directly from `package.json`:

- **Framework**: Next.js 16 (App Router, React Server Components), React 19
- **Language**: TypeScript (strict)
- **Backend**: Supabase — Postgres, Auth, Row Level Security (`@supabase/supabase-js`, `@supabase/ssr`)
- **Styling/UI**: Tailwind CSS 4, shadcn/ui component conventions, Radix UI primitives (`radix-ui`), Lucide icons, `next-themes` for light/dark
- **Charts**: Chart.js + `react-chartjs-2`
- **Utilities**: `clsx`, `tailwind-merge`, `class-variance-authority`, `sonner` (toasts)
- **Testing**: Vitest, run as live integration tests against the hosted Supabase project
- **Tooling**: ESLint 9, `eslint-config-next`, pnpm (pinned via `packageManager`)

## 34. Installation

```bash
git clone <this-repository>
cd signalboard
corepack enable          # or: npm install -g pnpm
pnpm install
```

## 35. Environment Variables

Copy `.env.example` to `.env.local` and fill in real values (never commit `.env.local`):

| Variable | Public/Private | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Your Supabase project's API URL. Safe to expose — RLS, not URL secrecy, enforces authorization. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon/publishable key, used by every RLS-respecting client (`lib/supabase/`). Safe to expose for the same reason. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Private, server-only** | Bypasses RLS entirely. Used only by `lib/supabase/service-role.ts`, and only for the two Auth Admin API operations that structurally require it (admin-created member accounts, email changes). Never prefix with `NEXT_PUBLIC_`; never import outside a server-only ("use server") file. |

A separate `.env.test.local` supplies the same variables for the integration test suite, pointed at the same (or an equivalent, disposable) Supabase project.

## 36. Local Development

```bash
pnpm dev      # start the dev server at http://localhost:3000
```

Business logic lives in `features/*` and `lib/*`; page components stay thin.

## 37. Database / Supabase Setup

Development runs against a dedicated hosted Supabase project (not local Docker) — see `docs/architecture.md`. Create a project, copy its URL/anon key/service-role key into `.env.local`, then apply every migration in `supabase/migrations/` in order via the Supabase MCP, CLI, or Studio's SQL editor.

## 38. Migrations

Every schema or policy change is a new, numbered file in `supabase/migrations/` — never an undocumented edit made directly in Studio. The migration file is the source of truth; each one documents the gap it closes, why the chosen approach (often a narrow `SECURITY DEFINER` RPC over a broader policy) is safe, and what tests are required before/after applying it. Apply in order; each migration assumes every prior one is already live.

## 39. Testing

```bash
pnpm test:integration
```

Runs Vitest against the real hosted Supabase project — RLS policies, SECURITY DEFINER RPCs, and server actions are tested against actual Postgres behavior, not mocks, using disposable fixture data created and torn down per test. This is deliberate: RLS is the real authorization boundary in this codebase, so the tests that matter most exercise it directly.

## 40. Linting

```bash
pnpm lint
```

## 41. Type Checking

```bash
pnpm build            # or `pnpm dev` once, to generate .next/types
pnpm exec tsc --noEmit
```

`LayoutProps`/`PageProps` are Next.js-generated types that only exist after `.next/types` has been generated by a build or dev run.

## 42. Production Build

```bash
pnpm build
pnpm start
```

## 43. Deployment

The app is a standard Next.js application with no separate backend process to deploy — Supabase is the only external service. Any Next.js-compatible host works; set the three environment variables above in that host's dashboard.

## 44. Vercel Deployment

Import the repository into Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as project environment variables (the service-role key as a server-only/secret variable, never exposed to a client bundle), and deploy. No project-specific `vercel.json` is required beyond the standard Next.js build.

## 45. Supabase Deployment

Production should use its own dedicated Supabase project, separate from the development project referenced throughout this codebase's migration history — apply every migration under `supabase/migrations/` to it in order before pointing the app's environment variables at it. Enable leaked-password protection in that project's Auth settings (Dashboard → Authentication → Policies) before going live — it is off by default and is a one-click Studio setting, not something a migration file can express.

## 46. Security Considerations

- RLS is enabled and enforced on every tenant-owned table — there is no table relying on the application layer alone.
- The service-role key is confined to one server-only module (`lib/supabase/service-role.ts`) and two call sites, both of which re-derive and check the caller's real authorization before ever reaching it.
- Every cross-RLS-boundary operation goes through a narrow, single-purpose `SECURITY DEFINER` function, not a broad, permissive policy.
- Redirect targets from user-controlled `next` parameters are validated against an allowlisted path shape (same-origin, audience-scoped) — protocol-relative and backslash-normalized open-redirect payloads are rejected.
- Customer and internal-member identity resolution are independently re-checked at every layer (login, portal entry, every server action) — never assumed from a prior check alone.

## 47. Production Checklist

| Item | Status |
|---|---|
| Authentication | ✅ |
| Customer Authentication | ✅ |
| Authorization (RBAC + permissions) | ✅ |
| Row Level Security | ✅ |
| Multi-tenancy / data isolation | ✅ |
| Role Management UI | ✅ |
| Customer Portal | ✅ Verified by code trace + integration tests — not manually browser-tested this pass |
| Feedback Workflow | ✅ |
| Analytics | ✅ |
| Dashboard | ✅ |
| Marketing Website | ✅ |
| Responsive UI | ⚠️ Existing premium UI, unchanged this phase — **not browser-verified** this pass (no browser access; code-level review only) |
| Accessibility fundamentals | ⚠️ Reviewed in code (semantic headings, link text, alt text) only — not tested with assistive technology |
| Error handling | ✅ (error boundaries + typed action results throughout) |
| Loading states | ✅ |
| Secrets hygiene | ✅ No real secrets in tracked files or git history |
| Database migration (0017) | ✅ Applied to the hosted dev project and verified live |
| Integration tests | ✅ 218/218 passing (`pnpm test:integration`) |
| Lint | ✅ `pnpm lint` clean |
| Type check | ✅ `pnpm exec tsc --noEmit` clean |
| Production build | ✅ `pnpm build` succeeds |
| Documentation | ✅ this README + `docs/architecture.md` / `docs/getting-started.md` |

See the release report delivered alongside this README for the full verification run this table reflects.

## 48. Known Limitations

- Notification *creation* (`create_notification` RPC, `supabase/migrations/0008_notification_creation_rpc.sql`) is drafted but not yet applied to the hosted database — `features/notifications/service.ts`'s `createNotification()` remains a deliberate stub that throws rather than silently no-op-ing. Reading/marking-read of notifications works today; nothing currently triggers a new one.
- The non-admin audit RPC (`log_audit_event`, `supabase/migrations/0012_audit_log_rpc.sql`) covering `submission.created`/`comment.created` is likewise drafted but not yet applied — those two event types are not yet logged; admin-authored events (role changes, category/status edits, ownership transfers) are unaffected and already logged today.
- Leaked-password protection is disabled in Supabase Auth by default and must be enabled per-project from the Studio dashboard — it cannot be expressed in a migration file.
- The public portal route is namespaced by organization slug (`/feedback/[slug]`); there is no custom-domain support per organization.
- No email provider is configured — invitation delivery is a manually-shared link, not an actual sent email (see [§22](#22-invitations)).
- A non-author's comment displays as a truncated profile id (`User a1b2c3d4`) rather than a resolved name (`features/comments/comment-list.tsx`), unlike the rest of the app's established convention of always resolving a real name via `get_organization_contact_profiles` (used by Activity and Members). Cosmetic, not a security or data issue — deliberately left unfixed this phase rather than threading a name-resolution RPC through two different auth contexts (internal dashboard vs. customer portal) this late in release hardening.

## 49. Future Roadmap

- Apply and wire up the notification-creation and non-admin audit-log RPCs once their triggering events (comment posted, status changed, member invited, etc.) are decided.
- Custom domains per organization portal.
- Expanded analytics (cohort/trend views beyond current aggregate reporting).

## 50. License

Proprietary — All rights reserved. This codebase is not licensed for reuse, redistribution, or modification outside of work explicitly authorized by its owner.
