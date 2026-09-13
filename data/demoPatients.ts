/* The six synthetic demo patients for the physician queue. All patient data
   here is invented (CLAUDE.md: "All patient data is synthetic") and is built
   through the same pipeline a real session goes through: answers walk the
   real ontology tree, lib/redflag.ts scores them, lib/summary.ts drafts the
   summary (Gemini when reachable, template otherwise) and lib/fhir.ts builds
   the bundle. Nothing here hand-writes a summary or a red-flag level.

   Shared by data/seed.ts (the "seed" npm script) and
   app/api/demo/seed/route.ts (the physician page's "Load demo queue" button,
   for recovering the queue if the venue database is lost). */

import { randomUUID } from "crypto";
import { nextToken, saveSession } from "../lib/db.ts";
import { findNode, loadTree, tapAnswer } from "../lib/ontology.ts";
import { evaluate, isEmergency } from "../lib/redflag.ts";
import { generateSummary } from "../lib/summary.ts";
import { buildFhirBundle } from "../lib/fhir.ts";
import type { Answer, Lang, Mode, Session } from "../lib/types.ts";

interface Step {
  nodeId: string;
  /** Option ids for a single/multi tap answer, built via lib/ontology.ts tapAnswer(). */
  options?: string[];
  /** Free-text value for a text-answer node. */
  text?: string;
  via?: Answer["via"];
}

interface PatientSpec {
  name: string;
  age: number;
  gender: string;
  lang: Lang;
  mode: Mode;
  /** How long ago this session was created, so the queue's arrival-time tie-break is realistic. */
  minutesAgo: number;
  steps: Step[];
}

function tap(nodeId: string, options: string[]): Step {
  return { nodeId, options };
}

function said(nodeId: string, text: string, via: Answer["via"] = "voice"): Step {
  return { nodeId, text, via };
}

function buildAnswers(mode: Mode, lang: Lang, steps: Step[]): Answer[] {
  const tree = loadTree(mode);
  return steps.map((step) => {
    if (step.options) {
      const node = findNode(tree, step.nodeId);
      if (!node) throw new Error(`Unknown ontology node for ${mode}: ${step.nodeId}`);
      return tapAnswer(node, step.options, lang);
    }
    const value = step.text ?? "";
    return { nodeId: step.nodeId, raw: value, value, via: step.via ?? "voice" };
  });
}

/* 1. The demo's lead case: chest pain in Hindi, onset under an hour, sweating
   and breathlessness. Walks the full SOCRATES chest branch. */
const CHEST_PAIN_HI: PatientSpec = {
  name: "रामलाल शर्मा",
  age: 62,
  gender: "male",
  lang: "hi",
  mode: "allopathic",
  minutesAgo: 60,
  steps: [
    said("cc_open", "सीने में दर्द है, आधे घंटे से पसीना आ रहा है और सांस फूल रही है"),
    tap("chest_site", ["centre"]),
    tap("chest_onset", ["lt_1h"]),
    tap("chest_character", ["pressing"]),
    tap("chest_radiation", ["left_arm"]),
    tap("chest_associated", ["sweating", "breathlessness"]),
    tap("chest_timing", ["constant"]),
    tap("chest_factors", ["effort"]),
    tap("chest_severity", ["severe"]),
    tap("ph_conditions", ["hypertension"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["few"]),
    said("da_meds_list", "एम्लोडिपिन 5mg"),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["heart_disease"]),
    tap("fh_similar", ["yes"]),
    tap("pers_tobacco", ["smoke"]),
    tap("pers_alcohol", ["never"]),
    tap("pers_diet", ["veg"]),
    tap("pers_sleep", ["hard_to_fall"]),
    tap("ros_general", ["tiredness"]),
    tap("ros_systems", ["none"]),
  ],
};

/* 2. AYUSH mode, all eleven Pariksha groups answered: Prakriti (three
   questions), Vikriti, Sara (two), Samhanana, Pramana, Satmya, Sattva, Ahara
   Shakti, Vyayama Shakti, Vaya, and Ahara-Vihara (diet, routine, tobacco,
   alcohol). Routine case, level none. */
