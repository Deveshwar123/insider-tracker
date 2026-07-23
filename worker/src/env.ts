// Loads worker/.env into process.env.
//
// This MUST be imported before anything that reads env at module scope (notably
// ./config.js). ES modules evaluate all static imports before the importing
// module's own body runs, so calling a loader inside main() was too late:
// config.js had already thrown "Missing required env var: SUPABASE_URL" while
// the imports were being resolved. That made `npm run ingest` impossible to run
// locally from a .env file — it only ever worked in CI, where the variables are
// already in the environment.
//
// Importing this module for its side effect (`import "./env.js";` as the first
// import) guarantees it runs first.

import { readFileSync } from "node:fs";

function loadDotEnv(): void {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Tolerate quoted values — a User-Agent with spaces is often written that way.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Real environment variables (CI secrets) always win over the file.
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file (e.g. in CI where vars come from secrets) — that's fine.
  }
}

loadDotEnv();
