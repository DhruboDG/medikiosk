"use client";

/* Terminal screen for a session that raised an EMERGENCY_CONCEPTS concept
   (lib/redflag.ts). No further questions. The session is already saved with
   status "pending_review" by the answer route, so it shows up in the queue
   as an emergency case. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "../../components/AppProvider.tsx";
import { speak } from "../../lib/tts.ts";
import { EMERGENCY_SCREEN_TIMEOUT_MS, useInactivityTimeout } from "../../lib/kiosk-timeout.ts";
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

const NEXT_PATIENT_ACTION: Localised = {
  en: "Staff: start next patient",
  hi: "स्टाफ: अगला मरीज़ शुरू करें",
};

const CONFIRM_PROMPT: Localised = {
  en: "Start the next patient? This will clear this screen.",
  hi: "क्या अगला मरीज़ शुरू करें? इससे यह स्क्रीन साफ़ हो जाएगी।",
};

const CONFIRM_YES: Localised = {
  en: "Yes, start next patient",
  hi: "हां, अगला मरीज़ शुरू करें",
};

const CONFIRM_CANCEL: Localised = { en: "Cancel", hi: "रद्द करें" };

const RETURNING_SOON: Localised = {
  en: "Returning to start",
  hi: "शुरुआत पर लौट रहे हैं",
};

export default function EmergencyPage() {
  const router = useRouter();
  const { lang, highContrast, sessionId, setSessionId } = useAppContext();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
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

  function startNextPatient() {
    // The session stays in the database with its status and red flag
    // intact. Only the on-screen reference to it is cleared.
    setSessionId(null);
    router.push("/");
  }

  const secondsLeft = useInactivityTimeout(EMERGENCY_SCREEN_TIMEOUT_MS, startNextPatient);

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

        <div className="emergency-staff-area">
          {!confirming && (
            <button
              type="button"
              className="kiosk-secondary-btn emergency-staff-btn"
              onClick={() => setConfirming(true)}
            >
              {NEXT_PATIENT_ACTION.en} / {NEXT_PATIENT_ACTION.hi}
            </button>
          )}

          {confirming && (
            <div className="emergency-confirm">
              <p className="emergency-confirm-text">
                {CONFIRM_PROMPT.en}
                <br />
                {CONFIRM_PROMPT.hi}
              </p>
              <div className="kiosk-nav-row">
                <button type="button" className="kiosk-secondary-btn" onClick={() => setConfirming(false)}>
                  {CONFIRM_CANCEL.en} / {CONFIRM_CANCEL.hi}
                </button>
                <button type="button" className="kiosk-primary-btn" onClick={startNextPatient}>
                  {CONFIRM_YES.en} / {CONFIRM_YES.hi}
                </button>
              </div>
            </div>
          )}
        </div>

        {secondsLeft !== null && (
          <p className="emergency-countdown">
            {RETURNING_SOON[lang]} ({secondsLeft})
          </p>
        )}
      </main>
    </div>
  );
}
