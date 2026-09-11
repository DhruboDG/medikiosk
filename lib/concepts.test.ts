import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONCEPTS, conceptsIn } from "./concepts.ts";
import { EMERGENCY_CONCEPTS, evaluate, isEmergency, ONSET_NODE, ONSET_UNDER_24H } from "./redflag.ts";
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

// isEmergency: the redirect to app/emergency/page.tsx fires only for the six
// named concepts, never for chest_pain, breathlessness alone or the two-sign
// cardiac rule, since those over-triage by design and must not stop the
// questionnaire.

const EMERGENCY_PHRASES: Record<string, string> = {
  unconscious: "he fainted and is not responding",
  stroke: "she has face drooping since this morning",
  choking: "something stuck in throat",
  severe_burn: "she has a severe burn on her arm",
  coughing_blood: "coughing blood since this morning",
  bleeding: "heavy bleeding from the wound",
};

test("EMERGENCY_CONCEPTS names exactly the six concepts in the brief", () => {
  assert.deepEqual(
    [...EMERGENCY_CONCEPTS].sort(),
    ["bleeding", "choking", "coughing_blood", "severe_burn", "stroke", "unconscious"].sort(),
  );
});

for (const concept of EMERGENCY_CONCEPTS) {
  const text = EMERGENCY_PHRASES[concept];
  test(`isEmergency: "${text}" (${concept}) -> true`, () => {
    assert.ok(conceptsIn(text).includes(concept), `concepts: ${conceptsIn(text)}`);
    assert.equal(isEmergency(sessionSaying(text)), true);
  });
}

test("isEmergency: chest pain alone -> false", () => {
  assert.equal(isEmergency(sessionSaying("I have chest pain")), false);
});

test("isEmergency: breathlessness alone -> false", () => {
  assert.equal(isEmergency(sessionSaying("I can not breathe")), false);
});

test("isEmergency: the two-sign cardiac rule alone -> false", () => {
  const text = "Since last night my chest feels strange and I keep sweating";
  assert.equal(evaluate(sessionSaying(text)).level, "high", "sanity: this is still a high red flag");
  assert.equal(isEmergency(sessionSaying(text)), false);
});

test("isEmergency: true alongside an unrelated high sign, e.g. bleeding and chest pain", () => {
  const session = sessionSaying("heavy bleeding and I also have chest pain");
  assert.equal(isEmergency(session), true);
});

// Chest reason preference: chest pain with a cardiac companion must be
// reported as the chest_pain rule, not as whichever HIGH_ON_THEIR_OWN concept
// (e.g. breathlessness) also happens to be present in the same answer.

test('chest pain + sweating + breathlessness -> chest_pain reason, not "Breathlessness is a high-priority sign on its own"', () => {
  const text = "I have chest pain, I am sweating and I can not breathe";
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "chest_pain");
  assert.ok(flag.reason.startsWith("Chest pain together with sweating"), flag.reason);
  assert.ok(!flag.reason.startsWith("Breathlessness"), flag.reason);
});

test("chest pain with a recent onset still wins over a HIGH_ON_THEIR_OWN concept in the same answer", () => {
  const text = "since this morning I have chest pain and I can not breathe";
  const flag = evaluate(sessionSaying(text));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "chest_pain");
  assert.ok(flag.reason.startsWith("Chest pain that began less than 24 hours ago"), flag.reason);
});

test("breathlessness alone (no chest pain) still reports its own HIGH_ON_THEIR_OWN reason", () => {
  const flag = evaluate(sessionSaying("I can not breathe"));
  assert.equal(flag.level, "high");
  assert.equal(flag.concept, "breathlessness");
  assert.ok(flag.reason.startsWith("Breathlessness is a high-priority sign on its own"), flag.reason);
});

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

// Bleeding: every English bleeding form used to require a severity or
// quantity word ("heavy", "a lot", "lot of"), so a bare mention of bleeding
// raised nothing. "सर से खून बह रहा है" already worked because Hindi had an
// unqualified form (खून बह); English had none.

for (const text of [
  "bleeding from forehead",
  "severe bleeding from forehead",
  "bleeding a lot from my hand",
  "my head is bleeding",
  "blood coming from my head",
  "cut on my head is bleeding",
]) {
  test(`bleeding fix: "${text}" -> bleeding, high, isEmergency`, () => {
    const found = conceptsIn(text);
    assert.ok(found.includes("bleeding"), `concepts: ${found}`);
    const flag = evaluate(sessionSaying(text));
    assert.equal(flag.level, "high");
    assert.equal(flag.concept, "bleeding");
    assert.equal(isEmergency(sessionSaying(text)), true);
  });
}

// A severity word (severe, unbearable, असहनीय, बहुत तेज़) must never stand
// alone in the concept set when the phrase also names a symptom whose own
// form matches independently. When it does, the reason text looks like the
// system understood the complaint ("Unbearable reported") while the actual
// symptom -- here bleeding -- went unreported.
//
// "terrible", "very bad" and "बहुत ज़्यादा" were checked too: none of them
// are recognised forms today, so they cannot exhibit this bug, and they were
// deliberately not added as bare forms -- "very bad"/"terrible" are too
// generic (a very bad cough, a terrible day) to safely trigger a priority
// concept on their own.

const SEVERITY_WITH_SYMPTOM: { text: string; severity: string; symptom: string }[] = [
  { text: "severe bleeding from forehead", severity: "unbearable", symptom: "bleeding" },
  { text: "unbearable pain in my chest", severity: "unbearable", symptom: "chest_pain" },
  { text: "पेट में असहनीय दर्द है", severity: "unbearable", symptom: "abdominal_pain" },
  { text: "बहुत तेज बुखार है", severity: "unbearable", symptom: "fever" },
];

