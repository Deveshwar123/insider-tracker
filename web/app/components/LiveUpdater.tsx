"use client";

// Keeps an open dashboard current. The worker polls EDGAR every 15 minutes, so
// rows appear in the DB through the day; without this the page only changed on
// a manual reload. Re-fetches the server component (the page is force-dynamic,
// so this hits the DB again) and reports when the last update landed.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 60_000;

export default function LiveUpdater() {
  const router = useRouter();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      // Refreshing a hidden tab wastes a DB read for something nobody is
      // looking at; the visibility listener catches it up on return.
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastUpdate(new Date());
    };

    const id = setInterval(tick, INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return (
    <span className="live-badge" title="This page re-checks the database every minute.">
      <span className="live-dot" aria-hidden="true" />
      Live
      {lastUpdate && (
        <span className="live-time">
          {" · updated "}
          {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </span>
  );
}
