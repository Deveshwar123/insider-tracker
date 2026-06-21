import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Insider Tracker",
  description: "Track SEC Form 4 insider-trading filings from EDGAR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              📈 Insider Tracker
            </Link>
            <span className="tagline">SEC Form 4 insider trades · data from EDGAR</span>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="inner">
            <span>
              Data from{" "}
              <a href="https://www.sec.gov/cgi-bin/browse-edgar" target="_blank" rel="noopener noreferrer">
                SEC EDGAR
              </a>{" "}
              · prices delayed via Yahoo Finance
            </span>
            <span className="disclaimer">For research only — not investment advice.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
