// Where the app gets its database credentials.
//
// Two sources, in order:
//   1. What you typed into the setup screen, kept in this browser's
//      localStorage. Nothing is sent to any server but your own Supabase
//      project, and nothing is written to disk in the repo.
//   2. NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY from the environment, if you'd
//      rather configure it with a .env.local file.
//
// This is what lets someone clone the repo and just run it: the app asks for a
// key instead of requiring a file edit before it will start.

export interface Credentials {
  url: string;
  key: string;
}

const URL_KEY = "insider-tracker.supabase.url";
const KEY_KEY = "insider-tracker.supabase.key";

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function fromEnv(): Credentials | null {
  return envUrl && envKey ? { url: envUrl, key: envKey } : null;
}

/**
 * Current credentials, or null if the app is unconfigured. Returns env config
 * on the server (where localStorage doesn't exist), so a .env.local setup keeps
 * working exactly as before.
 */
export function getCredentials(): Credentials | null {
  if (typeof window === "undefined") return fromEnv();
  try {
    const url = window.localStorage.getItem(URL_KEY);
    const key = window.localStorage.getItem(KEY_KEY);
    if (url && key) return { url, key };
  } catch {
    // Private browsing or blocked storage — fall through to env.
  }
  return fromEnv();
}

export function saveCredentials({ url, key }: Credentials): void {
  window.localStorage.setItem(URL_KEY, url.trim().replace(/\/+$/, ""));
  window.localStorage.setItem(KEY_KEY, key.trim());
}

export function clearCredentials(): void {
  window.localStorage.removeItem(URL_KEY);
  window.localStorage.removeItem(KEY_KEY);
}

/** True when the credentials came from a file rather than the setup screen. */
export function isFromEnv(): boolean {
  if (typeof window === "undefined") return Boolean(fromEnv());
  try {
    return !window.localStorage.getItem(KEY_KEY) && Boolean(fromEnv());
  } catch {
    return Boolean(fromEnv());
  }
}
