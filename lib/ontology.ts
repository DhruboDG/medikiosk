/* The question engine. Question trees live in /ontology as JSON. This file
   only walks them. */

import type { Answer, HistoryNode, Lang, Localised, Mode } from "./types.ts";
import { conceptsIn } from "./concepts.ts";
import general from "../ontology/general.json" with { type: "json" };
import ayush from "../ontology/ayush.json" with { type: "json" };

const GENERAL = general as HistoryNode[];
const AYUSH = ayush as HistoryNode[];

const TREES: Record<Mode, HistoryNode[]> = { allopathic: GENERAL, ayush: AYUSH };

/* Shown on every AYUSH screen and on the physician AyushPanel header. The
   Dashavidha Pariksha is captured as a structured record only — the vaidya
   interprets it, the software never scores or names a dosha. */
export const AYUSH_DISCLAIMER: Localised = {
  en: "This is a structured record of the Dashavidha Pariksha for the vaidya to interpret, not a constitutional assessment produced by software.",
  hi: "यह दशविध परीक्षा का एक संरचित रिकॉर्ड है, जिसकी व्याख्या वैद्य करेंगे। यह सॉफ्टवेयर द्वारा बनाया गया प्रकृति निर्धारण नहीं है।",
};

/** Multi-select answers store their option values joined with this. */
export const MULTI_SEPARATOR = ",";

export interface Progress {
  answered: number;
  total: number;
  fraction: number;
}

export function loadTree(mode: Mode): HistoryNode[] {
  return TREES[mode] ?? GENERAL;
}

export function findNode(tree: HistoryNode[], id: string): HistoryNode | undefined {
  return tree.find((n) => n.id === id);
}

/** The most recent answer to a node. A patient who goes back and changes an answer adds a new one. */
export function latestAnswer(answers: Answer[], nodeId: string): Answer | undefined {
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].nodeId === nodeId) return answers[i];
  }
  return undefined;
}

/* What an answer can be matched on in next.when: its option values, plus any
   concept the node declares that the answer text raises. That is how the
   free-text complaint branches into chest, respiratory and so on. */
function answerKeys(node: HistoryNode, answer: Answer): Set<string> {
  const keys = new Set(
    String(answer.value ?? "").split(MULTI_SEPARATOR).map((v) => v.trim()).filter(Boolean),
  );
  if (node.concepts?.length) {
    for (const c of [...conceptsIn(answer.raw), ...conceptsIn(answer.value)]) {
      if (node.concepts.includes(c)) keys.add(c);
    }
  }
  return keys;
}

/* next.when is checked first, in order, and the first rule that matches wins.
   Then next.default. No next means the tree ends here. */
function nextId(node: HistoryNode, answer: Answer): string | undefined {
  const keys = answerKeys(node, answer);
  for (const rule of node.next?.when ?? []) {
    if (rule.answerIn.some((v) => keys.has(v))) return rule.goto;
  }
  return node.next?.default;
}

/* Follows the answers from the root. Returns the answered path and the first
   unanswered node on it, or null when the tree is finished. */
function walk(tree: HistoryNode[], answers: Answer[]): { path: HistoryNode[]; pending: HistoryNode | null } {
  const path: HistoryNode[] = [];
  const seen = new Set<string>();
  let node: HistoryNode | null = tree[0] ?? null;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    const answer = latestAnswer(answers, node.id);
    if (!answer) return { path, pending: node };
    path.push(node);
    const id = nextId(node, answer);
    node = id ? findNode(tree, id) ?? null : null;
  }
  return { path, pending: null };
}

/** The next question to ask, or null when the history is complete. */
export function nextNode(tree: HistoryNode[], answers: Answer[]): HistoryNode | null {
  return walk(tree, answers).pending;
}

/* Answered nodes on the current path, over that path plus the questions still
   expected on the default route. The total can grow when an answer opens a
   follow-up question. */
export function progress(tree: HistoryNode[], answers: Answer[]): Progress {
  const { path, pending } = walk(tree, answers);
  const seen = new Set(path.map((n) => n.id));
  let remaining = 0;
  let node = pending;
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    remaining++;
    const id = node.next?.default ?? node.next?.when?.[0]?.goto;
    node = id ? findNode(tree, id) ?? null : null;
  }
  const total = path.length + remaining;
  return { answered: path.length, total, fraction: total ? path.length / total : 1 };
}

/* Builds the Answer for tapped options. `raw` holds the labels the patient saw,
   in their language, and `value` the canonical option values. lib/redflag.ts
   reads both, so tap answers should always be built here. */
export function tapAnswer(node: HistoryNode, optionIds: string[], lang: Lang): Answer {
  const chosen = (node.options ?? []).filter((o) => optionIds.includes(o.id));
  return {
    nodeId: node.id,
    raw: chosen.map((o) => o.label[lang]).join(", "),
    value: chosen.map((o) => o.value).join(MULTI_SEPARATOR),
    via: "tap",
  };
}
