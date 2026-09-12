"use client";

/* Name, age, gender, then the ontology-driven question loop. Every screen
   goes through KioskShell so the audio prompt, language toggle, high
   contrast toggle and progress indicator are consistent. Every question is
   answerable by tapping a large option or by speaking through VoiceInput. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KioskShell from "../../components/KioskShell.tsx";
import VoiceInput from "../../components/VoiceInput.tsx";
import { useAppContext } from "../../components/AppProvider.tsx";
import { warmUpMicrophone } from "../../lib/asr.ts";
import { AYUSH_DISCLAIMER, loadTree, nextNode, progress, tapAnswer } from "../../lib/ontology.ts";
import { isEmergency } from "../../lib/redflag.ts";
import type { Answer, HistoryNode, Lang, Localised, Option, Session } from "../../lib/types.ts";

type Phase = "name" | "age" | "gender" | "creating" | "question";

const COPY = {
  namePrompt: { en: "What is your name?", hi: "आपका नाम क्या है?" } as Localised,
  namePlaceholder: { en: "Say or type your full name", hi: "अपना पूरा नाम बोलें या लिखें" } as Localised,
  nameError: { en: "Please enter your name.", hi: "कृपया अपना नाम लिखें।" } as Localised,
  agePrompt: { en: "What is your age?", hi: "आपकी उम्र कितनी है?" } as Localised,
  agePlaceholder: { en: "Say or type your age in years", hi: "अपनी उम्र साल में बोलें या लिखें" } as Localised,
  ageError: { en: "Please enter a valid age, in years.", hi: "कृपया सही उम्र साल में लिखें।" } as Localised,
  genderPrompt: { en: "What is your gender?", hi: "आपका लिंग क्या है?" } as Localised,
  textPlaceholder: { en: "Say or type your answer", hi: "अपना उत्तर बोलें या लिखें" } as Localised,
  textError: { en: "Please answer to continue.", hi: "जारी रखने के लिए उत्तर दें।" } as Localised,
  multiError: { en: "Select at least one option.", hi: "कम से कम एक विकल्प चुनें।" } as Localised,
  startError: {
    en: "Could not start the session. Check the connection and try again.",
    hi: "सेशन शुरू नहीं हो सका। कनेक्शन जांचें और फिर कोशिश करें।",
  } as Localised,
  saveError: {
    en: "Could not save your answer. Check the connection and try again.",
    hi: "आपका उत्तर सेव नहीं हो सका। कनेक्शन जांचें और फिर कोशिश करें।",
  } as Localised,
  continue: { en: "Continue", hi: "आगे बढ़ें" } as Localised,
  back: { en: "Back", hi: "पीछे" } as Localised,
  starting: { en: "Starting your session…", hi: "सेशन शुरू हो रहा है…" } as Localised,
  finishing: { en: "Finishing up…", hi: "पूरा हो रहा है…" } as Localised,
};

const GENDER_OPTIONS: Option[] = [
  { id: "male", value: "male", icon: "\u{1F468}", label: { en: "Male", hi: "पुरुष" } },
  { id: "female", value: "female", icon: "\u{1F469}", label: { en: "Female", hi: "महिला" } },
  { id: "other", value: "other", icon: "\u{1F9D1}", label: { en: "Other", hi: "अन्य" } },
];

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function OptionGrid({
  options,
  selectedIds,
  disabled,
  lang,
  onTap,
}: {
  options: Option[];
  selectedIds: Set<string>;
  disabled: boolean;
  lang: Lang;
  onTap: (option: Option) => void;
}) {
  return (
    <div className="kiosk-options">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={selectedIds.has(option.id) ? "kiosk-option selected" : "kiosk-option"}
          disabled={disabled}
          aria-pressed={selectedIds.has(option.id)}
          onClick={() => onTap(option)}
        >
          {option.icon && (
            <span className="kiosk-option-icon" aria-hidden="true">
              {option.icon}
            </span>
          )}
          <span className="kiosk-option-label">{option.label[lang]}</span>
        </button>
      ))}
    </div>
  );
}

export default function IntakePage() {
  const router = useRouter();
  const { lang, setLang, highContrast, setHighContrast, mode, setSessionId } = useAppContext();

  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<Localised | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [renderedNodeId, setRenderedNodeId] = useState<string | undefined>(undefined);

  const tree = loadTree(mode);
  const node: HistoryNode | null = session ? nextNode(tree, session.answers) : null;
  const isFinishing = phase === "question" && !!session && !node;

  // A fresh question clears whatever was drafted for the previous one. Adjusting
  // state during render (rather than in an effect) avoids an extra commit.
  if (node?.id !== renderedNodeId) {
    setRenderedNodeId(node?.id);
    setDraftText("");
    setMultiSelected(new Set());
  }

  useEffect(() => {
    warmUpMicrophone();
  }, []);

  useEffect(() => {
    if (!isFinishing || !session) return;
    let cancelled = false;
    // Best-effort: on congested wifi this call itself can fail or time out.
    // The summary route falls back to a template internally when Gemini is
    // unreachable, but if the POST never lands at all the session simply
    // stays in_progress and the patient must not be stuck on this screen.
    fetchWithTimeout(`/api/session/${session.id}/summary`, { method: "POST" })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) router.push("/done");
      });
    return () => {
      cancelled = true;
    };
  }, [isFinishing, session, router]);

  function handleNameContinue() {
    if (!name.trim()) {
      setError(COPY.nameError);
      return;
    }
    setError(null);
    setPhase("age");
  }

  function handleAgeContinue() {
    const match = age.match(/\d+/);
    const value = match ? parseInt(match[0], 10) : NaN;
    if (!match || Number.isNaN(value) || value <= 0 || value > 120) {
      setError(COPY.ageError);
      return;
    }
    setError(null);
    setPhase("gender");
  }

  async function handleGenderSelect(option: Option) {
    setError(null);
    setBusy(true);
    setPhase("creating");
    const match = age.match(/\d+/);
    const ageValue = match ? parseInt(match[0], 10) : 0;
    try {
      const res = await fetchWithTimeout("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), age: ageValue, gender: option.value, lang, mode }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { session: Session };
      setSessionId(data.session.id);
      setSession(data.session);
      setPhase("question");
    } catch {
      setError(COPY.startError);
      setPhase("gender");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(answer: Answer) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/session/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answer),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { session: Session };
      // Stop the question loop here rather than setting session and letting
      // the next question render: an emergency concept means no more
      // questions are asked at all.
      if (isEmergency(data.session)) {
        router.push("/emergency");
        return;
      }
      setSession(data.session);
    } catch {
      setError(COPY.saveError);
    } finally {
      setBusy(false);
    }
  }

  function toggleMulti(optionId: string) {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  function submitMulti() {
    if (!node || multiSelected.size === 0) {
      setError(COPY.multiError);
      return;
    }
    setError(null);
    submitAnswer(tapAnswer(node, [...multiSelected], lang));
  }

  function submitText() {
    if (!node) return;
    if (!draftText.trim()) {
      setError(COPY.textError);
      return;
    }
    setError(null);
    submitAnswer({ nodeId: node.id, raw: draftText, value: draftText, via: "type" });
  }

  const onToggleHighContrast = () => setHighContrast(!highContrast);

  if (phase === "name") {
    return (
      <KioskShell
        questionId="intake_name"
        lang={lang}
        onLangChange={setLang}
        highContrast={highContrast}
        onToggleHighContrast={onToggleHighContrast}
        progress={{ answered: 0, total: 3 }}
        prompt={COPY.namePrompt}
      >
        <VoiceInput lang={lang} value={name} onChange={setName} placeholder={COPY.namePlaceholder} multiline={false} />
        {error && (
          <div className="voice-error" role="alert">
            {error[lang]}
          </div>
        )}
        <div className="kiosk-nav-row">
          <button type="button" className="kiosk-primary-btn" onClick={handleNameContinue}>
            {COPY.continue[lang]}
          </button>
        </div>
      </KioskShell>
    );
  }

  if (phase === "age") {
    return (
      <KioskShell
        questionId="intake_age"
        lang={lang}
        onLangChange={setLang}
        highContrast={highContrast}
        onToggleHighContrast={onToggleHighContrast}
        progress={{ answered: 1, total: 3 }}
        prompt={COPY.agePrompt}
      >
        <VoiceInput lang={lang} value={age} onChange={setAge} placeholder={COPY.agePlaceholder} multiline={false} />
        {error && (
          <div className="voice-error" role="alert">
            {error[lang]}
          </div>
        )}
        <div className="kiosk-nav-row">
          <button type="button" className="kiosk-secondary-btn" onClick={() => setPhase("name")}>
            {COPY.back[lang]}
          </button>
          <button type="button" className="kiosk-primary-btn" onClick={handleAgeContinue}>
            {COPY.continue[lang]}
          </button>
        </div>
      </KioskShell>
    );
  }

  if (phase === "gender") {
    return (
      <KioskShell
        questionId="intake_gender"
        lang={lang}
        onLangChange={setLang}
        highContrast={highContrast}
        onToggleHighContrast={onToggleHighContrast}
        progress={{ answered: 2, total: 3 }}
        prompt={COPY.genderPrompt}
      >
        <OptionGrid
          options={GENDER_OPTIONS}
          selectedIds={new Set()}
          disabled={busy}
          lang={lang}
          onTap={handleGenderSelect}
        />
        {error && (
          <div className="voice-error" role="alert">
            {error[lang]}
          </div>
        )}
        <div className="kiosk-nav-row">
          <button type="button" className="kiosk-secondary-btn" disabled={busy} onClick={() => setPhase("age")}>
            {COPY.back[lang]}
          </button>
        </div>
      </KioskShell>
    );
  }

  if (phase === "creating" || isFinishing || !node) {
    const label = phase === "creating" ? COPY.starting[lang] : COPY.finishing[lang];
    return (
      <div className={highContrast ? "kiosk-shell kiosk-contrast" : "kiosk-shell"}>
        <main className="kiosk-main">
          <p className="kiosk-prompt">{label}</p>
        </main>
      </div>
    );
  }

  const prog = session ? progress(tree, session.answers) : { answered: 0, total: 1, fraction: 0 };

  return (
    <KioskShell
      questionId={node.id}
      lang={lang}
      onLangChange={setLang}
      highContrast={highContrast}
      onToggleHighContrast={onToggleHighContrast}
      progress={{ answered: prog.answered, total: prog.total }}
      prompt={node.prompt}
      source={node.source}
    >
      {node.section === "ayush" && (
        <p className="kiosk-ayush-note">{AYUSH_DISCLAIMER[lang]}</p>
      )}

      {node.answerType === "single" && (
        <OptionGrid
          options={node.options ?? []}
          selectedIds={new Set()}
          disabled={busy}
          lang={lang}
          onTap={(option) => submitAnswer(tapAnswer(node, [option.id], lang))}
        />
      )}

      {node.answerType === "multi" && (
        <>
          <OptionGrid
            options={node.options ?? []}
            selectedIds={multiSelected}
            disabled={busy}
            lang={lang}
            onTap={(option) => toggleMulti(option.id)}
          />
          <div className="kiosk-nav-row">
            <button type="button" className="kiosk-primary-btn" disabled={busy} onClick={submitMulti}>
              {COPY.continue[lang]}
            </button>
          </div>
        </>
      )}

      {(node.answerType === "text" || node.answerType === "number" || node.answerType === "duration") && (
        <>
          <VoiceInput lang={lang} value={draftText} onChange={setDraftText} placeholder={COPY.textPlaceholder} />
          <div className="kiosk-nav-row">
            <button type="button" className="kiosk-primary-btn" disabled={busy} onClick={submitText}>
              {COPY.continue[lang]}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="voice-error" role="alert">
          {error[lang]}
        </div>
      )}
    </KioskShell>
  );
}
