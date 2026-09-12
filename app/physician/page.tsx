"use client";

/* Physician queue. Sorting by red-flag level then arrival time is a property
   of GET /api/queue (see app/api/queue/route.ts), not of this screen, so it
   stays correct no matter how this list is filtered or rendered. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { isEmergency } from "../../lib/redflag.ts";
import type { RedFlag, Session } from "../../lib/types.ts";

const PRIORITY_LABEL: Record<RedFlag["level"], string> = {
  high: "High priority",
  moderate: "Moderate priority",
  none: "Routine",
};

const PRIORITY_CLASS: Record<RedFlag["level"], string> = {
  high: "bg-red-600 text-white",
  moderate: "bg-amber-500 text-black",
  none: "bg-gray-200 text-gray-800",
};

const STATUS_LABEL: Record<Session["status"], string> = {
  in_progress: "In progress",
  pending_review: "Pending review",
  confirmed: "Confirmed",
};

function chiefComplaintLine(session: Session): string {
  if (session.summary?.chiefComplaint) return session.summary.chiefComplaint;
  const cc = session.answers.find((a) => a.nodeId === "cc_open");
  if (cc?.raw || cc?.value) return cc.raw || cc.value;
  return "No chief complaint recorded yet.";
}

export default function PhysicianQueuePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [includeInProgress, setIncludeInProgress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/queue");
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { sessions: Session[] };
      setSessions(data.sessions);
    } catch {
      setError("Could not load the queue. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = sessions.filter((s) => includeInProgress || s.status !== "in_progress");

  return (
    <div className="min-h-screen flex flex-col pb-20">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <h1 className="text-2xl font-bold">Physician queue</h1>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeInProgress}
                onChange={(e) => setIncludeInProgress(e.target.checked)}
              />
              Include in-progress sessions
            </label>
            <button
              type="button"
              onClick={load}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}
        {loading && <p className="text-gray-500">Loading…</p>}

        {!loading && visible.length === 0 && (
          <p className="text-gray-500">No sessions to show.</p>
        )}

        <ul className="flex flex-col gap-3">
          {visible.map((session) => (
            <li key={session.id}>
              <Link
                href={`/physician/${session.id}`}
                className="block border border-gray-300 rounded-xl px-4 py-3 hover:border-blue-500 hover:bg-blue-50"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-semibold text-lg">
                    {session.name || "Unnamed patient"}
                    <span className="text-gray-500 font-normal text-base">
                      {" "}
                      · {session.age || "?"} · {session.gender || "unspecified"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isEmergency(session) && (
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-700 text-white">
                        EMERGENCY PATH
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${PRIORITY_CLASS[session.redFlag.level]}`}>
                      {PRIORITY_LABEL[session.redFlag.level]}
                    </span>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {STATUS_LABEL[session.status]}
                    </span>
                  </span>
                </div>
                <p className="text-gray-700 mt-2">{chiefComplaintLine(session)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-amber-50 border-t border-amber-300 text-amber-900 text-sm px-4 py-3 text-center">
        Draft generated from patient self-report. Not clinically validated. Physician confirmation required.
      </footer>
    </div>
  );
}
