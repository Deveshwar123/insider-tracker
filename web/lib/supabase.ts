// Server-side Supabase read client for the Next.js app.
// Uses the public anon key — the app only ever READS public SEC data.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const MISSING_CONFIG_MESSAGE =
  "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
  "Copy web/.env.local.example to web/.env.local and fill it in.";

/** True when the app has credentials to read with. */
export const isConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Built on first use rather than at import time. Throwing at import made
 * `next build` fail outright wherever the env wasn't set — CI, a fresh clone —
 * even though the build itself never queries. Now a misconfigured deploy fails
 * at request time with this message, and the build stays credential-free.
 */
export function getSupabase(): SupabaseClient {
  if (!isConfigured) throw new Error(MISSING_CONFIG_MESSAGE);
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}
