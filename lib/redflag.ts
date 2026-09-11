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
   reported. heart_attack and cannot_speak are here as well as the seven named
   in the brief. A patient or relative saying "heart attack" should not wait,
   and a patient who can manage only a few words is in respiratory distress. */
const HIGH_ON_THEIR_OWN = [
  "breathlessness", "unconscious", "stroke", "bleeding",
  "coughing_blood", "choking", "severe_burn", "heart_attack", "cannot_speak",
];

/* A second cardiac concept next to chest pain makes it high. */
const CARDIAC_WITH_CHEST_PAIN = ["heart_attack", "sweating", "radiating_pain", "palpitations"];

/* Any two of these together are high, whether or not chest_pain is among
   them. The chest pain rules above depend on one word being recognised, and
   the vocabulary will always have holes ("my chest feels strange").
   recent_onset counts only when it is in the same answer as another member,
   and only when its own clause names a member or names no symptom at all. In
   "fever since this morning, and I am sweating" the onset belongs to the
   fever. In "my chest feels strange since last night" it belongs to something
   unrecognised, which may be chest wording the vocabulary missed. */
const CARDIAC_SET = [
  "chest_pain", "recent_onset", "radiating_pain", "sweating",
  "palpitations", "heart_attack", "breathlessness",
];

/* Concepts that say how bad a symptom is, not which symptom, so they never
   take an onset away from the cardiac rule. */
const SEVERITY_ONLY = ["unbearable"];

/* The onset in this clause belongs to a cardiac sign, or to nothing recognised. */
function onsetMayBeCardiac(clause: string[]): boolean {
  const others = clause.filter((c) => c !== "recent_onset" && !SEVERITY_ONLY.includes(c));
  return others.length === 0 || others.some((c) => CARDIAC_SET.includes(c));
}

/* Moderate on their own. Chest pain is handled by its own rule. */
const MODERATE_ON_THEIR_OWN = ["unbearable"];

/* The SOCRATES onset node in ontology/general.json, and its option values
   that mean the pain began under 24 hours ago. Exported so the tests can
   check they still exist in the ontology. */
export const ONSET_NODE = "chest_onset";
export const ONSET_UNDER_24H: readonly string[] = ["lt_1h", "lt_24h"];

const NONE: RedFlag = { level: "none", concept: null, reason: "" };

interface Evidence {
  /* concept -> the patient's words where it was first raised */
  words: Map<string, string>;
  /* the patient's words that place chest pain under 24 hours, if any */
  recentChestPain: string | null;
  /* the first answer where a cardiac-eligible recent_onset sits with another CARDIAC_SET member, if any */
  recentWithCardiac: string | null;
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
  let recentWithCardiac: string | null = null;

  for (const a of session.answers ?? []) {
    const said = String(a.raw || a.value || "");
    const clauses = textsOf(a).flatMap((t) => conceptsByClause(t));
    // Tap answers store option values. A value that is a concept key raises it.
    const values = String(a.value ?? "").split(",").map((v) => v.trim());
    const valueConcepts = values.filter((v) => Object.hasOwn(CONCEPTS, v));
    const inAnswer = new Set([...clauses.flat(), ...valueConcepts]);

    for (const c of inAnswer) {
      if (!words.has(c)) words.set(c, said);
    }

    if (recentWithCardiac === null &&
        clauses.some((cl) => cl.includes("recent_onset") && onsetMayBeCardiac(cl)) &&
        CARDIAC_SET.some((c) => c !== "recent_onset" && inAnswer.has(c))) {
      recentWithCardiac = said;
    }

    if (recentChestPain !== null) continue;
    // "आज सुबह से सीने में दर्द": chest pain and a recent onset in one clause.
    const sameClause = clauses.some((cl) => cl.includes("chest_pain") && cl.includes("recent_onset"));
    // The answer to the SOCRATES onset question.
    const onsetAnswer = a.nodeId === ONSET_NODE &&
      (values.some((v) => ONSET_UNDER_24H.includes(v)) || clauses.some((cl) => cl.includes("recent_onset")));
    if (sameClause || onsetAnswer) recentChestPain = said;
  }
  return { words, recentChestPain, recentWithCardiac };
}

/* Quotes one or more of the patient's answers, each once, clipped to 160 characters. */
function quote(...said: (string | undefined)[]): string {
  const parts = [...new Set(said.map((s) => String(s ?? "").trim()).filter(Boolean))];
  if (!parts.length) return "";
  return ` Patient's words: ${parts.map((s) => `"${s.length > 160 ? s.slice(0, 157) + "..." : s}"`).join(" and ")}`;
}

function label(concept: string): string {
  return CONCEPTS[concept]?.label.en ?? concept;
}

function fromRules(session: Session): RedFlag {
  const { words, recentChestPain, recentWithCardiac } = gather(session);

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
  }

  const cardiacWords = (c: string) => (c === "recent_onset" ? recentWithCardiac ?? undefined : words.get(c));
  const cardiac = CARDIAC_SET.filter((c) => cardiacWords(c) !== undefined);
  if (cardiac.length >= 2) {
    return { level: "high", concept: cardiac[0],
      reason: `Two or more cardiac signs together: ${cardiac.map((c) => label(c).toLowerCase()).join(", ")}.${quote(...cardiac.map(cardiacWords))}` };
  }

  if (words.has("chest_pain")) {
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