for (const { text, severity, symptom } of SEVERITY_WITH_SYMPTOM) {
  test(`severity word does not stand alone: "${text}"`, () => {
    const found = conceptsIn(text);
    assert.ok(found.includes(severity), `expected ${severity} in concepts: ${found}`);
    assert.ok(found.includes(symptom), `${severity} matched but ${symptom} (the actual complaint) did not: ${found}`);
  });
}

// Emergency-path audit: isEmergency() gates the redirect to
// app/emergency/page.tsx for the six EMERGENCY_CONCEPTS. An audit found most
// of them recognised only clinical-sounding English ("face drooping",
// "slurred speech") or a narrower Hindi verb form than lay speakers use
// (गिर पड़ vs गिर पड़ा/पड़ी/पड़े, खून बह vs खून रिस), so a real emergency
// described in plain words reached the questionnaire instead of the
// emergency screen. Every phrase below is lay wording a patient or relative
// would actually use, in both languages, and must reach isEmergency() = true.

const EMERGENCY_AUDIT: { concept: string; en: string[]; hi: string[] }[] = [
  {
    concept: "unconscious",
    en: [
      "he just collapsed and won't wake up",
      "she suddenly fainted",
      "he is not responding to me",
      "my dad passed out on the floor",
      "he blacked out for a minute",
      "she won't wake up",
    ],
    hi: [
      "वह अचानक गिर गया और होश में नहीं आ रहा",
      "वह अचानक बेहोश हो गई",
      "वह मुझे जवाब नहीं दे रहा",
      "मेरे पापा फर्श पर गिर पड़े",
      "वह एक मिनट के लिए बेहोश हो गया था",
      "वह जाग नहीं रहा",
    ],
  },
  {
    concept: "stroke",
    en: [
      "his face is drooping on one side",
      "her speech suddenly became slurred",
      "his arm suddenly went weak on one side",
      "her mouth is crooked to one side",
      "he can't move one side of his body",
      "she suddenly couldn't talk properly",
    ],
    hi: [
      "उसका मुँह एक तरफ लटक गया है",
      "उसकी जबान लड़खड़ा रही है",
      "उसका एक हाथ अचानक सुन्न हो गया",
      "उसका मुंह एक तरफ टेढ़ा हो गया है",
      "उसके शरीर के एक तरफ ताकत नहीं है",
      "उसे लकवा मार गया है",
    ],
  },
  {
    concept: "choking",
    en: [
      "something is stuck in his throat",
      "she is choking on food",
      "he can't breathe, something is stuck in his throat",
      "food got stuck in her throat and she can't talk",
      "he is gagging and can't breathe",
      "he choked on a piece of food and can't breathe",
    ],
    hi: [
      "उसके गले में कुछ फंस गया है",
      "वह खाना खाते समय गला घुट गया",
      "उसका दम घुट रहा है, कुछ फंसा है",
      "खाना उसके गले में अटक गया और वह बोल नहीं पा रही",
      "उसके गले में निवाला अटक गया है",
      "उसके गले में हड्डी अटक गई है",
    ],
  },
  {
    concept: "severe_burn",
    en: [
      "he got badly burned by hot oil",
      "her hand is burnt from the stove",
      "he spilled boiling water on his leg",
      "she has a bad burn on her arm",
      "his skin is burnt and blistered",
      "she got scalded by hot water",
    ],
    hi: [
      "वह गरम तेल से बुरी तरह जल गया",
      "उसका हाथ चूल्हे से जल गया है",
      "उसके पैर पर उबलता पानी गिर गया",
      "उसकी बांह पर गहरी जलन है",
      "उसकी त्वचा जल गई है और छाले पड़ गए हैं",
      "वह गरम पानी से झुलस गई",
    ],
  },
  {
    concept: "coughing_blood",
    en: [
      "he coughed up blood this morning",
      "she is coughing up blood",
      "there was blood in his cough",
      "he is spitting blood after coughing",
      "I saw blood in my cough today",
      "he has been coughing blood since last night",
    ],
    hi: [
      "उसे आज सुबह खांसी में खून आया",
      "खांसते समय उसमें से खून निकल रहा है",
      "खांसने के बाद वह खून थूक रहा है",
      "खांसते समय खून निकला",
      "उसे खांसी में खून दिखा",
      "उसे कल रात से खांसी में खून आ रहा है",
    ],
  },
  {
    concept: "bleeding",
    en: [
      "bleeding from forehead",
      "severe bleeding from forehead",
      "bleeding a lot from my hand",
      "my head is bleeding",
      "blood coming from my head",
      "cut on my head is bleeding",
    ],
    hi: [
      "उसके सर से खून बह रहा है",
      "उसका हाथ कटने से बहुत खून बह रहा है",
      "चोट से खून निकल रहा है",
      "उसे बहुत ज़्यादा खून बह रहा है",
      "पैर से खून रिस रहा है",
      "घाव से खून नहीं रुक रहा",
    ],
  },
];

for (const { concept, en, hi } of EMERGENCY_AUDIT) {
  for (const [lang, phrases] of [["en", en], ["hi", hi]] as const) {
    for (const text of phrases) {
      test(`emergency audit [${concept}/${lang}]: "${text}" -> isEmergency`, () => {
        assert.equal(isEmergency(sessionSaying(text)), true, `concepts: ${conceptsIn(text)}`);
      });
    }
  }
}
