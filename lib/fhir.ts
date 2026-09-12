/* Assembles a FHIR R4 document Bundle from a session and its draft summary.
   This is an intake artifact, not a clinical record: every resource traces
   back to a patient self-report, and the Bundle exists so the physician view
   can show it and a future EHR handoff has a standard shape to receive.

   Every entry's fullUrl is a real urn:uuid, generated fresh per build, and
   every internal reference points at that same urn:uuid — a document Bundle
   has no base URL for a relative reference like "Patient/123" to resolve
   against, so those never link up. Resource.id stays a readable local id
   (composition-<session>, condition-cc-<session>, ...); only fullUrl and
   reference strings need to be real UUIDs. */

import { createHash, randomUUID } from "crypto";
import { findNode, loadTree } from "./ontology.ts";
import type { Session, Summary } from "./types.ts";

type Resource = Record<string, unknown> & { resourceType: string; id: string };
type Ref = { reference: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function narrative(text: string) {
  return { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(text)}</div>` };
}

function fhirGender(g: string): "male" | "female" | "other" | "unknown" {
  return g === "male" || g === "female" || g === "other" ? g : "unknown";
}

function answerFor(session: Session, nodeId: string) {
  return session.answers.find((a) => a.nodeId === nodeId);
}

/* A synthetic, clearly-mocked ABHA-shaped number, deterministic per session
   so it stays stable across rebuilds. This is here to make the ABDM path
   visible in the bundle shape, not a real health-id lookup — the system URL
   is marked "mock" for exactly that reason and this project sends only
   synthetic data (CLAUDE.md, "All patient data is synthetic"). */
function mockAbhaNumber(seed: string): string {
  const digits = createHash("sha256")
    .update(seed)
    .digest("hex")
    .split("")
    .map((c) => parseInt(c, 16) % 10)
    .join("")
    .slice(0, 14);
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

/**
 * @param finalize true once the physician has accepted the draft as-is;
 * false for every other state (drafted, amended, rejected). Drives
 * Composition.status ("final" vs "preliminary") only.
 */
export function buildFhirBundle(session: Session, summary: Summary, finalize = false): unknown {
  const tree = loadTree(session.mode);
  const patientId = `patient-${session.id}`;
  const encounterId = `encounter-${session.id}`;

  // Maps each resource's local id to the real UUID used in its fullUrl, so
  // every reference to that id can point at the same urn:uuid.
  const uuids = new Map<string, string>();
  function uuidFor(localId: string): string {
    let uuid = uuids.get(localId);
    if (!uuid) {
      uuid = randomUUID();
      uuids.set(localId, uuid);
    }
    return uuid;
  }
  function ref(localId: string): Ref {
    return { reference: `urn:uuid:${uuidFor(localId)}` };
  }

  const patient: Resource = {
    resourceType: "Patient",
    id: patientId,
    identifier: [
      {
        system: "https://medikiosk.local/mock/abdm/abha-number",
        value: mockAbhaNumber(session.id),
      },
    ],
    name: [{ text: session.name || "Unknown" }],
    gender: fhirGender(session.gender),
    extension: [
      {
        url: "https://medikiosk.local/fhir/StructureDefinition/reported-age",
        valueInteger: session.age,
      },
    ],
  };

  const encounter: Resource = {
    resourceType: "Encounter",
    id: encounterId,
    status: session.status === "confirmed" ? "finished" : "planned",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    subject: ref(patientId),
    period: { start: session.createdAt },
  };

  const conditions: Resource[] = [];
  const cc = answerFor(session, "cc_open");
  if (cc && (cc.raw || cc.value)) {
    conditions.push({
      resourceType: "Condition",
      id: `condition-cc-${session.id}`,
      subject: ref(patientId),
      encounter: ref(encounterId),
      category: [{ text: "Chief complaint" }],
      code: { text: cc.raw || cc.value },
    });
  }

  const phConditions = answerFor(session, "ph_conditions");
  if (phConditions?.value) {
    const node = findNode(tree, "ph_conditions");
    const values = phConditions.value.split(",").map((v) => v.trim()).filter((v) => v && v !== "none");
    values.forEach((value, i) => {
      const label = node?.options?.find((o) => o.value === value)?.label.en ?? value;
      conditions.push({
        resourceType: "Condition",
        id: `condition-ph-${session.id}-${i}`,
        subject: ref(patientId),
        category: [{ text: "Past medical history" }],
        code: { text: label },
      });
    });
  }

  const medications: Resource[] = [];
  const medsList = answerFor(session, "da_meds_list");
  if (medsList && (medsList.raw || medsList.value)) {
    const names = (medsList.raw || medsList.value).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    names.forEach((name, i) => {
      medications.push({
        resourceType: "MedicationStatement",
        id: `medication-${session.id}-${i}`,
        status: "unknown",
        subject: ref(patientId),
        medicationCodeableConcept: { text: name },
      });
    });
  }

  const allergies: Resource[] = [];
  const allergyAns = answerFor(session, "da_allergy");
  if (allergyAns?.value && allergyAns.value !== "none" && allergyAns.value !== "unsure") {
    // The tap answer only says an allergy category was picked ("Yes, to a
    // medicine"); the allergen itself, if the patient named one, is in the
    // free-text follow-up. code.text should carry the allergen, not the
    // category label, so it never reads as if "Yes, to a medicine" were the
    // allergen.
    const detail = answerFor(session, "da_allergy_detail");
    const reactionText = detail?.raw || detail?.value;
    allergies.push({
      resourceType: "AllergyIntolerance",
      id: `allergy-${session.id}`,
      patient: ref(patientId),
      code: { text: reactionText || "Allergy reported, allergen not specified" },
      ...(reactionText ? { reaction: [{ description: reactionText }] } : {}),
    });
  }

  const observations: Resource[] = [];
  session.documents.forEach((doc, di) => {
    doc.labs.forEach((lab, li) => {
      observations.push({
        resourceType: "Observation",
        id: `observation-${session.id}-${di}-${li}`,
        status: "final",
        subject: ref(patientId),
        code: { text: lab.name },
        valueString: lab.unit ? `${lab.value} ${lab.unit}` : lab.value,
        ...(lab.refRange ? { referenceRange: [{ text: lab.refRange }] } : {}),
        ...(lab.abnormal ? { interpretation: [{ text: "Abnormal" }] } : {}),
      });
    });
  });

  const documentRefs: Resource[] = session.documents.map((doc, i) => ({
    resourceType: "DocumentReference",
    id: `docref-${session.id}-${i}`,
    status: "current",
    subject: ref(patientId),
    type: { text: doc.kind },
    ...(doc.date ? { date: doc.date } : {}),
    content: [{ attachment: { title: doc.kind } }],
    ...(doc.rawText ? { description: doc.rawText } : {}),
  }));

  const compositionId = `composition-${session.id}`;
  const sections = [
    { title: "Chief Complaint", text: summary.chiefComplaint, entry: cc ? [ref(`condition-cc-${session.id}`)] : [] },
    { title: "History of Present Illness", text: summary.hpi, entry: [] },
    {
      title: "Past Medical and Surgical History",
      text: summary.pastHistory,
      entry: conditions.filter((c) => String(c.id).startsWith("condition-ph-")).map((c) => ref(c.id)),
    },
    {
      title: "Drug and Allergy History",
      text: summary.drugAllergy,
      entry: [...medications, ...allergies].map((r) => ref(r.id)),
    },
    { title: "Family History", text: summary.family, entry: [] },
    { title: "Personal History", text: summary.personal, entry: [] },
    { title: "Review of Systems", text: summary.ros, entry: [] },
    {
      title: "Prior Investigations",
      text: summary.priorInvestigations,
      entry: observations.map((o) => ref(o.id)),
    },
  ];

  const composition: Resource = {
    resourceType: "Composition",
    id: compositionId,
    status: finalize ? "final" : "preliminary",
    type: { text: "Pre-consultation intake summary" },
    title: "Pre-Consultation Patient History",
    subject: ref(patientId),
    encounter: ref(encounterId),
    date: session.createdAt,
    author: [{ display: "MediKiosk intake (patient self-report, not clinically validated)" }],
    section: sections.map((s) => ({
      title: s.title,
      text: narrative(s.text),
      ...(s.entry.length ? { entry: s.entry } : {}),
    })),
  };

  const resources: Resource[] = [
    composition, patient, encounter,
    ...conditions, ...medications, ...allergies, ...observations, ...documentRefs,
  ];

  return {
    resourceType: "Bundle",
    id: `bundle-${session.id}`,
    identifier: {
      system: "https://medikiosk.local/fhir/bundle",
      value: session.id,
    },
    type: "document",
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({ fullUrl: `urn:uuid:${uuidFor(r.id)}`, resource: r })),
  };
}