const AYUSH_PATIENT: PatientSpec = {
  name: "Sunita Devi",
  age: 45,
  gender: "female",
  lang: "en",
  mode: "ayush",
  minutesAgo: 50,
  steps: [
    said("cc_open", "I have had joint stiffness and low energy for the past month."),
    tap("ayush_prakriti_build", ["medium"]),
    tap("ayush_prakriti_temp", ["heat_averse"]),
    tap("ayush_prakriti_sleep", ["moderate"]),
    tap("ayush_vikriti", ["more_heavy_sluggish"]),
    tap("ayush_sara_appearance", ["soft_sensitive"]),
    tap("ayush_sara_vitality", ["moderate"]),
    tap("ayush_samhanana", ["moderate"]),
    tap("ayush_pramana", ["balanced"]),
    tap("ayush_satmya", ["warm_food"]),
    tap("ayush_sattva", ["irritated_recovers"]),
    tap("ayush_ahara_shakti", ["moderate_regular"]),
    tap("ayush_vyayama_shakti", ["moderate"]),
    tap("ayush_vaya", ["middle_age"]),
    tap("ayush_ahara_vihara_diet", ["regular"]),
    tap("ayush_ahara_vihara_routine", ["sedentary"]),
    tap("ayush_ahara_vihara_tobacco", ["never"]),
    tap("ayush_ahara_vihara_alcohol", ["never"]),
    tap("ph_conditions", ["none"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["none"]),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["none"]),
    tap("fh_similar", ["no"]),
    tap("ros_general", ["tiredness"]),
    tap("ros_systems", ["joint_pain"]),
  ],
};

/* 3. Hit the emergency path: a severe burn, one of lib/redflag.ts's
   EMERGENCY_CONCEPTS. The full history is still recorded (isEmergency()
   scans every answer regardless of which node it lives on), matching how a
   real session would have most of its answers on file before the emergency
   check redirects the patient. */
const EMERGENCY_PATIENT: PatientSpec = {
  name: "मोहन कुमार",
  age: 34,
  gender: "male",
  lang: "hi",
  mode: "allopathic",
  minutesAgo: 40,
  steps: [
    said("cc_open", "हाथ पर उबलता पानी गिर गया, गहरी जलन हो गई है"),
    tap("gen_duration", ["lt_1w"]),
    tap("gen_trend", ["worse"]),
    tap("gen_severity", ["moderate"]),
    tap("ph_conditions", ["none"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["none"]),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["none"]),
    tap("fh_similar", ["no"]),
    tap("pers_tobacco", ["never"]),
    tap("pers_alcohol", ["never"]),
    tap("pers_diet", ["nonveg"]),
    tap("pers_sleep", ["good"]),
    tap("ros_general", ["none"]),
    tap("ros_systems", ["none"]),
  ],
};

/* 4. Moderate: chest pain with an onset over a week old and no second
   cardiac sign, which is exactly lib/redflag.ts's "moderate" chest-pain rule. */
const MODERATE_PATIENT: PatientSpec = {
  name: "Arvind Nair",
  age: 50,
  gender: "male",
  lang: "en",
  mode: "allopathic",
  minutesAgo: 30,
  steps: [
    said("cc_open", "I have had a chest ache on and off for about two weeks."),
    tap("chest_site", ["left"]),
    tap("chest_onset", ["gt_1w"]),
    tap("chest_character", ["dull"]),
    tap("chest_radiation", ["none"]),
    tap("chest_associated", ["none"]),
    tap("chest_timing", ["comes_goes"]),
    tap("chest_factors", ["nothing"]),
    tap("chest_severity", ["moderate"]),
    tap("ph_conditions", ["hypertension"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["few"]),
    said("da_meds_list", "Metformin 500mg"),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["diabetes"]),
    tap("fh_similar", ["no"]),
    tap("pers_tobacco", ["quit"]),
    tap("pers_alcohol", ["sometimes"]),
    tap("pers_diet", ["nonveg"]),
    tap("pers_sleep", ["good"]),
    tap("ros_general", ["none"]),
    tap("ros_systems", ["none"]),
  ],
};

