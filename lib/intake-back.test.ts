import { test } from "node:test";
import assert from "node:assert/strict";
import type { Answer, HistoryNode, Session } from "./types.ts";
import { answeredPath, findNode, loadTree, nextNode, tapAnswer } from "./ontology.ts";
import { backTarget, branchesOn, selectedOptionIds } from "./intake-back.ts";
import { evaluate } from "./redflag.ts";

const GENERAL = loadTree("allopathic");
const AYUSH = loadTree("ayush");

function node(tree: HistoryNode[], id: string): HistoryNode {
  const n = findNode(tree, id);
  assert.ok(n, `node ${id} missing from the ontology`);
  return n;
}

function newSession(): Session {
  return {
    id: "t", name: "Test", age: 50, gender: "male", lang: "en", mode: "allopathic",
    answers: [], documents: [], redFlag: { level: "none", concept: null, reason: "" },
    status: "in_progress", createdAt: new Date(0).toISOString(),
  };
}

/* Mirrors app/api/session/[id]/answer/route.ts: replace the answer for the
   node if there is one, otherwise add it, then re-evaluate the red flag. */
function post(session: Session, answer: Answer): Session {
  const i = session.answers.findIndex((a) => a.nodeId === answer.nodeId);
  if (i >= 0) session.answers[i] = answer;
  else session.answers.push(answer);
  session.redFlag = evaluate(session);
  return session;
}

function tap(session: Session, nodeId: string, ...optionIds: string[]): Session {
  return post(session, tapAnswer(node(GENERAL, nodeId), optionIds, "en"));
}

function say(session: Session, nodeId: string, text: string): Session {
  return post(session, { nodeId, raw: text, value: text, via: "type" });
}

test("the nodes that change the branch are the ones Back was reviewed against", () => {
  // If this fails, a node gained or lost next.when and whether Back may reopen
  // it needs a fresh decision. In the AYUSH tree cc_open has no next.when.
  assert.deepEqual(GENERAL.filter(branchesOn).map((n) => n.id), ["cc_open", "da_meds", "da_allergy"]);
  assert.deepEqual(AYUSH.filter(branchesOn).map((n) => n.id), ["da_meds", "da_allergy"]);
});

test("no Back on the chief complaint", () => {
  assert.deepEqual(backTarget([], 0), { kind: "none" });
});

test("no Back on the first follow-up", () => {
  const s = say(newSession(), "cc_open", "I have a headache");
  const path = answeredPath(GENERAL, s.answers);
  assert.equal(nextNode(GENERAL, s.answers)?.id, "gen_duration");
  assert.deepEqual(backTarget(path, path.length), { kind: "none" });
});

test("Back on a later follow-up reopens the previous question", () => {
  let s = say(newSession(), "cc_open", "I have a headache");
  s = tap(s, "gen_duration", "1_4w");
  const path = answeredPath(GENERAL, s.answers);
  assert.equal(nextNode(GENERAL, s.answers)?.id, "gen_trend");
  assert.deepEqual(backTarget(path, path.length), { kind: "node", index: 1 });
  assert.equal(path[1].id, "gen_duration");
});

test("Back cannot reopen a branching question", () => {
  let s = say(newSession(), "cc_open", "I have a headache");
  for (const [id, opt] of [
    ["gen_duration", "1_4w"], ["gen_trend", "same"], ["gen_severity", "mild"],
    ["ph_conditions", "none"], ["ph_surgery", "no"], ["ph_admission", "no"], ["da_meds", "none"],
  ]) s = tap(s, id, opt);
  const path = answeredPath(GENERAL, s.answers);
  assert.equal(nextNode(GENERAL, s.answers)?.id, "da_allergy");
  assert.deepEqual(backTarget(path, path.length), { kind: "locked", nodeId: "da_meds" });
});

test("a reopened tap question pre-selects the stored options", () => {
  const n = node(GENERAL, "chest_associated");
  const a = tapAnswer(n, ["sweating", "palpitations"], "en");
  assert.deepEqual(selectedOptionIds(n, a), ["sweating", "palpitations"]);
  assert.deepEqual(selectedOptionIds(n, undefined), []);
});

test("an edited answer replaces the original and does not add a second one", () => {
  let s = say(newSession(), "cc_open", "I have a headache");
  s = tap(s, "gen_duration", "lt_1w");
  s = tap(s, "gen_duration", "gt_6m");
  const forNode = s.answers.filter((a) => a.nodeId === "gen_duration");
  assert.equal(forNode.length, 1);
  assert.equal(forNode[0].value, "gt_6m");
  assert.equal(s.answers.length, 2);
});

test("editing breathlessness away does not lower a high flag", () => {
  let s = say(newSession(), "cc_open", "pain in my chest");
  s = tap(s, "chest_site", "centre");
  s = tap(s, "chest_onset", "gt_1w");
  s = tap(s, "chest_character", "dull");
  s = tap(s, "chest_radiation", "none");
  s = tap(s, "chest_associated", "breathlessness");
  assert.equal(s.redFlag.level, "high");
  s = tap(s, "chest_associated", "none");
  assert.equal(s.redFlag.level, "high");
});

test("editing a recent chest pain onset to over a week does not lower a high flag", () => {
  let s = say(newSession(), "cc_open", "pain in my chest");
  s = tap(s, "chest_site", "left");
  s = tap(s, "chest_onset", "lt_1h");
  assert.equal(s.redFlag.level, "high");
  s = tap(s, "chest_onset", "gt_1w");
  assert.equal(s.redFlag.level, "high");
});

test("editing 'only a few words' to 'easily' does not lower a high flag", () => {
  let s = say(newSession(), "cc_open", "I have a bad cough");
  s = tap(s, "resp_onset", "days");
  s = tap(s, "resp_speech", "cannot_speak");
  assert.equal(s.redFlag.level, "high");
  s = tap(s, "resp_speech", "full");
  assert.equal(s.redFlag.level, "high");
});

test("editing unbearable to mild does not lower a moderate flag", () => {
  let s = say(newSession(), "cc_open", "I have a headache");
  s = tap(s, "gen_duration", "1_4w");
  s = tap(s, "gen_trend", "worse");
  s = tap(s, "gen_severity", "unbearable");
  assert.equal(s.redFlag.level, "moderate");
  s = tap(s, "gen_severity", "mild");
  assert.equal(s.redFlag.level, "moderate");
});

test("an edit can still raise the flag", () => {
  let s = say(newSession(), "cc_open", "I have a headache");
  s = tap(s, "gen_duration", "1_4w");
  s = tap(s, "gen_trend", "same");
  s = tap(s, "gen_severity", "mild");
  assert.equal(s.redFlag.level, "none");
  s = tap(s, "gen_severity", "unbearable");
  assert.equal(s.redFlag.level, "moderate");
});
