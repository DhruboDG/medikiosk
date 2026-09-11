"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "../components/AppProvider.tsx";
import { speak } from "../lib/tts.ts";
import type { Lang, Localised, Mode } from "../lib/types.ts";

const COPY: Record<string, Localised> = {
  title: { en: "MediKiosk", hi: "मेडिकियोस्क" },
  welcome: {
    en: "Welcome. Please choose your language, then tap Start.",
    hi: "स्वागत है। कृपया अपनी भाषा चुनें, फिर शुरू करें दबाएं।",
  },
  languageLabel: { en: "Language", hi: "भाषा" },
  contrastLabel: { en: "Display", hi: "डिस्प्ले" },
  highContrastOn: { en: "High contrast", hi: "उच्च कंट्रास्ट" },
  highContrastOff: { en: "Normal contrast", hi: "सामान्य कंट्रास्ट" },
  modeLabel: { en: "Consultation type", hi: "परामर्श का प्रकार" },
  allopathic: { en: "Allopathic", hi: "एलोपैथिक" },
  ayush: { en: "AYUSH", hi: "आयुष" },
  comingNext: { en: "Coming next", hi: "जल्द आ रहा है" },
  start: { en: "Start", hi: "शुरू करें" },
  listenAgain: { en: "\u{1F50A} Listen again", hi: "\u{1F50A} फिर से सुनें" },
  hindiVoiceMissing: {
    en: "No Hindi voice is installed on this device. Please read the text.",
    hi: "इस डिवाइस पर हिंदी आवाज़ उपलब्ध नहीं है। कृपया पाठ पढ़ें।",
  },
};

export default function LandingPage() {
  const router = useRouter();
  const { lang, setLang, highContrast, setHighContrast, mode, setMode } = useAppContext();
  const [hindiVoiceMissing, setHindiVoiceMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    speak(COPY.welcome[lang], lang).then((result) => {
      if (!cancelled) setHindiVoiceMissing(result.hindiVoiceMissing);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  function listenAgain() {
    speak(COPY.welcome[lang], lang).then((result) => setHindiVoiceMissing(result.hindiVoiceMissing));
  }

  function chooseLang(next: Lang) {
    setLang(next);
  }

  function chooseMode(next: Mode) {
    setMode(next);
  }

  return (
    <div className={highContrast ? "kiosk-shell kiosk-contrast" : "kiosk-shell"}>
      <main className="landing-main">
        <h1 className="landing-title">{COPY.title[lang]}</h1>
        <p className="landing-subtitle">{COPY.welcome[lang]}</p>

        <button type="button" className="kiosk-listen-again" onClick={listenAgain}>
          {COPY.listenAgain[lang]}
        </button>

        {hindiVoiceMissing && (
          <p className="kiosk-warning" role="alert">
            {COPY.hindiVoiceMissing[lang]}
          </p>
        )}

        <div className="landing-group">
          <span className="landing-group-label">{COPY.languageLabel[lang]}</span>
          <div className="landing-choice-row">
            <button
              type="button"
              className={lang === "en" ? "landing-choice-btn selected" : "landing-choice-btn"}
              aria-pressed={lang === "en"}
              onClick={() => chooseLang("en")}
            >
              English
            </button>
            <button
              type="button"
              className={lang === "hi" ? "landing-choice-btn selected" : "landing-choice-btn"}
              aria-pressed={lang === "hi"}
              onClick={() => chooseLang("hi")}
            >
              हिंदी
            </button>
          </div>
        </div>

        <div className="landing-group">
          <span className="landing-group-label">{COPY.contrastLabel[lang]}</span>
          <div className="landing-choice-row">
            <button
              type="button"
              className="kiosk-toggle"
              aria-pressed={highContrast}
              onClick={() => setHighContrast(!highContrast)}
            >
              {highContrast ? COPY.highContrastOff[lang] : COPY.highContrastOn[lang]}
            </button>
          </div>
        </div>

        <div className="landing-group">
          <span className="landing-group-label">{COPY.modeLabel[lang]}</span>
          <div className="landing-choice-row">
            <button
              type="button"
              className={mode === "allopathic" ? "landing-choice-btn selected" : "landing-choice-btn"}
              aria-pressed={mode === "allopathic"}
              onClick={() => chooseMode("allopathic")}
            >
              {COPY.allopathic[lang]}
            </button>
            <button type="button" className="landing-choice-btn" disabled aria-disabled="true">
              {COPY.ayush[lang]}
              <br />
              <span className="landing-note">{COPY.comingNext[lang]}</span>
            </button>
          </div>
        </div>

        <button type="button" className="landing-start-btn" onClick={() => router.push("/intake")}>
          {COPY.start[lang]}
        </button>
      </main>
    </div>
  );
}