/* 5. Ordinary, level none, Hindi: a plain fever complaint. */
const ORDINARY_HI: PatientSpec = {
  name: "गीता देवी",
  age: 29,
  gender: "female",
  lang: "hi",
  mode: "allopathic",
  minutesAgo: 20,
  steps: [
    said("cc_open", "तीन दिन से बुखार है, सिरदर्द भी है"),
    tap("fever_duration", ["3_7d"]),
    tap("fever_pattern", ["evening"]),
    tap("fever_associated", ["headache"]),
    tap("ph_conditions", ["none"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["none"]),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["none"]),
    tap("fh_similar", ["no"]),
    tap("pers_tobacco", ["never"]),
    tap("pers_alcohol", ["never"]),
    tap("pers_diet", ["veg"]),
    tap("pers_sleep", ["good"]),
    tap("ros_general", ["none"]),
    tap("ros_systems", ["none"]),
  ],
};

/* 6. Ordinary, level none, English: a plain, slowly-improving joint pain. */
const ORDINARY_EN: PatientSpec = {
  name: "Rahul Verma",
  age: 33,
  gender: "male",
  lang: "en",
  mode: "allopathic",
  minutesAgo: 10,
  steps: [
    said("cc_open", "I've had mild pain in my right knee for about a month, it's slowly getting better."),
    tap("gen_duration", ["1_4w"]),
    tap("gen_trend", ["better"]),
    tap("gen_severity", ["mild"]),
    tap("ph_conditions", ["none"]),
    tap("ph_surgery", ["no"]),
    tap("ph_admission", ["no"]),
    tap("da_meds", ["none"]),
    tap("da_allergy", ["none"]),
    tap("fh_conditions", ["none"]),
    tap("fh_similar", ["no"]),
    tap("pers_tobacco", ["never"]),
    tap("pers_alcohol", ["sometimes"]),
    tap("pers_diet", ["nonveg"]),
    tap("pers_sleep", ["good"]),
    tap("ros_general", ["none"]),
    tap("ros_systems", ["none"]),
  ],
};

/* Insertion order gives tokens 1 to 6 in this order. Display order in the
   physician queue is a separate property of GET /api/queue (priority, then
   arrival time) and is not this order. */
export const DEMO_PATIENTS: PatientSpec[] = [
  CHEST_PAIN_HI, AYUSH_PATIENT, EMERGENCY_PATIENT, MODERATE_PATIENT, ORDINARY_HI, ORDINARY_EN,
];

export async function seedDemoQueue(): Promise<Session[]> {
  const created: Session[] = [];

  for (const spec of DEMO_PATIENTS) {
    const answers = buildAnswers(spec.mode, spec.lang, spec.steps);
    const createdAt = new Date(Date.now() - spec.minutesAgo * 60_000).toISOString();

    const session: Session = {
      id: randomUUID(),
      name: spec.name,
      age: spec.age,
      gender: spec.gender,
      lang: spec.lang,
      mode: spec.mode,
      answers,
      documents: [],
      redFlag: { level: "none", concept: null, reason: "" },
      status: "in_progress",
      createdAt,
      token: nextToken(),
    };

    // Same order of operations as the real answer and summary routes: the
    // rule-based layer scores every answer on file, an emergency concept
    // moves the session to review, then the real summary and FHIR pipeline
    // runs (Gemini when reachable, template fallback otherwise).
    session.redFlag = evaluate(session);
    if (isEmergency(session)) session.status = "pending_review";

    session.summary = await generateSummary(session);
    session.fhirBundle = buildFhirBundle(session, session.summary);
    session.status = "pending_review";

    saveSession(session);
    created.push(session);
  }

  return created;
}
