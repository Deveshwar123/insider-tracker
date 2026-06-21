// Display helpers: turn raw SEC codes/numbers into readable text.

// Form 4 transaction codes → human labels (the common ones).
const TX_CODES: Record<string, string> = {
  P: "Purchase",
  S: "Sale",
  A: "Grant/Award",
  D: "Disposition to issuer",
  F: "Tax withholding",
  M: "Option exercise",
  G: "Gift",
  C: "Conversion",
  X: "Option exercise",
  J: "Other acquisition",
  K: "Equity swap",
  V: "Voluntary report",
};

export function txCodeLabel(code: string | null): string {
  if (!code) return "—";
  return TX_CODES[code] ? `${code} · ${TX_CODES[code]}` : code;
}

export function fmtNumber(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

/** Compact share/unit counts, e.g. 1.2M / 3.4K — keeps wide tables scannable. */
export function fmtCompactNumber(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  // s is YYYY-MM-DD; render as-is to avoid timezone shifting.
  return s;
}

/** Compact relative date, e.g. "today", "3d ago", "5mo ago". */
export function timeAgo(s: string | null): string {
  if (!s) return "—";
  const then = new Date(`${s}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return s;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Abbreviated dollars, e.g. $1.2B / $3.4M / $56K. */
export function fmtCompactMoney(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** Director / Officer / 10% owner badge text from the relationship flags. */
export function relationship(
  isDirector: boolean | null,
  isOfficer: boolean | null,
  isTenPct: boolean | null,
  title: string | null
): string {
  const parts: string[] = [];
  if (isDirector) parts.push("Director");
  if (isOfficer) parts.push(title ? `Officer (${title})` : "Officer");
  if (isTenPct) parts.push("10% Owner");
  return parts.length ? parts.join(", ") : title ?? "—";
}

/** A → green (acquired), D → red (disposed). */
export function acquiredColor(code: string | null): string {
  if (code === "A") return "var(--green)";
  if (code === "D") return "var(--red)";
  return "inherit";
}
