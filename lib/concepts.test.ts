import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptsIn } from "./concepts.ts";
import { evaluate } from "./redflag.ts";
import type { Session } from "./types.ts";

// A synthetic session whose only answer is the free-text chief complaint.
function sessionSaying(text: string): Session {
  return {
    id: "test-session",
    name: "Test Patient",
    age: 50,
    gender: "other",
    lang: "hi",
    mode: "allopathic",
    answers: [{ nodeId: "cc_open", raw: text, value: text, via: "voice" }],
    documents: [],
    redFlag: { level: "none", concept: null, reason: "" },
    status: "in_progress",
    createdAt: "2026-09-11T00:00:00.000Z",
  };
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
