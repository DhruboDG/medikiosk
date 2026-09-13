/* Builds the physician-facing draft summary. Gemini drafts prose from the
   patient's own answers when it is reachable; otherwise (no key, timeout,
   bad response, unparsable JSON) template assembly from the raw answers
   takes over so the physician screen is never empty. */

import { callGemini } from "./model.ts";
import { findNode, loadTree } from "./ontology.ts";
import type { Answer, Section, Session, Summary } from "./types.ts";

/* No ontology node asks about prior investigations and the document module
   (packet 6) does not extract anything yet, so session.documents carries no
   usable content. Rather than let the model guess or leave the field blank
   in a way that could be mistaken for a bug, this string is set by code in
   every path, model or template, and is never part of what Gemini is asked
   to produce. */
const NO_INVESTIGATIONS =
  "No prior investigation questions were asked and no documents were captured in this session.";

const SECTIONS: { section: Section; title: string }[] = [
  { section: "chief_complaint", title: "Chief complaint" },
  { section: "hpi", title: "History of present illness" },
  { section: "past_history", title: "Past medical and surgical history" },
  { section: "drug_allergy", title: "Drug and allergy history" },
  { section: "family", title: "Family history" },
  { section: "personal", title: "Personal history" },
  { section: "ros", title: "Review of systems" },
];

const MODEL_FIELDS = [
  "chiefComplaint", "hpi", "pastHistory", "drugAllergy", "family", "personal", "ros",
] as const;

function sectionLines(session: Session): Partial<Record<Section, string[]>> {
  const tree = loadTree(session.mode);
  const bySection: Partial<Record<Section, string[]>> = {};

  for (const answer of session.answers) {
    const node = findNode(tree, answer.nodeId);
    if (!node) continue;
    const said = (answer.raw || answer.value || "").trim();
    if (!said) continue;
    const list = bySection[node.section] ?? (bySection[node.section] = []);
    list.push(`${node.prompt.en} -> ${said}`);
  }

  return bySection;
}

function templateField(lines: string[] | undefined): string {
  if (!lines || lines.length === 0) return "Not reported.";
  return lines.join(". ") + ".";
}

function templateSummary(session: Session): Summary {
  const bySection = sectionLines(session);
  return {
    chiefComplaint: templateField(bySection.chief_complaint),
    hpi: templateField(bySection.hpi),
    pastHistory: templateField(bySection.past_history),
    drugAllergy: templateField(bySection.drug_allergy),
    family: templateField(bySection.family),
    personal: templateField(bySection.personal),
    ros: templateField(bySection.ros),
    priorInvestigations: NO_INVESTIGATIONS,
  };
}

function buildPrompt(session: Session): string {
  const bySection = sectionLines(session);
  const transcript = SECTIONS.map(({ section, title }) => {
    const lines = bySection[section];
    return `${title}:\n${lines && lines.length ? lines.join("\n") : "(nothing reported)"}`;
  }).join("\n\n");

  return `You are drafting a pre-consultation history summary for a physician, from a patient's own self-reported answers recorded at an intake kiosk. Write in plain clinical English, third person, one short paragraph per section. Use only what is in the answers below. Do not add a finding, diagnosis or medicine that is not present in them. Do not guess at anything not stated.

Patient: ${session.age} year old ${session.gender || "unspecified gender"}.

${transcript}

Return ONLY a JSON object, no markdown code fences, no commentary, with exactly these string keys: ${MODEL_FIELDS.join(", ")}. Each value is the drafted paragraph for that section, or "Not reported." if the transcript above has nothing for it.`;
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseModelSummary(text: string): Record<(typeof MODEL_FIELDS)[number], string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const result = {} as Record<(typeof MODEL_FIELDS)[number], string>;
  for (const key of MODEL_FIELDS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value.trim()) return null;
    result[key] = value.trim();
  }
  return result;
}

/** The Summary shape, in the exact problem-statement order the type declares it. */
export async function generateSummary(session: Session): Promise<Summary> {
  const template = templateSummary(session);
  if (session.answers.length === 0) return template;

  const raw = await callGemini(buildPrompt(session));
  if (!raw) {
    console.warn(`[summary] Model unreachable for session ${session.id}; falling back to template.`);
    return template;
  }

  const parsed = parseModelSummary(raw);
  if (!parsed) {
    console.warn(`[summary] Model response unusable for session ${session.id}; falling back to template.`);
    return template;
  }

  return { ...parsed, priorInvestigations: NO_INVESTIGATIONS };
}

/* Exported for the physician detail page, which shows the reason a red flag
   fired next to the words that raised it — this reuses the same lookup so
   free-text answers read the same way there as they do in the summary. */
export function answerFor(session: Session, nodeId: string): Answer | undefined {
  return session.answers.find((a) => a.nodeId === nodeId);
}
