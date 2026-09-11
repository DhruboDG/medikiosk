export type Lang = "en" | "hi";
export type Mode = "allopathic" | "ayush";

export interface Localised { en: string; hi: string; }

export interface Option {
  id: string;
  label: Localised;
  icon?: string;        // emoji or lucide icon name
  value: string;        // canonical value stored
}

export type Section =
  | "chief_complaint" | "hpi" | "past_history" | "drug_allergy"
  | "family" | "personal" | "ros" | "ayush";

export interface HistoryNode {
  id: string;
  section: Section;
  prompt: Localised;
  answerType: "text" | "single" | "multi" | "number" | "duration";
  options?: Option[];
  next?: { default?: string; when?: { answerIn: string[]; goto: string }[] };
  fhir?: { resource: string; path: string };
  concepts?: string[];  // concept keys this answer can raise
  source: string;       // "PS 3.3 Module A" or "SOCRATES" — traceability
}

export interface Answer { nodeId: string; raw: string; value: string; via: "voice" | "tap" | "type"; }

export interface ExtractedDoc {
  id: string;
  kind: "prescription" | "lab_report" | "discharge_summary" | "unknown";
  date: string | null;
  diagnoses: string[];
  medications: { name: string; dose?: string; frequency?: string }[];
  labs: { name: string; value: string; unit?: string; refRange?: string; abnormal: boolean }[];
  rawText: string;
}

export interface RedFlag { level: "high" | "moderate" | "none"; concept: string | null; reason: string; }

export interface Summary {
  chiefComplaint: string; hpi: string; pastHistory: string;
  drugAllergy: string; family: string; personal: string;
  ros: string; priorInvestigations: string;
  ayush?: Record<string, string>;
}

export interface Session {
  id: string; name: string; age: number; gender: string;
  lang: Lang; mode: Mode;
  answers: Answer[]; documents: ExtractedDoc[];
  redFlag: RedFlag; summary?: Summary; fhirBundle?: unknown;
  status: "in_progress" | "pending_review" | "confirmed";
  createdAt: string;
}
