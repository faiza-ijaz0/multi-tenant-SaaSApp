# SignalBoard

**SignalBoard is an enterprise-grade multi-tenant customer feedback platform that enables organizations to collect, manage, prioritize, and analyze customer feedback through a secure, branded customer portal.**

Every organization on SignalBoard gets its own isolated workspace, a public or private feedback portal branded to its identity, a role-based team with fine-grained permissions, and analytics that turn raw submissions into product decisions — all running on a single shared Postgres database whose tenant boundaries are enforced by the database itself, not just application code.

## Live Demo

https://multi-tenant-saas-agljaxk9l-faiza-ijaz0s-projects.vercel.app/

## GitHub Repository

https://github.com/faiza-ijaz0/multi-tenant-SaaSApp

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Who SignalBoard Is For](#who-signalboard-is-for)
3. [The Complete Product Workflow](#the-complete-product-workflow)
4. [Key Features](#key-features)
5. [Application Architecture](#application-architecture)
6. [Multi-Tenant Architecture](#multi-tenant-architecture)
7. [Authentication](#authentication)
8. [Role-Based Access Control](#role-based-access-control)
9. [The Customer Portal](#the-customer-portal)
10. [The Feedback Lifecycle](#the-feedback-lifecycle)
11. [Organization Management](#organization-management)
12. [Analytics & Insights](#analytics--insights)
13. [Security Architecture](#security-architecture)
14. [Data Isolation Strategy](#data-isolation-strategy)
15. [Technology Stack](#technology-stack)
16. [Project Structure](#project-structure)
17. [Getting Started](#getting-started)
18. [Environment Variables](#environment-variables)
19. [Database & Migrations](#database--migrations)
20. [Testing & Quality](#testing--quality)
21. [Deployment](#deployment)
22. [Roadmap](#roadmap)
23. [License](#license)

---

## The Problem

Product teams collect feedback across scattered channels — support tickets, sales calls, spreadsheets, DMs — with no shared, customer-facing record of what was asked for or what happened to it. Feedback gets lost, priorities get argued from memory instead of data, and customers who took the time to ask for something never find out whether it shipped.

SignalBoard gives each organization a single, structured, tenant-isolated home for that feedback: customers watch their request move from submitted to shipped, and the team works from one filterable, permission-gated queue instead of a scattered inbox.

## Who SignalBoard Is For

- **B2B and B2C SaaS teams** who want a public or private channel for customers to request features, report bugs, and see what's being worked on.
- **Product and support teams** who need to triage, categorize, and prioritize incoming feedback without losing track of who asked for what.
- **Multiple organizations on one platform** — SignalBoard is built as a true multi-tenant product from the schema up, not a single-tenant app with a workspace bolted on.

## The Complete Product Workflow

**Organization side:**

```
Sign up → Create organization → Onboard → Configure branded portal
  → Invite team members and assign roles/permissions
  → Triage incoming feedback (categorize, set status, discuss)
  → Review analytics → Make prioritization decisions
```

**Customer side:**

```
Discover the organization's portal → Sign up / sign in
  → Connect to the organization's branded portal
  → Browse existing feedback → Submit a request or bug report
  → Vote and comment on submissions that matter to them
  → Track their own submissions on "My Feedback" as status changes
```

Both journeys converge on the same feedback record: a submission a customer creates immediately becomes visible, categorized, and actionable inside the organization's dashboard, and every status change the team makes is reflected back on the customer's own view of that submission.

## Key Features

**Organization & Team Management**
- Isolated multi-tenant workspace per organization
- Owner / Admin / Member roles with independently configurable page and action permissions
- Member invitations via shareable links, plus direct admin-created accounts
- Ownership transfer with structural single-owner guarantees
- Organization-wide activity log

**Customer Portal**
- Branded, public or private feedback portal per organization
- Customer sign-up, sign-in, and profile management
- Feedback submission, voting, and commenting
- A personal "My Feedback" view for tracking submission status over time

**Feedback Management**
- Centralized submissions queue with categories and configurable statuses
- Internal-only and customer-visible comments
- Status-change history feeding directly into analytics

**Analytics & Insights**
- KPI cards for submissions, categories, statuses, and team activity
- Submission volume trends with selectable date ranges
- Status breakdown and category distribution charts
- Member growth and activity analytics
- A chronological activity timeline for admin visibility

**Security**
- Supabase Auth as the single identity provider for both teams and customers
- Row Level Security enforced on every tenant-owned table
- Server-resolved tenant context — a client-supplied organization ID is never trusted
- Open-redirect–hardened authentication flows

## Application Architecture

SignalBoard runs on Next.js (App Router, React Server Components by default) as both the frontend and the application server — there is no separate backend service. Supabase (Postgres, Auth, and Row Level Security) is the entire backend. Server Actions handle authenticated mutations directly against Supabase; Route Handlers are used only where a stable HTTP contract is genuinely required, such as the Supabase Auth email-confirmation callback.

Two independent front doors converge on the same database and the same Supabase Auth system, kept structurally separate at the routing and Row Level Security layer:

```
Organization workspace:
  Marketing site → Sign up → Onboarding → Dashboard
    → Team & Roles → Feedback Management → Analytics

Customer portal:
  Marketing site → Customer sign-in/sign-up → Portal connect
    → Organization's branded portal → Submit feedback
    → visible instantly in the organization's dashboard
```

## Multi-Tenant Architecture

SignalBoard uses a single shared Postgres database with row-level tenant isolation, not a database-per-tenant model. Every tenant-owned table carries an `organization_id` column, and that value is **never** trusted from the client. It is always resolved server-side from the authenticated caller's real membership or customer relationship, then independently re-enforced by Row Level Security on every query — two layers that both have to agree before any tenant-scoped data moves.

Composite foreign keys reinforce this structurally: a submission's `(organization_id, category_id)` pair references a categories row with that exact same organization, so it is not merely convention that a submission can't reference another organization's category or status — it's a database constraint.

## Authentication

Supabase Auth is the single identity system for everyone — there is no second, parallel auth provider for customers. Authentication (proving who someone is) is kept strictly separate from authorization (what they're allowed to do once identified): a successful sign-in only proves identity, and every subsequent read or write is independently re-authorized against real membership, customer, and permission-grant records, enforced by Row Level Security.

Two front doors sit on top of this one identity system:

| | Internal team | Customer |
|---|---|---|
| Entry points | `/login`, `/signup` | `/feedback/sign-in`, `/feedback/sign-up` |
| Lands on | `/dashboard` (or onboarding, for a brand-new account) | The customer portal connect flow |
| Session scope | Organization membership | A specific organization's customer relationship |

A valid session alone is never treated as proof of customer-portal eligibility. Signing in on a specific organization's portal re-verifies that the account is actually a registered customer of that organization — an organization's own internal staff cannot access their own portal as a customer just because they can authenticate, and the reverse holds too. Redirect targets passed through login flows are validated against an allowlisted, same-origin path shape, closing both protocol-relative and encoded-path open-redirect vectors.

## Role-Based Access Control

Every internal team member holds exactly one role, layered with independently configurable permission grants.

**Roles**

| Role | Description |
|---|---|
| **Owner** | Exactly one per organization at all times, structurally enforced. Unconditional access to everything. The only role that can transfer ownership or delete the organization. Can never be removed or demoted by anyone else. |
| **Admin** | Broad default access across submissions, categories, statuses, members, activity, and settings. Cannot reassign roles or manage another member's permissions unless explicitly granted that authority — changing who has power over the organization stays owner-gated by default. |
| **Member** | Default access to view and create submissions and comments, and to view categories and statuses. Any capability beyond that requires an explicit permission grant. |

**Permissions layer**

On top of role, two independent, per-member grant types control fine-grained access:

- **Page permissions** — which dashboard areas a non-owner may navigate to at all (Dashboard, Submissions, Categories, Statuses, Role Management, Activity, Organization Settings, Portal Settings, Organization Members).
- **Action permissions** — `resource:action` grants (for example `submissions:edit`, `categories:delete`, `roles_permissions:manage_permissions`) controlling what a non-owner may *do* once on a page.

Both are enforced at the database level, not just hidden in the UI — a member without a grant cannot perform the action through any client, only through the interface the permission model allows. A member always retains full control over their own submissions and comments regardless of grants; permission checks govern acting on someone else's content or on resources with no concept of authorship.

## The Customer Portal

Each organization gets a branded feedback site — public or private — reachable at its own URL slug. Branding (name, logo, accent color, welcome message) and visibility are fully organization-controlled from the dashboard.

The customer journey:

1. **Sign up or sign in** with a dedicated customer-facing authentication flow, entirely separate from the internal team login.
2. **Connect** to a specific organization's portal, either from a shared link or by entering the organization's portal address.
3. **Browse and submit feedback** — feature requests and bug reports, categorized the same way the internal team sees them.
4. **Vote and comment** on submissions, with comments displayed in the submission discussion.
5. **Track submissions** on a personal "My Feedback" view that reflects live status changes made by the organization's team.
6. **Manage their profile** and sign out.

A private portal remains reachable by its own genuinely registered customers even after signing out and back in — customer-portal access is a real, durable relationship stored in the database, not a one-time session flag. A customer of one organization has no visibility into another organization's private portal, regardless of how many organizations they're a customer of.

## The Feedback Lifecycle

```
Customer submits →
  appears instantly in the organization's dashboard submissions queue →
  triaged with a category and a status →
  discussed via comments (internal-only or customer-visible) →
  status progressed by the team →
  the customer sees the same status update on their own submission
```

Every submission carries a type (feature request or bug report), a category, a status, and its author. Status transitions are tracked and reflected both in the activity log and in dashboard analytics, so the whole team — and the customer who asked for it — has a consistent, up-to-date picture of where a request stands.

## Organization Management

- **Members** — the organization's internal roster, with role and permission management from a dedicated Role Management page, and membership/removal management from Organization Settings.
- **Invitations** — time-limited, single-use invitation links carrying an intended role and permission set, plus the option for an admin to create a member account directly with an admin-chosen password.
- **Categories & Statuses** — organization-defined taxonomies for triaging submissions, each independently permission-gated for who can view versus manage them.
- **Portal Settings** — branding, visibility (public/private), and the portal's URL slug.
- **Activity Log** — a running record of admin-authored organizational events (role changes, ownership transfers, category and status changes), visible to admins and owners holding the relevant permission.

## Analytics & Insights

The dashboard surfaces real, pre-aggregated analytics scoped to the caller's own organization — never a raw table dump to the client:

- **KPI cards** for total submissions, open/resolved counts, and recent activity, each with a week-over-week trend indicator.
- **Submission volume trends** as a time-series chart with selectable ranges (7 days, 30 days, 90 days, 12 months), with granularity that adapts to the range so a year view never renders 365 daily points.
- **Status breakdown** and **category distribution** visualizations showing where the current queue stands.
- **Member analytics** — team composition by role and recent-hire trends.
- **Activity analytics** — organizational event volume over time, alongside a chronological activity timeline of recent events.

All charts are fed by targeted, server-computed aggregate queries; the client never receives more than the numbers needed to render the view.

## Security Architecture

- **Row Level Security is the real authorization boundary.** It is enabled on every tenant-owned table, with no table left open to a default-allow policy — the application layer's own checks are defense-in-depth, not the primary safeguard. Even if an application-layer check were skipped, the database itself still enforces who can read or write a given row.
- **Server-resolved tenant context.** `organization_id` is derived from the authenticated caller's real membership or customer relationship on the server, never accepted as-is from the client.
- **Narrow, single-purpose privileged functions.** Operations that legitimately need to cross a Row Level Security boundary — accepting an invitation, transferring ownership, creating a member account with an admin-chosen password — go through database functions that independently re-derive the caller's identity and re-validate every precondition themselves, rather than through a broad, permissive policy.
- **Composite foreign keys** make cross-tenant references structurally impossible, not just conventionally unlikely.
- **Hardened redirect handling.** Every user-controlled redirect target is validated against an allowlisted, same-origin path shape; protocol-relative and encoded-path open-redirect techniques are explicitly rejected, with regression test coverage for both.
- **Minimal privileged-credential surface.** The one server-side credential capable of bypassing Row Level Security is confined to a single server-only module, used only for the handful of account-administration operations that structurally require it — never reachable from client code.
- **Independent identity re-verification.** Customer-portal eligibility and internal-membership status are re-checked at every relevant layer (login, portal entry, every server action) rather than assumed from an earlier check.

SignalBoard does not claim SOC 2, HIPAA, GDPR, or ISO certification — its security posture is a well-engineered, database-enforced authorization model, not a third-party compliance attestation.

## Data Isolation Strategy

Tenant isolation is enforced at three layers that all have to independently agree:

1. **Structural** — every tenant-owned table carries `organization_id`; composite foreign keys prevent a row from ever referencing another organization's category or status.
2. **Row Level Security** — every policy scopes reads and writes to rows the caller's real membership or customer relationship actually covers for that organization.
3. **Application** — tenant context is re-derived server-side from the caller's session on every request; a client-supplied organization ID is never trusted, and is rejected at the database level even if the application layer were bypassed entirely.

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, React Server Components), React |
| Language | TypeScript, strict mode |
| Backend | Supabase — Postgres, Auth, Row Level Security |
| Styling / UI | Tailwind CSS, shadcn/ui conventions, Radix UI primitives, Lucide icons |
| Charts | Chart.js, react-chartjs-2 |
| Testing | Vitest, run as live integration tests against a real Supabase project |
| Tooling | ESLint, pnpm |

## Project Structure

```
app/                  Routes (Next.js App Router) — Server Components by default
  (auth)/              Internal login, signup, password reset
  dashboard/           Authenticated organization workspace
  feedback/            Public and customer-authenticated portal
  invite/              Invitation acceptance
components/
  ui/                  Design-system primitives
  layout/              Shell, navigation, headers
  states/              Empty, error, and loading states
  marketing/           Public-site sections
  customer-portal/     Portal-specific chrome
  analytics/           Charts, KPI cards, activity timeline
  domain/              Shared cross-feature presentational components
features/              One directory per domain, each owning its own
                       queries, server actions, and forms — submissions,
                       categories, statuses, comments, votes, customers,
                       members, invitations, notifications, audit,
                       organizations, portal settings, analytics
lib/                   Cross-cutting code — authentication/session
                       resolution, the authorization registry, Supabase
                       clients, analytics helpers
supabase/migrations/   Version-controlled SQL — the source of truth for
                       the schema and every security policy
tests/integration/     Integration tests exercising real database and
                       authorization behavior
docs/                  Architecture and getting-started references
```

For a deeper architectural walkthrough, see [`docs/architecture.md`](docs/architecture.md).

## Getting Started

```bash
git clone https://github.com/faiza-ijaz0/multi-tenant-SaaSApp.git
cd multi-tenant-SaaSApp
corepack enable          # or: npm install -g pnpm
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm dev
```

The app runs at `http://localhost:3000`. For a full walkthrough, see [`docs/getting-started.md`](docs/getting-started.md).

## Environment Variables

Copy `.env.example` to `.env.local` and provide real values — never commit `.env.local`.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Your Supabase project's API URL. Row Level Security, not URL secrecy, is what enforces authorization, so this is safe to expose to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/publishable key, used by every Row-Level-Security-respecting client. Safe to expose for the same reason. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Private, server-only** | Bypasses Row Level Security entirely. Used only for the handful of account-administration operations that structurally require it. Never expose to the browser or prefix with `NEXT_PUBLIC_`. |

A separate `.env.test.local` supplies the same variables for the integration test suite, pointed at the same or an equivalent disposable Supabase project.

## Database & Migrations

Every schema and Row Level Security policy change lives as a numbered, version-controlled SQL file under `supabase/migrations/` — never an undocumented change made directly in a database console. Migrations are applied in order to a dedicated Supabase project, and each one is the authoritative record of exactly what changed and why. See [`docs/architecture.md`](docs/architecture.md) for the full migration workflow.

## Testing & Quality

```bash
pnpm lint                # ESLint
pnpm exec tsc --noEmit   # TypeScript, strict mode
pnpm build                # Production build
pnpm test:integration    # Full integration suite
```

The integration suite runs against a real Supabase project rather than mocks — Row Level Security policies, privileged database functions, and server actions are exercised against actual Postgres behavior, using disposable fixture data created and torn down per test. Coverage includes tenant-isolation and cross-organization access tests, role and permission-boundary tests, ownership-protection invariants, authentication-flow tests, and redirect-sanitization regression tests. The full suite (228 tests) passes alongside a clean lint run, a clean strict-mode typecheck, and a successful production build.

**Production readiness**

| Area | Status |
|---|---|
| Authentication | ✅ |
| Customer Authentication | ✅ |
| Authorization (RBAC + Permissions) | ✅ |
| Row Level Security | ✅ |
| Multi-Tenancy / Data Isolation | ✅ |
| Role Management UI | ✅ |
| Customer Portal | ✅ |
| Feedback Workflow | ✅ |
| Analytics | ✅ |
| Dashboard | ✅ |
| Marketing Website | ✅ |
| Responsive UI | ✅ |
| Accessibility Fundamentals | ✅ |
| Error Handling | ✅ |
| Loading States | ✅ |
| Secrets Hygiene | ✅ |
| Database Migrations | ✅ |
| Integration Tests | ✅ 228/228 passing |
| Lint | ✅ |
| Type Check | ✅ |
| Production Build | ✅ |
| Documentation | ✅ |

## Deployment

SignalBoard is a standard Next.js application with no separate backend process to deploy — Supabase is the only external service.

**Environments.** Development, staging, and production should each point at their own dedicated Supabase project rather than sharing one — apply the full migration history to each project before pointing an environment's variables at it. Keeping projects separate means schema changes and test data in one environment can never affect another.

**Vercel.** Import the repository into Vercel, set the three environment variables above for the Production (and any Preview/Staging) environment in the project's settings, and deploy. Because the public Supabase variables are inlined at build time, changing them requires a new deployment, not just a restart. No project-specific Vercel configuration is required beyond the standard Next.js build.

**Supabase.** Provision a dedicated project per environment, apply every migration under `supabase/migrations/` in order, and enable leaked-password protection in the project's Auth settings before accepting real user sign-ups — it is off by default and is a one-time dashboard setting, not something a migration can express.

## Roadmap

- Wire up in-app notification creation and non-admin activity logging (new submissions, new comments) once their triggering events are finalized.
- Custom domains per organization portal.
- Expanded analytics — cohort and longer-horizon trend views beyond current aggregate reporting.
- Email delivery for invitations (currently shared as a direct link).

## License

Proprietary — All rights reserved. This codebase is not licensed for reuse, redistribution, or modification outside of work explicitly authorized by its owner.
