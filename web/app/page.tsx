import { Suspense } from "react";
import Dashboard from "./components/Dashboard";
import { DashboardSkeleton } from "./components/States";

export default function HomePage() {
  // Suspense is required around the useSearchParams inside Dashboard.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
