"use client";

import Link from "next/link";
import FilingsTable from "@/app/components/FilingsTable";
import { ErrorState, TableSkeleton } from "@/app/components/States";
import { getFilingsByIssuer } from "@/lib/queries";
import { useAsync } from "@/lib/useAsync";

export default function CompanyPage({ params }: { params: { cik: string } }) {
  const cik = Number(params.cik);
  const valid = params.cik !== "" && Number.isFinite(cik) && cik > 0;

  const { data, error, loading, reload } = useAsync(
    () => (valid ? getFilingsByIssuer(cik) : Promise.resolve([])),
    [cik, valid]
  );

  const filings = data ?? [];
  const issuer = filings[0]?.issuers;

  return (
    <>
      <Link href="/" className="back">
        ← Back to filings
      </Link>

      {!valid ? (
        <ErrorState message={`"${params.cik}" is not a valid company CIK.`} />
      ) : (
        <>
          <h1>
            {issuer?.name ?? `CIK ${cik}`}{" "}
            {issuer?.ticker ? <span className="badge">{issuer.ticker}</span> : null}
          </h1>
          <p className="subtitle">
            {loading ? "Loading filings…" : `${filings.length} insider filing(s) for this company.`}
          </p>
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <FilingsTable filings={filings} />
          )}
        </>
      )}
    </>
  );
}
