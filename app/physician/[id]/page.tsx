"use client";

/* Physician detail view for one session. Rendering is shared with
   app/pt_history/page.tsx via components/PatientHistory.tsx. */

import { use } from "react";
import { useRouter } from "next/navigation";
import PatientHistory from "../../../components/PatientHistory.tsx";

export default function PhysicianSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col pb-24">
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <PatientHistory sessionId={id} onConfirmed={() => router.push("/physician")} />
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-amber-50 border-t border-amber-300 text-amber-900 text-sm px-4 py-3 text-center">
        Draft generated from patient self-report. Not clinically validated. Physician confirmation required.
      </footer>
    </div>
  );
}
