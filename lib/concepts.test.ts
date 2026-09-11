import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONCEPTS, conceptsIn } from "./concepts.ts";
import { evaluate, ONSET_NODE, ONSET_UNDER_24H } from "./redflag.ts";
import type { Answer, HistoryNode, RedFlag, Session } from "./types.ts";

const TREE: HistoryNode[] = JSON.parse(
  readFileSync(new URL("../ontology/general.json", import.meta.url), "utf8"),
);

// A synthetic session holding the given answers.
function sessionWith(answers: Answer[]): Session {
  return {
    id: "test-session",
    name: "Test Patient",
    age: 50,
    gender: "other",
    lang: "hi",
    mode: "allopathic",
    answers,
    documents: [],
    redFlag: { level: "none", concept: null, reason: "" },
    status: "in_progress",
    createdAt: "2026-09-11T00:00:00.000Z",
  };
}

// A synthetic session whose only answer is the free-text chief complaint.
function sessionSaying(text: string): Session {
  return sessionWith([{ nodeId: "cc_open", raw: text, value: text, via: "voice" }]);
}

test('"साँस नहीं आ रही है" -> breathlessness, high', () => {
  const text = "साँस नहीं आ रही है";
  assert.ok(conceptsIn(text).includes("breathlessness"), `concepts: ${conceptsIn(text)}`);
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "breathlessness");
});

test('"खून नहीं रुक रहा" -> bleeding, high', () => {
  const text = "खून नहीं रुक रहा";
  assert.ok(conceptsIn(text).includes("bleeding"), `concepts: ${conceptsIn(text)}`);
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "bleeding");
});

test('"I can not breathe" -> breathlessness, high', () => {
  const text = "I can not breathe";
  assert.ok(conceptsIn(text).includes("breathlessness"), `concepts: ${conceptsIn(text)}`);
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "breathlessness");
});

test('"I don\'t have chest pain" -> chest_pain NOT raised', () => {
  const text = "I don't have chest pain";
  assert.ok(!conceptsIn(text).includes("chest_pain"), `concepts: ${conceptsIn(text)}`);
  assert.notEqual(evaluate(sessionSaying(text)).concept, "chest_pain");
});

test('"सीने में दर्द नहीं है, खांसी है" -> cough only', () => {
  assert.deepEqual(conceptsIn("सीने में दर्द नहीं है, खांसी है"), ["cough"]);
});

test('"दो साल पहले सीने में दर्द हुआ था" -> not high', () => {
  const flag = evaluate(sessionSaying("दो साल पहले सीने में दर्द हुआ था"));
  assert.notEqual(flag.level, "high");
});

// Positive controls. A stub that finds nothing passes the negative cases
// above, so these make sure the detector actually detects.

test('"मुझे साँस लेने में बहुत तकलीफ हो रही है" -> breathlessness raised', () => {
  const text = "मुझे साँस लेने में बहुत तकलीफ हो रही है";
  assert.ok(conceptsIn(text).includes("breathlessness"), `concepts: ${conceptsIn(text)}`);
});

test('"सीने में दर्द नहीं है, खांसी है" -> cough IS raised', () => {
  const text = "सीने में दर्द नहीं है, खांसी है";
  assert.ok(conceptsIn(text).includes("cough"), `concepts: ${conceptsIn(text)}`);
});

test('"bleeding a lot from my hand" -> bleeding, high', () => {
  const text = "bleeding a lot from my hand";
  assert.ok(conceptsIn(text).includes("bleeding"), `concepts: ${conceptsIn(text)}`);
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "bleeding");
});

// Probe phrases from the packet 1 review. Two of the three escalation cases
// above pass on old table entries with the negator built in ("सांस नहीं आ",
// "can not breathe"). None of these match such an entry, so the negation
// logic itself has to do the work.

