"use client";

/* Terminal screen for a session that raised an EMERGENCY_CONCEPTS concept
   (lib/redflag.ts). No further questions. The session is already saved with
   status "pending_review" by the answer route, so it shows up in the queue
   as an emergency case. */

import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../../components/AppProvider.tsx";
import { speak } from "../../lib/tts.ts";
import type { Localised, Session } from "../../lib/types.ts";

const HEADLINE: Localised = {
  en: "Go to the Emergency Department now.",
  hi: "अभी आपातकालीन विभाग (इमरजेंसी) में जाएं।",
};

const SHOW_STAFF: Localised = {
  en: "Show this screen to any staff member.",
  hi: "यह स्क्रीन किसी भी स्टाफ सदस्य को दिखाएं।",
};

const REASON_LABEL: Localised = { en: "Reason", hi: "कारण" };

export default function EmergencyPage() {
  const { lang, highContrast, sessionId } = useAppContext();
  const [reason, setReason] = useState("");
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/session/${sessionId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data: { session: Session }) => {
        if (!cancelled) setReason(data.session.redFlag.reason);
      })
      .catch(() => {
        // No reason text on failure. The bilingual instruction still stands.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const text = `${HEADLINE[lang]} ${SHOW_STAFF[lang]}`;
    if (lastSpokenRef.current !== text) {
      lastSpokenRef.current = text;
      speak(text, lang);
    }
  }, [lang]);

  return (
    <div className={highContrast ? "kiosk-shell kiosk-contrast emergency-shell" : "kiosk-shell emergency-shell"}>
      <main className="kiosk-main emergency-main">
        <p className="emergency-headline">{HEADLINE.en}</p>
        <p className="emergency-headline">{HEADLINE.hi}</p>
        <p className="emergency-sub">{SHOW_STAFF.en}</p>
        <p className="emergency-sub">{SHOW_STAFF.hi}</p>
        {reason && (
          <p className="emergency-reason">
            {REASON_LABEL.en} / {REASON_LABEL.hi}: {reason}
          </p>
        )}
      </main>
    </div>
  );
}
