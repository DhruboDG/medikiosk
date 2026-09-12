"use client";

/* Token lookup for physicians. A physician standing with a patient enters the
   token number shown on the patient's done screen and gets the same history
   view as app/physician/[id]/page.tsx, on this same page. No redirect. */

import { useState } from "react";
import PatientHistory from "../../components/PatientHistory.tsx";
import type { Session } from "../../lib/types.ts";

export default function PatientHistoryLookupPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    const token = Number(tokenInput);
    if (!tokenInput || !Number.isFinite(token)) {
      setNotFound(false);
      setError("Enter a token number.");
      return;
    }
    setSearching(true);
    setError(null);
    setNotFound(false);
    setSessionId(null);
    try {
      const res = await fetch(`/api/session/by-token/${token}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { session: Session };
      setSessionId(data.session.id);
    } catch {
      setError("Could not search. Check the connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col pb-24">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Find patient by token</h1>

        <form
          className="flex flex-wrap items-stretch gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Token number"
            aria-label="Token number"
            className="flex-1 min-w-[10rem] min-h-[60px] text-3xl text-center border-2 border-gray-400 rounded-xl px-4 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching}
            className="min-h-[60px] px-8 rounded-xl bg-blue-600 text-white text-2xl font-semibold disabled:opacity-50"
          >
            {searching ? "Finding…" : "Find"}
          </button>
        </form>

        {error && <p className="text-red-700 bg-red-50 rounded-lg px-3 py-2 text-lg">{error}</p>}
        {notFound && !error && (
          <p className="text-gray-700 bg-gray-100 rounded-lg px-3 py-2 text-lg">
            No patient found with token {tokenInput}.
          </p>
        )}

        {sessionId && (
          <div className="border-t border-gray-300 pt-6">
            <PatientHistory key={sessionId} sessionId={sessionId} />
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-amber-50 border-t border-amber-300 text-amber-900 text-sm px-4 py-3 text-center">
        Draft generated from patient self-report. Not clinically validated. Physician confirmation required.
      </footer>
    </div>
  );
}
