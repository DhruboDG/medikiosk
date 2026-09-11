/* Deterministic red-flag rules. This layer exists only to stop a
   time-critical patient from waiting in the queue. It is not triage and not
   diagnosis.

   It may only escalate. The result is the maximum of these rules and
   whatever priority the session already holds, so nothing here can lower a
   hit that a rule or a model raised earlier. */

import type { Answer, RedFlag, Session } from "./types.ts";
import { CONCEPTS, conceptsByClause } from "./concepts.ts";

type Level = RedFlag["level"];
const RANK: Record<Level, number> = { none: 0, moderate: 1, high: 2 };

/* High on their own. When several are present, the first in this list is
   reported. cannot_speak is here as well as the seven named in the brief,
   because a patient who can manage only a few words is in respiratory
   distress. */
const HIGH_ON_THEIR_OWN = [
  "breathlessness", "unconscious", "stroke", "bleeding",
  "coughing_blood", "choking", "severe_burn", "cannot_speak",
];

/* A second cardiac concept next to chest pain makes it high. */
const CARDIAC_WITH_CHEST_PAIN = ["heart_attack", "sweating", "radiating_pain", "palpitations"];

/* Moderate on their own. Chest pain is handled by its own rule. */
const MODERATE_ON_THEIR_OWN = ["heart_attack", "unbearable"];

/* The SOCRATES onset node in ontology/general.json, and its option values
   that mean the pain began under 24 hours ago. */
const ONSET_NODE = "chest_onset";
const ONSET_UNDER_24H = ["lt_1h", "lt_24h"];

const NONE: RedFlag = { level: "none", concept: null, reason: "" };

interface Evidence {
  /* concept -> the patient's words where it was first raised */
  words: Map<string, string>;
  /* the patient's words that place chest pain under 24 hours, if any */
  recentChestPain: string | null;
}

function textsOf(a: Answer): string[] {
  const raw = String(a.raw ?? "");
  const value = String(a.value ?? "");
  return value && value !== raw ? [raw, value] : [raw];
}

/* Runs the concept layer over every answer, the chief complaint included.
   Superseded answers are scanned too, so changing an answer cannot clear a
   hit. */
function gather(session: Session): Evidence {
  const words = new Map<string, string>();
  let recentChestPain: string | null = null;

  for (const a of session.answers ?? []) {
    const said = String(a.raw || a.value || "");
    const clauses = textsOf(a).flatMap((t) => conceptsByClause(t));
    // Tap answers store option values. A value that is a concept key raises it.
    const values = String(a.value ?? "").split(",").map((v) => v.trim());
    const valueConcepts = values.filter((v) => Object.hasOwn(CONCEPTS, v));

    for (const c of [...clauses.flat(), ...valueConcepts]) {
      if (!words.has(c)) words.set(c, said);
    }

    if (recentChestPain !== null) continue;
    // "आज सुबह से सीने में दर्द": chest pain and a recent onset in one clause.
    const sameClause = clauses.some((cl) => cl.includes("chest_pain") && cl.includes("recent_onset"));
    // The answer to the SOCRATES onset question.
    const onsetAnswer = a.nodeId === ONSET_NODE &&
      (values.some((v) => ONSET_UNDER_24H.includes(v)) || clauses.some((cl) => cl.includes("recent_onset")));
    if (sameClause || onsetAnswer) recentChestPain = said;
  }
  return { words, recentChestPain };
}

function quote(said: string | undefined): string {
  const s = String(said ?? "").trim();
  if (!s) return "";
  return ` Patient's words: "${s.length > 160 ? s.slice(0, 157) + "..." : s}"`;
}

function label(concept: string): string {
  return CONCEPTS[concept]?.label.en ?? concept;
}

function fromRules(session: Session): RedFlag {
  const { words, recentChestPain } = gather(session);

  for (const c of HIGH_ON_THEIR_OWN) {
    if (words.has(c)) {
      return { level: "high", concept: c, reason: `${label(c)} is a high-priority sign on its own.${quote(words.get(c))}` };
    }
  }

  if (words.has("chest_pain")) {
    if (recentChestPain !== null) {
      return { level: "high", concept: "chest_pain",
        reason: `Chest pain that began less than 24 hours ago.${quote(recentChestPain)}` };
    }
    const companion = CARDIAC_WITH_CHEST_PAIN.find((c) => words.has(c));
    if (companion) {
      const chestWords = words.get("chest_pain");
      const companionWords = words.get(companion);
      const said = companionWords && companionWords !== chestWords
        ? `${quote(chestWords)} and "${companionWords}"`
        : quote(chestWords);
      return { level: "high", concept: "chest_pain",
        reason: `Chest pain together with ${label(companion).toLowerCase()}.${said}` };
    }
    return { level: "moderate", concept: "chest_pain",
      reason: `Chest pain with no recent onset and no second cardiac sign reported.${quote(words.get("chest_pain"))}` };
  }

  for (const c of MODERATE_ON_THEIR_OWN) {
    if (words.has(c)) {
      return { level: "moderate", concept: c, reason: `${label(c)} reported.${quote(words.get(c))}` };
    }
  }

  return NONE;
}

/** Red-flag level for a session. Never lower than the level it already holds. */
export function evaluate(session: Session): RedFlag {
  const rules = fromRules(session);
  const prior = session.redFlag;
  if (prior && (RANK[prior.level] ?? 0) > RANK[rules.level]) return prior;
  return rules;
}
