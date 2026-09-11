"use client";

/* Shared client state for the kiosk: language, contrast, mode and the
   in-progress session id. Held in React context and nothing else, per
   CLAUDE.md — the kiosk is a shared device and none of this should survive
   in localStorage for the next patient to inherit. */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Lang, Mode } from "../lib/types.ts";

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const [highContrast, setHighContrast] = useState(false);
  const [mode, setMode] = useState<Mode>("allopathic");
  const [sessionId, setSessionId] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{ lang, setLang, highContrast, setHighContrast, mode, setMode, sessionId, setSessionId }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
