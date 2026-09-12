import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { HistoryNode, Section } from "./types.ts";

const AYUSH: HistoryNode[] = JSON.parse(
  readFileSync(new URL("../ontology/ayush.json", import.meta.url), "utf8"),
);
const GENERAL: HistoryNode[] = JSON.parse(
  readFileSync(new URL("../ontology/general.json", import.meta.url), "utf8"),
);

const SECTIONS: Section[] = [
  "chief_complaint", "hpi", "past_history", "drug_allergy", "family", "personal", "ros", "ayush",
];
const ANSWER_TYPES = ["text", "single", "multi", "number", "duration"];

function edgesOf(node: HistoryNode): string[] {
  const out: string[] = [];
  if (node.next?.default) out.push(node.next.default);
  for (const rule of node.next?.when ?? []) out.push(rule.goto);
  return out;
}

test("every node in ayush.json has a unique id", () => {
  const ids = AYUSH.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids among: ${ids.join(", ")}`);
});

test("every node in ayush.json validates against the HistoryNode shape", () => {
  for (const node of AYUSH) {
    assert.equal(typeof node.id, "string", `${node.id}: id must be a string`);
    assert.ok(SECTIONS.includes(node.section), `${node.id}: unknown section "${node.section}"`);
    assert.equal(typeof node.prompt?.en, "string", `${node.id}: prompt.en missing`);
    assert.equal(typeof node.prompt?.hi, "string", `${node.id}: prompt.hi missing`);
    assert.ok(node.prompt.en.length > 0, `${node.id}: prompt.en empty`);
    assert.ok(node.prompt.hi.length > 0, `${node.id}: prompt.hi empty`);
    assert.ok(ANSWER_TYPES.includes(node.answerType), `${node.id}: unknown answerType "${node.answerType}"`);
    assert.equal(typeof node.source, "string", `${node.id}: source missing`);
    assert.ok(node.source.length > 0, `${node.id}: source empty`);

    if (node.options !== undefined) {
      assert.ok(Array.isArray(node.options), `${node.id}: options must be an array`);
      for (const opt of node.options) {
        assert.equal(typeof opt.id, "string", `${node.id}: option missing id`);
        assert.equal(typeof opt.value, "string", `${node.id}: option ${opt.id} missing value`);
        assert.equal(typeof opt.label?.en, "string", `${node.id}: option ${opt.id} missing label.en`);
        assert.equal(typeof opt.label?.hi, "string", `${node.id}: option ${opt.id} missing label.hi`);
      }
    }

    // Every AYUSH-authored node (as opposed to a reused shared-section node)
    // must be answerable by tap, per CLAUDE.md's accessibility floor. Single-
    // select nodes stay to 3-4 options; ayush_ahara_vihara_substance is a
    // multi-select combining pers_tobacco's and pers_alcohol's option sets, so
    // multi-select nodes only need at least 2.
    if (node.section === "ayush") {
      assert.ok(node.answerType === "single" || node.answerType === "multi",
        `${node.id}: AYUSH nodes must be tap-answerable (single/multi), got "${node.answerType}"`);
      if (node.answerType === "single") {
        assert.ok((node.options?.length ?? 0) >= 3 && (node.options?.length ?? 0) <= 4,
          `${node.id}: expected 3 to 4 tap options, got ${node.options?.length ?? 0}`);
      } else {
        assert.ok((node.options?.length ?? 0) >= 2,
          `${node.id}: expected at least 2 tap options, got ${node.options?.length ?? 0}`);
      }
    }

    if (node.next) {
      if (node.next.default !== undefined) {
        assert.equal(typeof node.next.default, "string", `${node.id}: next.default must be a string`);
      }
      if (node.next.when !== undefined) {
        assert.ok(Array.isArray(node.next.when), `${node.id}: next.when must be an array`);
        for (const rule of node.next.when) {
          assert.ok(Array.isArray(rule.answerIn), `${node.id}: next.when.answerIn must be an array`);
          assert.equal(typeof rule.goto, "string", `${node.id}: next.when.goto must be a string`);
        }
      }
    }
  }
});

test("no next.default or next.when.goto in ayush.json points at a missing node", () => {
  const ids = new Set(AYUSH.map((n) => n.id));
  for (const node of AYUSH) {
    if (node.next?.default) {
      assert.ok(ids.has(node.next.default), `${node.id}: next.default -> missing node "${node.next.default}"`);
    }
    for (const rule of node.next?.when ?? []) {
      assert.ok(ids.has(rule.goto), `${node.id}: next.when -> missing node "${rule.goto}"`);
    }
  }
});

test("ayush.json has no cycles, so every path through it terminates", () => {
  const byId = new Map(AYUSH.map((n) => [n.id, n]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  function visit(id: string, stack: string[]) {
    color.set(id, GRAY);
    const node = byId.get(id);
    if (node) {
      for (const next of edgesOf(node)) {
        const state = color.get(next) ?? WHITE;
        if (state === GRAY) {
          assert.fail(`cycle detected: ${[...stack, id, next].join(" -> ")}`);
        } else if (state === WHITE) {
          visit(next, [...stack, id]);
        }
      }
    }
    color.set(id, BLACK);
  }

  for (const node of AYUSH) {
    if ((color.get(node.id) ?? WHITE) === WHITE) visit(node.id, []);
  }
});

test("ayush.json has at least one terminal node (no next), so the loop actually ends", () => {
  const terminal = AYUSH.filter((n) => !n.next?.default && !(n.next?.when?.length));
  assert.ok(terminal.length > 0, "no terminal node found — the tree never ends");
});

test("walking ayush.json along next.default from the first node reaches a terminal node", () => {
  const byId = new Map(AYUSH.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let node: HistoryNode | undefined = AYUSH[0];
  let steps = 0;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    steps++;
    assert.ok(steps <= AYUSH.length, "default-path walk revisited a node without being caught as a cycle");
    const defaultId: string | undefined = node.next?.default;
    node = defaultId ? byId.get(defaultId) : undefined;
  }
  assert.ok(seen.size > 0, "the default path visited no nodes");
});

test("the default AYUSH path is 27 nodes long, including separate tobacco and alcohol screens", () => {
  const byId = new Map(AYUSH.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let node: HistoryNode | undefined = AYUSH[0];
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    const defaultId: string | undefined = node.next?.default;
    node = defaultId ? byId.get(defaultId) : undefined;
  }
  assert.ok(seen.has("ayush_ahara_vihara_tobacco"), "the default path should visit the tobacco screen");
  assert.ok(seen.has("ayush_ahara_vihara_alcohol"), "the default path should visit the alcohol screen");
  assert.equal(seen.size, 27, `expected 27 nodes on the default path, got ${seen.size}`);
});

// Two options both read "Never" and two both read "I used to, now stopped" if
// tobacco and alcohol share a screen, which is unusable for a low-literacy
// kiosk patient. ayush.json instead asks tobacco and alcohol as separate
// single-question screens (one topic per screen, per CLAUDE.md), each with
// its own unambiguous "Never" / "I used to, now stopped" option. Cross-path
// comparability with general.json's pers_tobacco/pers_alcohol therefore lives
// in the option ids and values (which this reuses verbatim), not the labels.
test("ayush_ahara_vihara_tobacco and ayush_ahara_vihara_alcohol reuse pers_tobacco's and pers_alcohol's option ids and values verbatim", () => {
  const ayushTobacco = AYUSH.find((n) => n.id === "ayush_ahara_vihara_tobacco");
  const ayushAlcohol = AYUSH.find((n) => n.id === "ayush_ahara_vihara_alcohol");
  const persTobacco = GENERAL.find((n) => n.id === "pers_tobacco");
  const persAlcohol = GENERAL.find((n) => n.id === "pers_alcohol");
  assert.ok(ayushTobacco && ayushAlcohol, "ayush_ahara_vihara_tobacco/ayush_ahara_vihara_alcohol are missing");
  assert.ok(persTobacco && persAlcohol, "test fixture assumption broken: pers_tobacco/pers_alcohol missing from general.json");
  assert.equal(ayushTobacco!.answerType, "single");
  assert.equal(ayushAlcohol!.answerType, "single");

  for (const [ayushNode, generalNode] of [
    [ayushTobacco!, persTobacco!],
    [ayushAlcohol!, persAlcohol!],
  ] as const) {
    const ayushValues = new Set((ayushNode.options ?? []).map((o) => `${o.id}|${o.value}`));
    for (const opt of generalNode.options ?? []) {
      assert.ok(ayushValues.has(`${opt.id}|${opt.value}`),
        `${ayushNode.id} is missing the option id/value "${opt.id}"/"${opt.value}" from ${generalNode.id}`);
    }
  }
});

test("ayush.json reuses general.json's node ids for the chief complaint and the shared fixed sections", () => {
  const generalIds = new Set(GENERAL.map((n) => n.id));
  // pers_tobacco, pers_alcohol, pers_diet and pers_sleep are deliberately not
  // reused: they overlap with the Ahara-Vihara nodes below, and the AYUSH tree
  // keeps the Ahara-Vihara version instead of asking about diet and sleep twice.
  const REQUIRED_SHARED_IDS = [
    "cc_open",
    "ph_conditions", "ph_surgery", "ph_admission",
    "da_meds", "da_meds_list", "da_allergy", "da_allergy_detail",
    "fh_conditions", "fh_similar",
    "ros_general", "ros_systems",
  ];
  const DROPPED_AS_DUPLICATE_IDS = ["pers_tobacco", "pers_alcohol", "pers_diet", "pers_sleep"];
  const ayushIds = new Set(AYUSH.map((n) => n.id));
  for (const id of REQUIRED_SHARED_IDS) {
    assert.ok(generalIds.has(id), `test fixture assumption broken: "${id}" is no longer in general.json`);
    assert.ok(ayushIds.has(id), `ayush.json does not reuse the shared node "${id}" from general.json`);
  }
  for (const id of DROPPED_AS_DUPLICATE_IDS) {
    assert.ok(!ayushIds.has(id), `ayush.json should not carry "${id}" — it duplicates an Ahara-Vihara question`);
  }
});

test("the Dashavidha Pariksha comes right after the chief complaint, before the shared sections", () => {
  const order = AYUSH.map((n) => n.id);
  assert.equal(order[0], "cc_open", "cc_open should be the first node");
  assert.equal(order[1], "ayush_prakriti_build", "the first Pariksha node should come immediately after the chief complaint");

  const firstSharedIndex = order.findIndex((id) => id === "ph_conditions");
  const lastAyushSectionIndex = Math.max(...AYUSH.map((n, i) => (n.section === "ayush" ? i : -1)));
  assert.ok(lastAyushSectionIndex < firstSharedIndex,
    "every ayush-section node should appear before the shared past-history/drug/family/personal/ROS sections");
});

test("ayush.json covers all ten Dashavidha Pariksha parameters plus Ahara-Vihara", () => {
  const PREFIXES = [
    "ayush_prakriti", "ayush_vikriti", "ayush_sara", "ayush_samhanana", "ayush_pramana",
    "ayush_satmya", "ayush_sattva", "ayush_ahara_shakti", "ayush_vyayama_shakti", "ayush_vaya",
    "ayush_ahara_vihara",
  ];
  const ids = AYUSH.map((n) => n.id);
  for (const prefix of PREFIXES) {
    assert.ok(ids.some((id) => id.startsWith(prefix)), `no node found for parameter prefix "${prefix}"`);
  }
});

test("ayush.json never names or scores a dosha", () => {
  const text = readFileSync(new URL("../ontology/ayush.json", import.meta.url), "utf8");
  const lower = text.toLowerCase();
  for (const banned of ["vata", "pitta", "kapha", "dosha", "score"]) {
    assert.ok(!lower.includes(banned), `ayush.json mentions banned term "${banned}"`);
  }
  for (const banned of ["वात", "पित्त", "कफ"]) {
    assert.ok(!text.includes(banned), `ayush.json mentions banned term "${banned}"`);
  }
});
