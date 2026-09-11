/* Speech output. One entry point, speak(text, lang), used for every audio
   prompt and for the "listen again" button. */

import type { Lang } from "./types.ts";

const BCP47: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

export interface SpeakResult {
  /** False when the platform has no speech synthesis at all. */
  spoken: boolean;
  /** True when lang is "hi" and no installed voice covers Hindi. */
  hindiVoiceMissing: boolean;
}

function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* getVoices() can return an empty list on first call, before the browser has
   finished loading its voice list, and only fires "voiceschanged" once that
   happens. A fallback timer covers browsers that never fire it. */
function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!supported()) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length) {
      resolve(existing);
      return;
    }
    let done = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = () => finish(synth.getVoices());
    synth.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => finish(synth.getVoices()), 500);
  });
}

function hindiVoiceAvailable(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some((v) => v.lang.toLowerCase().startsWith("hi"));
}

function pickVoice(lang: Lang, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const code = BCP47[lang];
  return (
    voices.find((v) => v.lang === code) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    undefined
  );
}

/** Speaks `text` in `lang`, cancelling any narration already in progress. */
export async function speak(text: string, lang: Lang): Promise<SpeakResult> {
  if (!supported()) return { spoken: false, hindiVoiceMissing: lang === "hi" };
  const synth = window.speechSynthesis;
  synth.cancel();
  if (!text) return { spoken: false, hindiVoiceMissing: false };

  const voices = await getVoicesAsync();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = BCP47[lang];
  const voice = pickVoice(lang, voices);
  if (voice) utterance.voice = voice;
  synth.speak(utterance);

  return { spoken: true, hindiVoiceMissing: lang === "hi" && !hindiVoiceAvailable(voices) };
}

/** Cancels any narration in progress without starting new speech. */
export function stopSpeaking(): void {
  if (supported()) window.speechSynthesis.cancel();
}
