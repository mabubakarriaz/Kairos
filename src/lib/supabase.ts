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

  // supabase-js wants the bare project URL (it appends "/rest/v1" itself). Tolerate
  // the common paste mistakes — stray whitespace, a trailing slash, or the full REST
  // endpoint ("…supabase.co/rest/v1/") — all of which otherwise produce the gateway
  // error "Invalid path specified in request URL".
  const url = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
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
