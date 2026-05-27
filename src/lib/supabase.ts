import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key. It bypasses RLS, so it
 * must NEVER be imported into a client component (the `server-only` guard above
 * makes that a build error). The browser never talks to Supabase directly.
 *
 * The client is created lazily so that `next build` doesn't crash when env vars
 * are absent at build time — it only throws when a request actually needs the DB.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill them in (see docs/SUPABASE_SETUP.md).",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
