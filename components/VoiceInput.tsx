"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Lang, Localised } from "../lib/types.ts";
import { INSECURE_ORIGIN_MESSAGE, abortVoice, isInsecureOrigin, isListening, isSupported, startListening } from "../lib/asr.ts";

/* Browser mic support never changes after load, so subscribe is a no-op.
   useSyncExternalStore (rather than useState+useEffect) reads it without a
   server/client hydration mismatch, since getServerSnapshot supplies the
   value used for the initial server-rendered markup. */
function subscribeNever() {
  return () => {};
}

export interface VoiceInputProps {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  placeholder?: Localised;
  /** false for short confirmation fields; true (default) for free text. */
  multiline?: boolean;
}

const DEFAULT_PLACEHOLDER: Localised = {
  en: "Type, or tap the microphone and speak",
  hi: "टाइप करें, या माइक्रोफ़ोन दबाकर बोलें",
};

const UNSUPPORTED_MESSAGE: Localised = {
  en: "Voice input is not available on this device. Please type your answer.",
  hi: "इस डिवाइस पर आवाज़ इनपुट उपलब्ध नहीं है। कृपया अपना उत्तर टाइप करें।",
};

export default function VoiceInput({ lang, value, onChange, placeholder, multiline = true }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<Localised | null>(null);
  const supported = useSyncExternalStore(subscribeNever, isSupported, () => true);

  // Rule 2: abandon any live recognition when this field leaves the screen.
  useEffect(() => () => abortVoice(), []);

  function handleMicTap() {
    setError(null);
    if (!isListening()) setInterim("");
    startListening(lang, {
      onListening: setListening,
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim("");
        onChange(text); // Rule 7: dictation replaces the value, never appends.
      },
      onError: setError,
      onEnd: () => setInterim(""),
    });
  }

  const shownPlaceholder = (placeholder ?? DEFAULT_PLACEHOLDER)[lang];

  return (
    <div className="voice-input">
      <div className="voice-input-row">
        {multiline ? (
          <textarea
            className="voice-input-field"
            value={value}
            placeholder={shownPlaceholder}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            className="voice-input-field"
            type="text"
            value={value}
            placeholder={shownPlaceholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {supported && (
          <button
            type="button"
            className={listening ? "voice-mic-btn voice-mic-btn-active" : "voice-mic-btn"}
            onClick={handleMicTap}
            aria-pressed={listening}
            aria-label={lang === "hi" ? "बोलकर उत्तर दें" : "Answer by speaking"}
          >
            {listening ? "⏹" : "\u{1F3A4}"}
          </button>
        )}
      </div>

      {listening && (
        <p className="voice-interim" aria-live="polite">
          {interim || (lang === "hi" ? "सुन रहे हैं…" : "Listening…")}
        </p>
      )}

      {!listening && value && (
        <p className="voice-readback">
          {lang === "hi" ? "आपने कहा: " : "You said: "}
          <span>{value}</span>
        </p>
      )}

      {!supported && (
        <p className="voice-warning" role="alert">
          {(isInsecureOrigin() ? INSECURE_ORIGIN_MESSAGE : UNSUPPORTED_MESSAGE)[lang]}
        </p>
      )}

      {error && (
        <div className="voice-error" role="alert">
          {error[lang]}
        </div>
      )}
    </div>
  );
}