const PROBES: { text: string; raises?: string[]; absent?: string[]; level: RedFlag["level"] }[] = [
  { text: "ठीक से साँस नहीं ले पा रही हूँ", raises: ["breathlessness"], level: "high" },
  { text: "पट्टी बाँधने के बाद भी खून बंद नहीं हो रहा", raises: ["bleeding"], level: "high" },
  { text: "साँस लेने में कोई परेशानी नहीं होती", absent: ["breathlessness"], level: "none" },
  { text: "बलगम में खून नहीं आता", absent: ["coughing_blood", "bleeding"], level: "none" },
  { text: "कल रात से छाती में जकड़न और बाएँ हाथ में दर्द है",
    raises: ["chest_pain", "recent_onset", "radiating_pain"], level: "high" },
  { text: "My husband is not able to breathe properly", raises: ["breathlessness"], level: "high" },
  { text: "The cut on his leg won't stop bleeding", raises: ["bleeding"], level: "high" },
  { text: "She can't catch her breath", raises: ["breathlessness"], level: "high" },
  { text: "I have never had any chest pressure", absent: ["chest_pain"], level: "none" },
  { text: "Since last night my chest feels heavy and I keep sweating",
    raises: ["chest_pain", "recent_onset", "sweating"], level: "high" },
];

for (const p of PROBES) {
  test(`probe: "${p.text}" -> ${p.raises ? p.raises.join(" + ") : "no " + p.absent!.join(", no ")}, ${p.level}`, () => {
    const found = conceptsIn(p.text);
    for (const c of p.raises ?? []) assert.ok(found.includes(c), `${c} not raised. concepts: ${found}`);
    for (const c of p.absent ?? []) assert.ok(!found.includes(c), `${c} raised. concepts: ${found}`);
    assert.equal(evaluate(sessionSaying(p.text)).level, p.level);
  });
}

// Cardiac rules.

test('"I think my father is having a heart attack" -> heart_attack, high on its own', () => {
  const flag = evaluate(sessionSaying("I think my father is having a heart attack"));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "heart_attack");
});

test("two cardiac signs are high even when the chest pain wording is not recognised", () => {
  // "feels strange" is deliberately not a chest_pain form. The rule must not
  // depend on the vocabulary covering it.
  const text = "Since last night my chest feels strange and I keep sweating";
  assert.ok(!conceptsIn(text).includes("chest_pain"), `concepts: ${conceptsIn(text)}`);
  assert.equal(evaluate(sessionSaying(text)).level, "high");
});

test("one cardiac sign alone is not high", () => {
  assert.notEqual(evaluate(sessionSaying("I have been sweating a lot")).level, "high");
});

test("recent_onset in a different answer from the other cardiac sign does not count", () => {
  const flag = evaluate(sessionWith([
    { nodeId: "cc_open", raw: "Fever since this morning", value: "Fever since this morning", via: "voice" },
    { nodeId: "da_meds_list", raw: "I am sweating a lot", value: "I am sweating a lot", via: "voice" },
  ]));
  assert.equal(flag.level, "none", flag.reason);
});

// An onset whose clause names a non-cardiac symptom belongs to that symptom.

for (const [text, level] of [
  ["Fever since this morning and I am sweating", "none"],
  ["बुखार कल रात से है और पसीना आ रहा है", "none"],
  ["दो साल पहले सीने में दर्द हुआ था, आज सुबह से बुखार है", "moderate"],
] as const) {
  test(`"${text}" -> ${level}, the onset belongs to the fever`, () => {
    const flag = evaluate(sessionSaying(text));
    assert.equal(flag.level, level, flag.reason);
  });
}

// recent_onset wording. Frequencies and long durations are not a recent onset.

for (const text of ["I get palpitations every few hours", "Loose motions for 48 hours", "हर कुछ घंटे में दर्द होता है",
                    "48 घंटे से दस्त", "every few minutes"]) {
  test(`"${text}" -> recent_onset NOT raised`, () => {
    assert.ok(!conceptsIn(text).includes("recent_onset"), `concepts: ${conceptsIn(text)}`);
  });
}

for (const text of ["started an hour ago", "since 3 hours", "since last night", "since yesterday",
                    "एक घंटे से", "3 घंटे से दर्द", "आज सुबह से", "कल रात से", "कल से"]) {
  test(`"${text}" -> recent_onset raised`, () => {
    assert.ok(conceptsIn(text).includes("recent_onset"), `concepts: ${conceptsIn(text)}`);
  });
}

