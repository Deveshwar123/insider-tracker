// Supabase read client.
//
// Credentials come from lib/credentials (setup screen → localStorage, or
// .env.local), so queries run in the browser against the reader's own project.
// The key involved is the publishable/anon one, which is public by design; the
// service-role key belongs to the worker and never reaches this app.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCredentials, type Credentials } from "./credentials";

export const MISSING_CONFIG_MESSAGE =
  "No Supabase project is configured yet. Add your project URL and publishable key on the setup screen.";

/** True when the app has credentials to read with. */
export function isConfigured(): boolean {
  return getCredentials() !== null;
}

// One client per credential pair, so re-renders don't build a new one each time
// and switching projects doesn't keep using the old connection.
let cached: { creds: Credentials; client: SupabaseClient } | null = null;

export function getSupabase(): SupabaseClient {
  const creds = getCredentials();
  if (!creds) throw new Error(MISSING_CONFIG_MESSAGE);
  if (cached && cached.creds.url === creds.url && cached.creds.key === creds.key) {
    return cached.client;
  }
  const client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  cached = { creds, client };
  return client;
}

/** Verifies a URL/key pair by running the smallest possible read. */
export async function testCredentials(creds: Credentials): Promise<void> {
  const probe = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  const { error } = await probe.from("filings").select("accession_no").limit(1);
  if (error) throw new Error(error.message);
}
