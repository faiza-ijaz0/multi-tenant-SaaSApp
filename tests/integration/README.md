# tests/integration

Vitest integration tests for Server Actions and RLS policies, run against the `SignalBoard Development` Supabase project — including negative tests asserting cross-organization access fails.

## RLS integration suite (`tests/integration/rls/`)

Runtime RLS verification through **real Supabase Auth sessions** (genuine JWTs from real signed-in test users) and a real unauthenticated anon-key client — never the Supabase MCP/postgres superuser connection, never simulated `request.jwt.claims`.

### Setup

1. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` come from `.env.local` (already present for the app itself).
2. Create `.env.test.local` (gitignored, test-only — never `NEXT_PUBLIC_*`, never committed) with:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<service_role secret key, from Supabase Dashboard -> Project Settings -> API>
   ```
   This key is only used server-side, in Node, to create/delete pre-confirmed test identities via the Auth Admin API (this project has email confirmation enabled, so self-serve signup can't produce a usable session without a real inbox) and for cleanup. It is never logged, never printed, and never reaches browser/app code.

### Running

```
pnpm test:integration
```

### What it does

Each run creates two isolated organizations ("RLS Test Organization A/B") and four test identities (an owner and a customer per org) through **real authenticated sessions calling the actual insert policies** — not admin bypass — then runs positive, negative, anonymous, internal-comment, and vote-security assertions against them, and tears everything down afterward (`afterAll`). See `fixtures.ts` for the exact setup/teardown sequence.
