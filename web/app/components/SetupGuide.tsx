// Shown instead of the dashboard when the app has no database credentials.
//
// This project is published without any keys in it: you clone it, point it at
// your own Supabase project, and run it locally so your data and your keys stay
// on your machine. A clone with no config used to hit an opaque "fetch failed";
// this explains what to do instead.

export default function SetupGuide() {
  return (
    <div className="setup">
      <h1>Connect your database</h1>
      <p className="subtitle">
        This app reads SEC Form 4 filings from a Supabase project that you own. Nothing is shipped
        with the repo — no keys, no data — so the first run needs three minutes of setup.
      </p>

      <ol className="setup-steps">
        <li>
          <h2>Create a free Supabase project</h2>
          <p>
            At <code>supabase.com</code>. Then open <strong>SQL Editor</strong> and run the contents
            of <code>supabase/migrations/0001_init.sql</code> from this repo to create the tables.
          </p>
        </li>
        <li>
          <h2>Add your keys to <code>web/.env.local</code></h2>
          <p>
            Copy <code>web/.env.local.example</code> to <code>web/.env.local</code>, then fill in the
            two values from <strong>Project Settings → API</strong>:
          </p>
          <pre>
{`NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key`}
          </pre>
          <p className="note">
            These two are safe to use in the browser — they are public by design and read-only. The{" "}
            <code>service_role</code> / secret key belongs only in <code>worker/.env</code>, never
            here.
          </p>
        </li>
        <li>
          <h2>Fill the database</h2>
          <p>
            The tables start empty. Run the ingestion worker to pull filings from SEC EDGAR:
          </p>
          <pre>
{`cd worker
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEC_USER_AGENT
npm install
npm run ingest:days 5   # backfill the last 5 days`}
          </pre>
          <p className="note">
            <code>SEC_USER_AGENT</code> must contain a real name and email — SEC blocks anonymous
            traffic.
          </p>
        </li>
        <li>
          <h2>Restart the dev server</h2>
          <p>
            Next.js only reads <code>.env.local</code> at startup, so stop and re-run{" "}
            <code>npm run dev</code>. This page will become the dashboard.
          </p>
        </li>
      </ol>

      <p className="setup-footer">
        Full instructions, including the scheduled-ingestion setup, are in the repo README.
      </p>
    </div>
  );
}
