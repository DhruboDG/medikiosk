"use client";

/* Confirmation screen. Token number and a spoken thank-you only. No answer,
   summary or red-flag information is shown to the patient here. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import KioskShell from "../../components/KioskShell.tsx";
import { useAppContext } from "../../components/AppProvider.tsx";
import { DONE_SCREEN_TIMEOUT_MS, useInactivityTimeout } from "../../lib/kiosk-timeout.ts";
import type { Localised, Session } from "../../lib/types.ts";

const WAITING: Localised = {
  en: "Please take a seat, you will be called shortly.",
  hi: "कृपया बैठिए, आपको जल्द बुलाया जाएगा।",
};

const NO_CLINICAL_INFO: Localised = {
  en: "Your answers have been sent to the doctor. No clinical information is shown here.",
  hi: "आपके उत्तर डॉक्टर के पास भेज दिए गए हैं। यहां कोई चिकित्सीय जानकारी नहीं दिखाई जाती।",
};

const NEXT_PATIENT: Localised = { en: "Next patient", hi: "अगला मरीज़" };

const RETURNING_SOON: Localised = {
  en: "Returning to start",
  hi: "शुरुआत पर लौट रहे हैं",
};

export default function DonePage() {
  const router = useRouter();
  const { lang, setLang, highContrast, setHighContrast, sessionId, setSessionId, setMode } = useAppContext();
  const [tokenNumber, setTokenNumber] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/session/${sessionId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data: { session: Session }) => {
        if (cancelled) return;
        setTokenNumber(data.session.token ?? null);
      })
      .catch(() => setTokenNumber(null));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const prompt = useMemo<Localised>(() => {
    if (tokenNumber === null) {
      return { en: `Thank you. ${WAITING.en}`, hi: `धन्यवाद। ${WAITING.hi}` };
    }
    return {
      en: `Thank you. Your token number is ${tokenNumber}. ${WAITING.en}`,
      hi: `धन्यवाद। आपका टोकन नंबर ${tokenNumber} है। ${WAITING.hi}`,
    };
  }, [tokenNumber]);

  function startNewPatient() {
    setSessionId(null);
    setMode("allopathic");
    router.push("/");
  }

  const secondsLeft = useInactivityTimeout(DONE_SCREEN_TIMEOUT_MS, startNewPatient);

  return (
    <KioskShell
      questionId="done"
      lang={lang}
      onLangChange={setLang}
      highContrast={highContrast}
      onToggleHighContrast={() => setHighContrast(!highContrast)}
      progress={{ answered: 1, total: 1 }}
      prompt={prompt}
    >
      {tokenNumber !== null && <p className="done-token">{tokenNumber}</p>}
      <p className="kiosk-source">{NO_CLINICAL_INFO[lang]}</p>
      <div className="kiosk-nav-row">
        <button type="button" className="kiosk-primary-btn" onClick={startNewPatient}>
          {NEXT_PATIENT[lang]}
        </button>
      </div>
      {secondsLeft !== null && (
        <p className="kiosk-source">
          {RETURNING_SOON[lang]} ({secondsLeft})
        </p>
      )}
    </KioskShell>
  );
}
