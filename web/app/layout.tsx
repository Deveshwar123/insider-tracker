import "./globals.css";
import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import Link from "next/link";
import { TrendingUp } from "./components/icons";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Insider Tracker",
  description: "Track SEC Form 4 insider-trading filings from EDGAR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              <TrendingUp size={18} />
              Insider Tracker
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