for (const text of ["I can't finish a sentence", "I cannot complete a sentence"]) {
  test(`"${text}" -> cannot_speak, high`, () => {
    assert.ok(conceptsIn(text).includes("cannot_speak"), `concepts: ${conceptsIn(text)}`);
    assert.equal(evaluate(sessionSaying(text)).level, "high");
  });
}

// Drift between lib/redflag.ts and ontology/general.json. A renamed node or
// option value breaks the recent-onset rule without any error.

test("the onset node and its under-24-hour values exist in ontology/general.json", () => {
  const node = TREE.find((n) => n.id === ONSET_NODE);
  assert.ok(node, `${ONSET_NODE} is missing from ontology/general.json`);
  const values = (node.options ?? []).map((o) => o.value);
  for (const v of ONSET_UNDER_24H) {
    assert.ok(values.includes(v), `${v} is not an option value of ${ONSET_NODE}. Values: ${values}`);
  }
});

for (const v of ONSET_UNDER_24H) {
  test(`chest pain with onset tapped as ${v} -> high, from the stored value alone`, () => {
    // raw is empty so no words can raise recent_onset. Only the value can.
    const flag = evaluate(sessionWith([
      { nodeId: "cc_open", raw: "I have chest pain", value: "I have chest pain", via: "voice" },
      { nodeId: ONSET_NODE, raw: "", value: v, via: "tap" },
    ]));
    assert.equal(flag.level, "high");
    assert.equal(flag.concept, "chest_pain");
  });
}

test("chest pain with onset tapped as more than a week -> moderate", () => {
  const option = TREE.find((n) => n.id === ONSET_NODE)?.options?.find((o) => o.value === "gt_1w");
  assert.ok(option, "gt_1w is missing from the onset node");
  for (const lang of ["en", "hi"] as const) {
    const flag = evaluate(sessionWith([
      { nodeId: "cc_open", raw: "I have chest pain", value: "I have chest pain", via: "voice" },
      { nodeId: ONSET_NODE, raw: option.label[lang], value: option.value, via: "tap" },
    ]));
    assert.equal(flag.level, "moderate", `${lang}: ${flag.reason}`);
  }
});

test("every concept key named in ontology/general.json exists in CONCEPTS", () => {
  for (const n of TREE) {
    for (const c of n.concepts ?? []) assert.ok(Object.hasOwn(CONCEPTS, c), `${n.id} names unknown concept ${c}`);
  }
  for (const rule of TREE[0].next?.when ?? []) {
    for (const c of rule.answerIn) assert.ok(Object.hasOwn(CONCEPTS, c), `cc_open branches on unknown concept ${c}`);
  }
});

// The respiratory speech question. Only the "few words" option may raise cannot_speak.

for (const text of [
  "yes I can speak normally",
  "हां, मैं आराम से पूरा वाक्य बोल पा रहा हूं",
  "मुझे बोलने में कोई दिक्कत नहीं",
]) {
  test(`"${text}" to resp_speech -> cannot_speak NOT raised`, () => {
    assert.ok(!conceptsIn(text).includes("cannot_speak"), `concepts: ${conceptsIn(text)}`);
    const flag = evaluate(sessionWith([{ nodeId: "resp_speech", raw: text, value: text, via: "voice" }]));
    assert.equal(flag.level, "none", flag.reason);
  });
}

test("resp_speech tap options: only cannot_speak raises it", () => {
  const node = TREE.find((n) => n.id === "resp_speech");
  assert.ok(node, "resp_speech is missing from ontology/general.json");
  for (const o of node.options ?? []) {
    for (const lang of ["en", "hi"] as const) {
      const flag = evaluate(sessionWith([{ nodeId: node.id, raw: o.label[lang], value: o.value, via: "tap" }]));
      assert.equal(flag.concept === "cannot_speak", o.value === "cannot_speak", `${o.value} (${lang}): ${flag.reason}`);
    }
  }
});
