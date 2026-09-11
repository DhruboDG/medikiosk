"use client";

/* Temporary page for hand-testing the microphone lifecycle in isolation,
   before packet 3 wires KioskShell to the real ontology-driven question
   loop. Not linked from anywhere in the app. */

import { useEffect, useState } from "react";
import type { Lang, Localised } from "../../lib/types.ts";
import KioskShell from "../../components/KioskShell.tsx";
import VoiceInput from "../../components/VoiceInput.tsx";
import { warmUpMicrophone } from "../../lib/asr.ts";

interface DummyQuestion {
  id: string;
  prompt: Localised;
  placeholder: Localised;
  source: string;
  multiline: boolean;
}

const QUESTIONS: DummyQuestion[] = [
  {
    id: "q1",
    prompt: { en: "What brings you here today?", hi: "आज आप किस तकलीफ से आए हैं?" },
    placeholder: { en: "Describe how you feel", hi: "अपनी तकलीफ बताएं" },
    source: "PS 3.3 Module A",
    multiline: true,
  },
  {
    id: "q2",
    prompt: { en: "When did it start?", hi: "यह कब शुरू हुआ?" },
    placeholder: { en: "For example, two hours ago", hi: "उदाहरण के लिए, दो घंटे पहले" },
    source: "SOCRATES",
    multiline: false,
  },
  {
    id: "q3",
    prompt: { en: "Any allergies to medicines?", hi: "क्या दवाओं से कोई एलर्जी है?" },
    placeholder: { en: "Name the medicine, if any", hi: "यदि हो तो दवा का नाम बताएं" },
    source: "PS 3.3 Module C",
    multiline: false,
  },
];

export default function MicTestPage() {
  const [index, setIndex] = useState(0);
  const [lang, setLang] = useState<Lang>("en");
  const [highContrast, setHighContrast] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    warmUpMicrophone();
  }, []);

  const question = QUESTIONS[index];

  return (
    <KioskShell
      questionId={question.id}
      lang={lang}
      onLangChange={setLang}
      highContrast={highContrast}
      onToggleHighContrast={() => setHighContrast((v) => !v)}
      progress={{ answered: index, total: QUESTIONS.length }}
      prompt={question.prompt}
      source={question.source}
    >
      <VoiceInput
        key={question.id}
        lang={lang}
        value={answers[question.id] ?? ""}
        onChange={(v) => setAnswers((a) => ({ ...a, [question.id]: v }))}
        placeholder={question.placeholder}
        multiline={question.multiline}
      />

      <div className="kiosk-nav-row">
        <button
          type="button"
          className="kiosk-secondary-btn"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          {lang === "hi" ? "पीछे" : "Back"}
        </button>
        <button
          type="button"
          className="kiosk-primary-btn"
          disabled={index === QUESTIONS.length - 1}
          onClick={() => setIndex((i) => Math.min(QUESTIONS.length - 1, i + 1))}
        >
          {lang === "hi" ? "आगे" : "Next"}
        </button>
      </div>

      <pre className="kiosk-debug">{JSON.stringify(answers, null, 2)}</pre>
    </KioskShell>
  );
}
