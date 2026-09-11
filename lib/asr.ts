/* Speech recognition wrapper. Seven rules below, each fixing a measured
   defect in the earlier prototype. Any change here must keep all seven.

   1. One SpeechRecognition instance for the whole session, created lazily
      and reused. A new instance per tap kills the microphone after three
      answers.
   2. abortVoice() runs on every screen change, because a re-render detaches
      any DOM node captured when listening began.
   3. Tapping an already-listening mic stops it, never starts a second
      recognition.
   4. On InvalidStateError, abort and retry once after 300ms, then show a
      message.
   5. A 12 second watchdog aborts a recognition that never fires onend.
   6. warmUpMicrophone() calls getUserMedia once at session start and
      releases the track, keeping only the grant.
   7. Dictation replaces the field value, never appends, so a retry cannot
      double the text. (Enforced by callers: onFinal delivers the full
      utterance, never a fragment to concatenate.)

   TypeScript's DOM lib ships SpeechRecognitionAlternative, -Result and
   -ResultList but not SpeechRecognition itself or the vendor-prefixed
   constructor, so those are declared below. */

import type { Localised } from "./types.ts";

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export type AsrLang = "en" | "hi";

const BCP47: Record<AsrLang, string> = { en: "en-IN", hi: "hi-IN" };
const WATCHDOG_MS = 12000;
const RETRY_DELAY_MS = 300;

export interface AsrCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: Localised) => void;
  onEnd: () => void;
  /** Fired whenever the recognizer actually starts or stops listening. */
  onListening?: (listening: boolean) => void;
}

export const INSECURE_ORIGIN_MESSAGE: Localised = {
  en: "This page must be served over http://localhost or https for the microphone permission to persist.",
  hi: "माइक्रोफ़ोन की अनुमति बनी रहे, इसके लिए यह पेज http://localhost या https पर खुला होना चाहिए।",
};

const ERROR_MESSAGES: Record<string, Localised> = {
  "no-speech": {
    en: "No speech was heard. Try again.",
    hi: "कुछ सुनाई नहीं दिया। फिर से कोशिश करें।",
  },
  "audio-capture": {
    en: "No microphone was found on this device.",
    hi: "इस डिवाइस पर कोई माइक्रोफ़ोन नहीं मिला।",
  },
  "not-allowed": {
    en: "Microphone access was blocked. Allow microphone access in the browser and try again.",
    hi: "माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र में माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें।",
  },
  "service-not-allowed": {
    en: "Speech recognition is blocked on this device.",
    hi: "इस डिवाइस पर आवाज़ पहचान अवरुद्ध है।",
  },
  network: {
    en: "A network error interrupted speech recognition. Check the connection.",
    hi: "आवाज़ पहचानने में नेटवर्क त्रुटि आई। कनेक्शन जांचें।",
  },
  "language-not-supported": {
    en: "This language is not supported for speech on this device.",
    hi: "इस डिवाइस पर इस भाषा में आवाज़ पहचान उपलब्ध नहीं है।",
  },
  "bad-grammar": {
    en: "Speech could not be understood. Try again.",
    hi: "आवाज़ समझ में नहीं आई। फिर से कोशिश करें।",
  },
  "invalid-state": {
    en: "The microphone was busy and did not respond. Try again.",
    hi: "माइक्रोफ़ोन व्यस्त था और प्रतिक्रिया नहीं दी। फिर से कोशिश करें।",
  },
  unsupported: {
    en: "Speech input is not supported in this browser. Please type your answer.",
    hi: "इस ब्राउज़र में आवाज़ इनपुट उपलब्ध नहीं है। कृपया अपना उत्तर टाइप करें।",
  },
  timeout: {
    en: "Listening timed out. Try again.",
    hi: "सुनने का समय समाप्त हो गया। फिर से कोशिश करें।",
  },
  unknown: {
    en: "Something went wrong with the microphone. Try again.",
    hi: "माइक्रोफ़ोन में कुछ गड़बड़ हुई। फिर से कोशिश करें।",
  },
};

let recognition: SpeechRecognition | null = null;
let listening = false;
let retried = false;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let callbacks: AsrCallbacks | null = null;
let micWarmed = false;

