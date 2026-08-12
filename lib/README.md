# lib

Cross-cutting code shared by multiple features, not a home for feature-specific logic (that belongs in `features/*`).

Planned subfolders, added as each is actually needed:
- `supabase/` — server and browser Supabase clients (Phase 2, with auth)
- `auth/` — session helpers, org-role and customer-participation resolution (Phase 2)
- `authorization/` — role → permission capability checks (Phase 2+)
- `validation/` — shared Zod schemas (as features need them)
