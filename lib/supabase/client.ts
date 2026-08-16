import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the publishable anon key -- RLS is the
 * authorization boundary, not this client's privileges. Create a fresh
 * instance per call site rather than sharing a module-level singleton.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
