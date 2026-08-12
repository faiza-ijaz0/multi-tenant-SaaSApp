# SignalBoard

Customer feedback and product insights platform: public feedback portals, submission triage, voting, comments, and analytics for multi-tenant organizations.

See [`docs/architecture.md`](docs/architecture.md) for the system design and [`docs/getting-started.md`](docs/getting-started.md) to run it locally.

## Stack

Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind CSS · shadcn/ui · Supabase (Postgres, Auth, RLS) · Zod · React Hook Form · Vitest · Playwright

## Scripts

```bash
pnpm dev      # start the dev server
pnpm build    # production build
pnpm lint     # eslint
```
