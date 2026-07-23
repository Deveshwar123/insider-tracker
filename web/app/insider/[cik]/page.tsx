"use client";

import Link from "next/link";
import FilingsTable from "@/app/components/FilingsTable";
import { ErrorState, TableSkeleton } from "@/app/components/States";
import { getFilingsByInsider } from "@/lib/queries";
import { useAsync } from "@/lib/useAsync";

export default function InsiderPage({ params }: { params: { cik: string } }) {
  const cik = Number(params.cik);
  const valid = params.cik !== "" && Number.isFinite(cik) && cik > 0;

  const { data, error, loading, reload } = useAsync(
    () => (valid ? getFilingsByInsider(cik) : Promise.resolve([])),
    [cik, valid]
  );

  const filings = data ?? [];
  const insider = filings[0]?.insiders;

  return (
    <>
      <Link href="/" className="back">
        ← Back to filings
      </Link>

      {!valid ? (
        <ErrorState message={`"${params.cik}" is not a valid insider CIK.`} />
      ) : (
        <>
          <h1>{insider?.name ?? `CIK ${cik}`}</h1>
          <p className="subtitle">
            {loading ? "Loading filings…" : `${filings.length} filing(s) by this insider.`}
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
