"use client";

/* Physician detail view for one session: the draft summary (every field
   editable), the red-flag reason together with the patient's own words that
   raised it, the assembled FHIR bundle, and sign-off. Patient text is always
   rendered as plain React children, never via dangerouslySetInnerHTML. */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AyushPanel from "../../../components/AyushPanel.tsx";
import type { RedFlag, Session, Summary } from "../../../lib/types.ts";

type SummaryTextField = Exclude<keyof Summary, "ayush">;

const FIELDS: { key: SummaryTextField; label: string }[] = [
  { key: "chiefComplaint", label: "Chief complaint" },
  { key: "hpi", label: "History of present illness" },
  { key: "pastHistory", label: "Past medical and surgical history" },
  { key: "drugAllergy", label: "Drug and allergy history" },
  { key: "family", label: "Family history" },
  { key: "personal", label: "Personal history" },
  { key: "ros", label: "Review of systems" },
  { key: "priorInvestigations", label: "Prior investigations" },
];

const PRIORITY_CLASS: Record<RedFlag["level"], string> = {
  high: "bg-red-50 border-red-400 text-red-900",
  moderate: "bg-amber-50 border-amber-400 text-amber-900",
  none: "bg-gray-50 border-gray-300 text-gray-700",
};

export default function PhysicianSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/session/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data: { session: Session }) => {
        if (cancelled) return;
        setSession(data.session);
        setDraft(data.session.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this session.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function updateField(key: SummaryTextField, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function act(action: "accept" | "amend" | "reject") {
    if (!session) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/session/${session.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, summary: draft ?? undefined }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { session: Session };
      setSession(data.session);
      setDraft(data.session.summary ?? null);
      if (action === "reject") {
        setNotice("Marked as not confirmed. This session stays in the queue for review.");
      } else {
        router.push("/physician");
      }
    } catch {
      setError("Could not save. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="max-w-3xl mx-auto px-4 py-6">Loading…</main>;
  }

  if (error && !session) {
    return <main className="max-w-3xl mx-auto px-4 py-6 text-red-700">{error}</main>;
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col pb-24">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">{session.name || "Unnamed patient"}</h1>
          <p className="text-gray-600">
            {session.age || "?"} years · {session.gender || "unspecified"} · {session.mode} ·
            {" "}language: {session.lang} · recorded {new Date(session.createdAt).toLocaleString()}
          </p>
        </div>

        {session.redFlag.level !== "none" && (
          <div className={`border rounded-xl px-4 py-3 ${PRIORITY_CLASS[session.redFlag.level]}`}>
            <p className="font-bold uppercase text-sm tracking-wide">
              {session.redFlag.level} priority{session.redFlag.concept ? ` — ${session.redFlag.concept}` : ""}
            </p>
            <p className="mt-1">{session.redFlag.reason}</p>
          </div>
        )}

        {!draft && (
          <p className="text-gray-500">
            No draft summary yet. It is generated when the patient finishes the question loop.
          </p>
        )}

        {draft && (
          <div className="flex flex-col gap-4">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="font-semibold" htmlFor={`field-${key}`}>
                  {label}
                </label>
                <textarea
                  id={`field-${key}`}
                  className="border border-gray-300 rounded-lg px-3 py-2 min-h-20"
                  value={draft[key] ?? ""}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {session.mode === "ayush" && <AyushPanel session={session} />}

        <details className="border border-gray-300 rounded-xl px-4 py-3">
          <summary className="cursor-pointer font-semibold">FHIR bundle (JSON)</summary>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3 overflow-auto max-h-96">
            {JSON.stringify(session.fhirBundle ?? null, null, 2)}
          </pre>
        </details>

        {error && <p className="text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {notice && <p className="text-green-800 bg-green-50 rounded-lg px-3 py-2">{notice}</p>}

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            disabled={busy || !draft}
            onClick={() => act("accept")}
            className="min-h-12 px-5 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy || !draft}
            onClick={() => act("amend")}
            className="min-h-12 px-5 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50"
          >
            Amend and confirm
          </button>
          <button
            type="button"
            disabled={busy || !draft}
            onClick={() => act("reject")}
            className="min-h-12 px-5 rounded-lg border border-red-400 text-red-700 font-semibold disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-amber-50 border-t border-amber-300 text-amber-900 text-sm px-4 py-3 text-center">
        Draft generated from patient self-report. Not clinically validated. Physician confirmation required.
      </footer>
    </div>
  );
}
