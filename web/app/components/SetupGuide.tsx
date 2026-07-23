"use client";

// First-run screen: asks for the reader's own Supabase project instead of
// requiring them to edit a file before the app will start.
//
// The credentials are verified with a real query, then kept in this browser's
// localStorage. They are never sent anywhere except the reader's own Supabase
// project, and never written into the repo — which is what makes it safe to
// publish this project publicly with no keys in it.

import { useState } from "react";
import { saveCredentials } from "@/lib/credentials";
import { testCredentials } from "@/lib/supabase";

export default function SetupGuide() {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looksLikeSecret = /^sb_secret_|service_role/.test(key);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const creds = { url: url.trim().replace(/\/+$/, ""), key: key.trim() };
    if (!/^https?:\/\/.+/.test(creds.url)) {
      setError("That doesn't look like a project URL — it should start with https://");
      return;
    }
    if (!creds.key) {
      setError("Paste your publishable (anon) key.");
      return;
    }

    setBusy(true);
    try {
      // Prove the pair works before storing it, so a typo surfaces here rather
      // than as a broken dashboard.
      await testCredentials(creds);
      saveCredentials(creds);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <h1>Connect your database</h1>
      <p className="subtitle">
        This app reads SEC Form 4 filings from a Supabase project that <strong>you</strong> own.
        Nothing ships with the repo — no keys, no data. Paste your project details below; they stay
        in this browser and are only ever sent to your own project.
      </p>

      <form className="setup-form" onSubmit={submit}>
        <label htmlFor="su">
          Project URL
          <span className="field-hint">Supabase → Project Settings → API → Project URL</span>
        </label>
        <input
          id="su"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-project.supabase.co"
          autoComplete="off"
          spellCheck={false}
        />

        <label htmlFor="sk">
          Publishable (anon) key
          <span className="field-hint">Same page, the key labelled <code>anon</code> / publishable</span>
        </label>
        <input
          id="sk"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sb_publishable_… or eyJhbGciOi…"
          autoComplete="off"
          spellCheck={false}
        />

        {looksLikeSecret && (
          <p className="field-warning">
            That looks like a <strong>secret / service_role</strong> key. Don’t use it here — it can
            write to and delete from your database, and this page runs in the browser. Use the
            publishable (anon) key instead; the secret one belongs only in <code>worker/.env</code>.
          </p>
        )}

        {error && <p className="field-error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Connect"}
        </button>
      </form>

      <details className="setup-details">
        <summary>I don’t have a database yet</summary>
        <ol className="setup-steps">
          <li>
            <h2>Create a free Supabase project</h2>
            <p>
              At <code>supabase.com</code>. Then open <strong>SQL Editor</strong> and run{" "}
              <code>supabase/migrations/0001_init.sql</code> from this repo to create the tables.
            </p>
          </li>
          <li>
            <h2>Fill it with filings</h2>
            <p>The tables start empty. Run the ingestion worker to pull from SEC EDGAR:</p>
            <pre>
{`cd worker
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEC_USER_AGENT
npm install
npm run ingest:days 5   # backfill the last 5 completed days
npm run ingest:recent   # and today's, from the live feed`}
            </pre>
            <p className="note">
              <code>SEC_USER_AGENT</code> must contain a real name and email — SEC blocks anonymous
              traffic.
            </p>
          </li>
          <li>
            <h2>Come back here</h2>
            <p>Paste the project URL and publishable key above.</p>
          </li>
        </ol>
      </details>
    </div>
  );
}