function hasSpeechRecognitionApi(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** True when the microphone grant cannot be expected to persist. */
export function isInsecureOrigin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export function isSupported(): boolean {
  return hasSpeechRecognitionApi() && !isInsecureOrigin();
}

export function isListening(): boolean {
  return listening;
}

function clearWatchdog(): void {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function setListeningState(next: boolean): void {
  if (listening === next) return;
  listening = next;
  callbacks?.onListening?.(next);
}

/* Rule 1: created once, lazily, on first use, then reused for the whole
   session. Handlers are bound once and read the module-level `callbacks`
   pointer, so they keep working across many start/stop cycles. */
function getRecognition(): SpeechRecognition | null {
  if (recognition) return recognition;
  if (!hasSpeechRecognitionApi()) return null;
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 3;
  r.onresult = handleResult;
  r.onerror = handleError;
  r.onend = handleEnd;
  recognition = r;
  return r;
}

function handleResult(e: SpeechRecognitionEvent): void {
  let interim = "";
  let final = "";
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const result = e.results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  if (interim) callbacks?.onInterim(interim.trim());
  if (final) callbacks?.onFinal(final.trim());
}

function handleError(e: SpeechRecognitionErrorEvent): void {
  /* "aborted" is our own abortVoice() call (a screen change or a deliberate
     stop), not a user-facing failure. Stay quiet. */
  if (e.error === "aborted") return;
  callbacks?.onError(ERROR_MESSAGES[e.error] ?? ERROR_MESSAGES.unknown);
}

function handleEnd(): void {
  clearWatchdog();
  setListeningState(false);
  callbacks?.onEnd();
}

function attemptStart(): void {
  const r = recognition;
  if (!r) return;
  try {
    r.start();
    setListeningState(true);
    clearWatchdog();
    watchdog = setTimeout(() => {
      /* Rule 5: a recognition that never fires onend (a measured failure
         mode on some Android WebViews) is aborted after 12 seconds. */
      if (listening) {
        callbacks?.onError(ERROR_MESSAGES.timeout);
        abortVoice();
      }
    }, WATCHDOG_MS);
  } catch (err) {
    /* Rule 4: on InvalidStateError, abort and retry once after 300ms, then
       show a message. */
    if (err instanceof DOMException && err.name === "InvalidStateError" && !retried) {
      retried = true;
      try {
        r.abort();
      } catch {
        /* already stopped */
      }
      setListeningState(false);
      setTimeout(attemptStart, RETRY_DELAY_MS);
    } else {
      callbacks?.onError(ERROR_MESSAGES["invalid-state"]);
    }
  }
}

/**
 * Starts listening in `lang`, or stops an already-listening recognition
 * (rule 3: never a second one). Replaces the previous callbacks — only one
 * screen listens at a time.
 */
export function startListening(lang: AsrLang, cbs: AsrCallbacks): void {
  if (isInsecureOrigin()) {
    cbs.onError(INSECURE_ORIGIN_MESSAGE);
    return;
  }
  if (listening) {
    stopListening();
    return;
  }
  const r = getRecognition();
  if (!r) {
    cbs.onError(ERROR_MESSAGES.unsupported);
    return;
  }
  callbacks = cbs;
  r.lang = BCP47[lang];
  retried = false;
  attemptStart();
}

/** Stops a live recognition and lets its final result arrive normally. */
export function stopListening(): void {
  clearWatchdog();
  if (recognition && listening) {
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  }
}

/**
 * Rule 2: call this on every screen change. Abandons any live recognition
 * immediately rather than waiting for onend, because the DOM node that
 * requested it may already be gone.
 */
export function abortVoice(): void {
  clearWatchdog();
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      /* nothing was running */
    }
  }
  setListeningState(false);
  callbacks = null;
}

/**
 * Rule 6: call once at session start. Requests the microphone and
 * immediately releases the track, keeping only the permission grant so the
 * first real recognition does not stall on a fresh prompt.
 */
export async function warmUpMicrophone(): Promise<boolean> {
  if (micWarmed) return true;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    micWarmed = true;
    return true;
  } catch {
    return false;
  }
}
