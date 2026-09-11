"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang, Localised } from "../lib/types.ts";
import { abortVoice } from "../lib/asr.ts";
import { speak } from "../lib/tts.ts";

export interface KioskProgress {
  answered: number;
  total: number;
}

export interface KioskShellProps {
  /** Identifies the current screen, so the audio prompt and the rule-2
   *  abort both key off it instead of prompt text, which two questions
   *  could share. */
  questionId: string;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  progress: KioskProgress;
  prompt: Localised;
  /** Traceability line, e.g. "SOCRATES" or "PS 3.3 Module A". */
  source?: string;
  children: ReactNode;
}

export default function KioskShell({
  questionId,
  lang,
  onLangChange,
  highContrast,
  onToggleHighContrast,
  progress,
  prompt,
  source,
  children,
}: KioskShellProps) {
  const [hindiVoiceMissing, setHindiVoiceMissing] = useState(false);
  // Strict Mode runs this effect twice per commit with identical deps, which
  // would otherwise queue the same prompt to speak twice.
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const text = prompt[lang];
    if (lastSpokenRef.current !== text) {
      lastSpokenRef.current = text;
      speak(text, lang).then((result) => {
        if (!cancelled) setHindiVoiceMissing(result.hindiVoiceMissing);
      });
    }
    return () => {
      cancelled = true;
      // Rule 2: a screen change detaches whatever DOM node started
      // listening, so any live recognition is abandoned here.
      abortVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, lang, prompt.en, prompt.hi]);

  function listenAgain() {
    speak(prompt[lang], lang).then((result) => setHindiVoiceMissing(result.hindiVoiceMissing));
  }

  const pct = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div className={highContrast ? "kiosk-shell kiosk-contrast" : "kiosk-shell"}>
      <header className="kiosk-topbar">
        <div
          className="kiosk-progress"
          role="progressbar"
          aria-valuenow={progress.answered}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div className="kiosk-progress-track">
            <div className="kiosk-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="kiosk-progress-label">
            {progress.answered} / {progress.total}
          </span>
        </div>
        <div className="kiosk-controls">
          <button
            type="button"
            className="kiosk-toggle"
            onClick={() => onLangChange(lang === "en" ? "hi" : "en")}
          >
            {lang === "en" ? "हिंदी" : "English"}
          </button>
          <button
            type="button"
            className="kiosk-toggle"
            aria-pressed={highContrast}
            onClick={onToggleHighContrast}
          >
            {highContrast
              ? lang === "hi"
                ? "सामान्य कंट्रास्ट"
                : "Normal contrast"
              : lang === "hi"
                ? "उच्च कंट्रास्ट"
                : "High contrast"}
          </button>
        </div>
      </header>

      <main className="kiosk-main">
        <h1 className="kiosk-prompt">{prompt[lang]}</h1>
        {source && <p className="kiosk-source">{source}</p>}

        <button type="button" className="kiosk-listen-again" onClick={listenAgain}>
          {"\u{1F50A} "}
          {lang === "hi" ? "फिर से सुनें" : "Listen again"}
        </button>

        {hindiVoiceMissing && (
          <p className="kiosk-warning" role="alert">
            {lang === "hi"
              ? "इस डिवाइस पर हिंदी आवाज़ उपलब्ध नहीं है। कृपया पाठ पढ़ें।"
              : "No Hindi voice is installed on this device. Please read the text."}
          </p>
        )}

        <div className="kiosk-answer-area">{children}</div>
      </main>
    </div>
  );
}
