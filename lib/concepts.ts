/* Concept detection over patient speech and text, in English, Hindi
   (Devanagari) and romanised Hindi.

   Ported from the earlier prototype (docs/legacy-concepts.js) with two
   corrections:
   (a) Negation has two behaviours. Denial of a symptom ("सीने में दर्द नहीं
       है", "I don't have chest pain") suppresses the concept. Negated
       inability ("साँस नहीं आ रही", "खून नहीं रुक रहा", "I cannot breathe")
       raises it. The prototype deleted both.
   (b) "है" is not an affirmative token. It ends almost every Hindi sentence.

   When the rules are unsure whether a concept was denied, they leave it
   raised. A wrong escalation costs a few minutes of a physician's time. A
   wrong suppression leaves a sick patient in the queue. */

import type { Localised } from "./types.ts";

export interface Concept {
  label: Localised;
  forms: string[];
}

/* Devanagari needs its own normalisation. Chandrabindu and anusvara are
   used interchangeably by speakers and recognisers (साँस vs सांस), and
   nukta is inconsistently applied, so both are folded away. Combining marks
   (\p{M}) must survive the character filter, or every Devanagari vowel sign
   is deleted. Apostrophes are dropped so "don't" becomes "dont". */
export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‌‍]/g, "")        // zero-width joiners
    .replace(/ँ/g, "ं")          // chandrabindu -> anusvara
    .replace(/़/g, "")                // nukta
    .replace(/['‘’ʼ`]/g, "") // apostrophes
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Hour counts that still mean onset within the last day ("since 3 hours", "3 घंटे से"). */
const UNDER_24 = Array.from({ length: 23 }, (_, i) => i + 1);

export const CONCEPTS: Record<string, Concept> = {
  chest_pain: { label: { en: "Chest pain", hi: "सीने में दर्द" }, forms: [
    "chest pain","pain in chest","pain in my chest","chest pressure","pressure in chest","tightness in chest",
    "chest discomfort","angina","chest tightness","heaviness in chest","chest hurt",
    "chest feels heavy","chest feels tight","chest is heavy","chest is tight","heavy chest","tight chest",
    "chest heaviness","chest ache","chest squeezing","squeezing in my chest","weight on my chest","weight on chest",
    "pressure on my chest","pressure on chest","pressure in my chest","heaviness in my chest","tightness in my chest",
    "discomfort in my chest",
    "सीने में दर्द","सीने मे दर्द","छाती में दर्द","छाती दर्द","सीने में जकड़न","सीने में दबाव","सीने में भारीपन",
    "सीने में जकड़","छाती में जकड़","छाती जकड़","सीना जकड़","छाती में भारी","छाती भारी","सीना भारी",
    "छाती में दबाव","सीने पर दबाव","छाती पर दबाव","सीने पर बोझ","छाती पर बोझ",
    "seene mein dard","seene me dard","sine mein dard","chhati mein dard","chati dard","chest mein dard",
    "chhati mein jakdan","seene mein jakdan","chhati bhari","seena bhari"
  ]},
  breathlessness: { label: { en: "Breathlessness", hi: "साँस की तकलीफ" }, forms: [
    "shortness of breath","short of breath","difficulty breathing","difficulty in breathing",
    "breathless","cannot breathe","can not breathe","trouble breathing","wheezing","suffocating","asthma",
    "out of breath","gasping","breathing difficulty","breathing problem","breathing trouble",
    "hard to breathe","struggling to breathe","struggle to breathe",
    "सांस","सांस लेने में","सांस फूल","दम घुट","सांस की तकलीफ","सांस नहीं आ","दमा","हांफ",
    "saans","sans","saans lene mein","saans phool","dam ghut","haanf","damaa"
  ]},
  abdominal_pain: { label: { en: "Abdominal pain", hi: "पेट दर्द" }, forms: [
    "stomach pain","stomach ache","abdomen","abdominal","belly pain","tummy","cramp","stomach",
    "पेट में दर्द","पेट दर्द","पेट में","पेट की","मरोड़","ऐंठन",
    "pet dard","pet mein dard","pet me dard","pait dard","maror"
  ]},
  fever: { label: { en: "Fever", hi: "बुखार" }, forms: [
    "fever","high temperature","temperature","chills","feverish",
    "बुखार","ज्वर","तेज बुखार","ठंड लग","कंपकंपी",
    "bukhar","bukhaar","jwar","thand lag","kapkapi"
  ]},
  cough: { label: { en: "Cough", hi: "खांसी" }, forms: [
    "cough","coughing","dry cough",
    "खांसी","खासी","सूखी खांसी",
    "khansi","khaansi","khasi"
  ]},
  heart_attack: { label: { en: "Suspected heart attack", hi: "दिल का दौरा" }, forms: [
    "heart attack","cardiac arrest","myocardial",
    "दिल का दौरा","हार्ट अटैक","दिल की धड़कन बंद",
    "dil ka daura","dil ka dora"
  ]},
  /* These six concepts (through severe_burn) drive isEmergency() in
     lib/redflag.ts, which stops the questionnaire and sends the patient
     straight to app/emergency/page.tsx. Every form below the first line of
     each list was added after an audit found the original forms matched
     only clinical-sounding phrasing (English) or a narrower verb form than
     Hindi speakers actually use (Hindi), so a lay description of a real
     emergency raised nothing. New forms are chosen to require a
     symptom-specific anchor word (गले, तरफ, throat, burn/burned rather than
     bare "burn", which also means heartburn) so they don't fire on the
     unrelated idioms those bare roots carry (अटकना/फंसना for stuck traffic
     or pending work, टेढ़ा for "a tricky matter", लटकना for sulking). */
  unconscious: { label: { en: "Unconscious", hi: "बेहोशी" }, forms: [
    "unconscious","fainted","passed out","not responding","collapsed",
    "won't wake up","not waking up","blacked out","unresponsive",
    "बेहोश","बेहोशी","होश नहीं","गिर पड़","गिर पड़ा","गिर पड़ी","गिर पड़े",
    "होश में नहीं","जवाब नहीं दे","जाग नहीं",
    "behosh","behoshi","hosh nahi"
  ]},
  stroke: { label: { en: "Stroke signs", hi: "लकवा" }, forms: [
    "stroke","face drooping","slurred speech","weakness on one side","paralysis",
    "face is drooping","mouth is crooked","crooked mouth","became slurred","weak on one side",
    "cant move one side","can not move one side","cannot move one side",
    "couldnt talk properly","could not talk properly","cannot talk properly",
    "लकवा","पक्षाघात","मुंह टेढ़ा","एक तरफ कमजोरी","बोलने में लड़खड़",
    "मुंह एक तरफ लटक","मुंह एक तरफ टेढ़ा","तरफ ताकत नहीं","लड़खड़ा","सुन्न",
    "lakwa","lakva","pakshaghat"
  ]},
  bleeding: { label: { en: "Heavy bleeding", hi: "अधिक रक्तस्राव" }, forms: [
    "heavy bleeding","bleeding a lot","lot of blood","haemorrhage","hemorrhage",
    "bleeding","blood coming",
    "खून बह","बहुत खून","खून निकल","खून रिस","रक्तस्राव",
    "khoon beh","bahut khoon","khoon nikal"
  ]},
  coughing_blood: { label: { en: "Coughing blood", hi: "खांसी में खून" }, forms: [
    "coughing blood","blood in cough","cough with blood","haemoptysis",
    "coughed up blood","coughing up blood","cough up blood",
    "blood in his cough","blood in her cough","blood in my cough","spitting blood",
    "खांसी में खून","खून की खांसी","बलगम में खून","खून थूक","थूक में खून",
    "khansi mein khoon","balgam mein khoon"
  ]},
  choking: { label: { en: "Choking", hi: "गला घुटना" }, forms: [
    "choking","something stuck in throat",
    "stuck in his throat","stuck in her throat","stuck in my throat","stuck in the throat",
    "gag","choke",
    "गला घुट","गले में फंस","दम घुट",
    "गले में अटक","गले में कुछ अटक","गले में कुछ फंस","गले में निवाला अटक","गले में हड्डी अटक",
    "gala ghut","gale mein phas"
  ]},
  severe_burn: { label: { en: "Severe burn", hi: "गंभीर जलन" }, forms: [
    "severe burn","burnt","burn injury","scalded",
    "burned","bad burn","boiling water","scalding water",
    "जल गया","जल गई","झुलस","गंभीर जलन","उबलता पानी","गहरी जलन",
    "jal gaya","jhulas"
  ]},
  /* answer-level concepts */
  unbearable: { label: { en: "Unbearable", hi: "असहनीय" }, forms: [
    "unbearable","cannot bear","worst pain","ten out of ten","severe",
    "असहनीय","बर्दाश्त नहीं","बहुत तेज","सहन नहीं",
    "asahniya","bardasht nahi","bahut tez"
  ]},
  /* The prototype listed bare "cannot", "can not", "cant" and "unable" here.
     Those are negation tokens now, and as forms they made "I cannot sleep"
     a high-priority case. "रुक रुक" alone also matched intermittent pain
     ("रुक रुक कर दर्द"). The forms below name the speech limit itself. */
  cannot_speak: { label: { en: "Cannot complete a sentence", hi: "पूरा वाक्य नहीं बोल पा रहे" }, forms: [
    "cannot complete a sentence","cant complete a sentence","cannot finish a sentence",
    "cant finish a sentence","can not finish a sentence","can not complete a sentence",
    "unable to finish a sentence","unable to complete a sentence",
    "only a few words","only few words","one word at a time",
    "पूरा वाक्य नहीं","एक दो शब्द","रुक रुक कर बोल","नहीं बोल पा","बोल नहीं पा",
    "nahi bol pa","bol nahi pa","ek do shabd"
  ]},
  /* Added for the chest pain rule in lib/redflag.ts: signs that, next to
     chest pain, make it high priority, and phrases that place the onset
     within the last 24 hours. */
  sweating: { label: { en: "Sweating", hi: "पसीना" }, forms: [
    "sweat","cold sweat",
    "पसीन",
    "paseen","pasin"
  ]},
  palpitations: { label: { en: "Fast or pounding heartbeat", hi: "दिल की तेज धड़कन" }, forms: [
    "palpitation","fast heartbeat","rapid heartbeat","pounding heartbeat","heart racing","racing heart","heart pounding",
    "धड़कन तेज","तेज धड़कन","दिल की धड़कन तेज",
    "dhadkan tez","tez dhadkan"
  ]},
  radiating_pain: { label: { en: "Pain spreading to arm or jaw", hi: "दर्द हाथ या जबड़े तक" }, forms: [
    "left arm","left hand","arm pain","pain in my arm","jaw",
    "बाएं हाथ","बायें हाथ","बाएं बाजू","हाथ में दर्द","जबड़",
    "baen haath","baye haath","jabda","jabde"
  ]},
  /* Each form names a starting point. A bare "hour", "घंट" or "मिनट" also
     matched "every few hours" and "48 hours", which mean the opposite. */
  recent_onset: { label: { en: "Began within 24 hours", hi: "24 घंटे के अंदर शुरू" }, forms: [
    "minutes ago","minute ago","just now","an hour ago","hour ago","hours ago",
    "since an hour","since one hour","since two hours","since few hours","since a few hours",
    "for an hour","last few hours","past few hours","last 24 hours","past 24 hours",
    "this morning","since morning","since this morning","today morning","last night","since last night",
    "since yesterday","since today",
    ...UNDER_24.map((n) => `since ${n} hour`),
    "एक घंटे से","आधे घंटे से","दो घंटे से","तीन घंटे से","कुछ घंटे से","कुछ घंटों से","घंटे भर से",
    "घंटे पहले","घंटा पहले","घंटों पहले","पिछले 24 घंट","मिनट पहले","मिनट से",
    ...UNDER_24.map((n) => `${n} घंटे से`),
    "सुबह से","आज सुबह","रात से","कल रात","कल से","आज से","अभी अभी","थोड़ी देर पहले","कुछ देर पहले",
    "ek ghante se","do ghante se","kuch ghante se","ghante pehle","ghanta pehle","minute pehle",
    "subah se","aaj subah","raat se","kal raat","kal se","abhi abhi"
  ]}
};

/* ---------- negation ---------- */

/* Hindi puts the negator after what it negates ("दर्द नहीं है"). */
const NEGATORS_AFTER = ["नहीं", "नही", "nahi", "nahin", "nahee", "nhi", "nai"];
/* English puts it before ("not", "don't have chest pain"). These can pair
   with an ability verb ("cannot breathe", "won't stop"). */
const NEGATORS_BEFORE = [
  "not", "never", "cannot", "cant", "dont", "doesnt", "didnt", "wont", "isnt",
  "havent", "hasnt", "arent", "wasnt", "couldnt", "unable",
];
/* Determiners deny a noun and never express inability ("no breathing problem"). */
const DENIALS_BEFORE = ["no", "none", "without", "nor", "neither"];

export const NEGATION_TOKENS: readonly string[] = [...NEGATORS_AFTER, ...NEGATORS_BEFORE, ...DENIALS_BEFORE];

/* "है" is deliberately absent. It ends almost every declarative Hindi
   sentence, so it would read every answer as a yes. "जी" alone is also
   absent, because "जी नहीं" means no. */
export const AFFIRMATIVE_TOKENS: readonly string[] = [
  "yes", "yeah", "yep", "yup", "sure", "correct",
  "हां", "हाँ", "हा", "जी हां", "जी हाँ",
  "haan", "han", "haa", "ji haan", "ji han",
];

/* Ability and stopping verbs. A negator next to one of these expresses
   inability, which raises the concept it touches instead of suppressing it.
   `only` limits which concepts the verb can raise ("बुखार नहीं आ रहा" is a
   denial of fever, "साँस नहीं आ रही" is breathlessness). `implies` names a
   concept the phrase raises even when no symptom word is present, and `cue`
   is a word that must appear somewhere in the text for that to happen. */
interface Ability {
  forms: string[];
  only?: string[];
  implies?: { concept: string; cue?: string[] };
}

const ABILITIES: Ability[] = [
  { forms: ["आ रही", "आ रहा", "आ रहे", "आती", "आता", "आ पा", "aa rahi", "aa raha", "aa rhi", "aati", "aata"],
    only: ["breathlessness", "unconscious"] },
  { forms: ["रुक", "थम", "थमता", "थमती", "थमा", "बंद", "ruk", "tham", "band", "stop", "control"],
    implies: { concept: "bleeding", cue: ["blood", "bleed", "खून", "रक्त", "khoon", "khun", "rakt"] } },
  { forms: ["breath"], implies: { concept: "breathlessness" } },
  /* Idioms that only mean breathlessness when negated ("can't catch her
     breath", "not getting enough air"). As concept forms, the negator in front
     of them would read as a denial. */
  { forms: ["catch my breath", "catch her breath", "catch his breath", "catch their breath", "catch the breath",
            "catch breath", "get enough air", "getting enough air"],
    implies: { concept: "breathlessness" } },
  { forms: ["बोल", "bol", "speak", "talk"] },
  { forms: ["पा", "पाता", "पाती", "पाते", "पाया", "पाई", "सकता", "सकती", "सकते", "सका",
            "pa", "paa", "pata", "pati", "sakta", "sakti", "able"] },
  { forms: ["हिल", "चल", "उठ", "hil", "mov", "walk", "swallow"] },
];

/* Words an English negator can skip over to reach its verb ("unable to breathe"). */
const FILLERS = new Set(["to", "be", "been", "being", "even", "really"]);
/* A new subject ends an English negator's reach ("I don't know, I have chest pain"). */
const SCOPE_BREAKERS = new Set(["i", "it", "its", "he", "she", "we", "they", "you", "but"]);
/* How many tokens a negator reaches. */
const REACH = 3;

/* Punctuation and conjunctions that separate clauses. Negation never crosses
   a clause boundary. */
const CLAUSE_PUNCTUATION = /[,.;:!?।॥\n\r]+/;
const CONJUNCTIONS = new Set([
  "but", "and", "because", "however", "although", "though",
  "लेकिन", "मगर", "और", "क्योंकि", "बल्कि", "किंतु", "परंतु",
  "lekin", "magar", "aur", "kyunki",
].map(normalizeText));

/* ---------- matching ---------- */

type Words = string[];

function compile(forms: readonly string[]): Words[] {
  return forms.map((f) => normalizeText(f).split(" ")).filter((w) => w[0]);
}

const CONCEPT_FORMS: { concept: string; words: Words }[] = Object.entries(CONCEPTS).flatMap(
  ([concept, c]) => compile(c.forms).map((words) => ({ concept, words })),
);
const ABILITY_FORMS: { ability: Ability; words: Words }[] = ABILITIES.flatMap(
  (ability) => compile(ability.forms).map((words) => ({ ability, words })),
);
const AFTER = new Set(NEGATORS_AFTER.map(normalizeText));
const BEFORE = new Set(NEGATORS_BEFORE.map(normalizeText));
const DENY = new Set(DENIALS_BEFORE.map(normalizeText));

/* Earlier words must match exactly. The last word may be a prefix, so
   inflections match ("cough" in "coughing", "सांस" in "सांसें"), but only
   when it is three characters or more, so "पा" never matches "पानी". */
function matchesAt(tokens: Words, i: number, words: Words): boolean {
  if (i < 0 || i + words.length > tokens.length) return false;
  return words.every((w, k) => {
    const t = tokens[i + k];
    return k === words.length - 1 && w.length >= 3 ? t.startsWith(w) : t === w;
  });
}

interface Match { start: number; end: number; concepts: string[] }

/* Longest form wins at each position, and matches do not overlap. When two
   concepts share a form ("दम घुट"), both are raised. */
function findMatches(tokens: Words): Match[] {
  const out: Match[] = [];
  let i = 0;
  while (i < tokens.length) {
    let len = 0;
    let concepts: string[] = [];
    for (const f of CONCEPT_FORMS) {
      if (f.words.length < len || !matchesAt(tokens, i, f.words)) continue;
      if (f.words.length > len) {
        len = f.words.length;
        concepts = [f.concept];
      } else if (!concepts.includes(f.concept)) {
        concepts.push(f.concept);
      }
    }
    if (len) {
      out.push({ start: i, end: i + len, concepts });
      i += len;
    } else {
      i++;
    }
  }
  return out;
}

function abilitiesAt(tokens: Words, i: number): { ability: Ability; end: number }[] {
  return ABILITY_FORMS.filter((f) => matchesAt(tokens, i, f.words)).map((f) => ({
    ability: f.ability,
    end: i + f.words.length,
  }));
}

/* Ability verbs that pair with the negator at n. Hindi: the verb sits just
   before ("रुक नहीं रहा") or within two tokens after ("नहीं आ रही",
   "नहीं ले पा रहा"). English: the verb follows, past fillers ("cannot
   breathe", "not able to breathe", "won't stop"). */
function abilitiesNear(tokens: Words, n: number, after: boolean): Ability[] {
  const found: Ability[] = [];
  if (after) {
    for (const p of [n - 2, n - 1]) {
      for (const a of abilitiesAt(tokens, p)) if (a.end === n) found.push(a.ability);
    }
    for (const p of [n + 1, n + 2]) found.push(...abilitiesAt(tokens, p).map((a) => a.ability));
    return found;
  }
  let p = n + 1;
  while (p < tokens.length && p <= n + REACH + 1) {
    const here = abilitiesAt(tokens, p);
    if (here.length) {
      found.push(...here.map((a) => a.ability));
      p = Math.max(...here.map((a) => a.end));
    } else if (FILLERS.has(tokens[p])) {
      p++;
    } else {
      break;
    }
  }
  return found;
}

/* The matches a negator at n reaches. Hindi: the nearest match ending just
   before it. English: every match starting shortly after it, up to a new
   subject. */
function matchesInReach(matches: Match[], tokens: Words, n: number, after: boolean): Match[] {
  if (after) {
    const before = matches.filter((m) => m.end <= n && n - m.end <= REACH);
    return before.length ? [before[before.length - 1]] : [];
  }
  return matches.filter((m) => {
    if (m.start <= n || m.start - n > REACH) return false;
    for (let k = n + 1; k < m.start; k++) if (SCOPE_BREAKERS.has(tokens[k])) return false;
    return true;
  });
}

function cuePresent(allTokens: Words, cue: string[]): boolean {
  const cues = compile(cue);
  return allTokens.some((_, i) => cues.some((w) => matchesAt(allTokens, i, w)));
}

/* Concepts raised in one clause, in order of appearance. */
function analyseClause(tokens: Words, allTokens: Words): string[] {
  const matches = findMatches(tokens);
  const suppressed = matches.map(() => new Set<string>());
  const kept = matches.map(() => new Set<string>());
  const implied: { pos: number; concept: string }[] = [];

  tokens.forEach((t, n) => {
    // A negator inside a matched form belongs to that form ("होश नहीं", "cannot bear").
    if (matches.some((m) => n >= m.start && n < m.end)) return;
    const after = AFTER.has(t);
    const verbal = after || BEFORE.has(t);
    if (!verbal && !DENY.has(t)) return;

    const abilities = verbal ? abilitiesNear(tokens, n, after) : [];
    for (const a of abilities) {
      if (a.implies && (!a.implies.cue || cuePresent(allTokens, a.implies.cue))) {
        implied.push({ pos: n, concept: a.implies.concept });
      }
    }
    for (const m of matchesInReach(matches, tokens, n, after)) {
      const i = matches.indexOf(m);
      for (const c of m.concepts) {
        const inability = abilities.some((a) => !a.only || a.only.includes(c));
        (inability ? kept : suppressed)[i].add(c);
      }
    }
  });

  const raised: { pos: number; concept: string }[] = [...implied];
  matches.forEach((m, i) => {
    for (const c of m.concepts) {
      if (!suppressed[i].has(c) || kept[i].has(c)) raised.push({ pos: m.start, concept: c });
    }
  });
  raised.sort((a, b) => a.pos - b.pos);
  return [...new Set(raised.map((r) => r.concept))];
}

function clausesOf(text: string): Words[] {
  const out: Words[] = [];
  for (const piece of String(text ?? "").split(CLAUSE_PUNCTUATION)) {
    let current: Words = [];
    for (const tok of normalizeText(piece).split(" ")) {
      if (!tok) continue;
      if (CONJUNCTIONS.has(tok)) {
        if (current.length) out.push(current);
        current = [];
      } else {
        current.push(tok);
      }
    }
    if (current.length) out.push(current);
  }
  return out;
}

/* ---------- public API ---------- */

/** Concepts raised in each clause of the text, clause by clause. */
export function conceptsByClause(text: string): string[][] {
  const clauses = clausesOf(text);
  const all = clauses.flat();
  return clauses.map((tokens) => analyseClause(tokens, all));
}

/** Concept keys raised by the text, in order of first appearance. */
export function conceptsIn(text: string): string[] {
  return [...new Set(conceptsByClause(text).flat())];
}

/** Reads a spoken yes or no. Returns null when the answer holds both or neither. */
export function yesNo(text: string): "yes" | "no" | null {
  const tokens = normalizeText(text).split(" ");
  const yes = compile(AFFIRMATIVE_TOKENS).some((w) =>
    tokens.some((_, i) => w.every((word, k) => tokens[i + k] === word)),
  );
  const no = tokens.some((t) => AFTER.has(t) || BEFORE.has(t) || DENY.has(t));
  if (yes && !no) return "yes";
  if (no && !yes) return "no";
  return null;
}
