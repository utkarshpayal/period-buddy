import assert from "node:assert/strict";
import { test } from "node:test";
import { isAiConsentRequired, isSpokenConfirmation, matchLocalAnswer, URGENT_SAFETY_SOURCE } from "../qaFallback";

test("urgent symptoms get the urgent-safety answer, even alongside 'normal' keywords", () => {
  for (const question of [
    "I'm soaking a pad every hour",
    "Feeling dizzy and the blood is dark brown",
    "fever with period cramps",
    "severe pain on one side",
    "Bleeding during pregnancy, is it ok?",
    "I want to die",
    "thinking about self-harm",
    "I feel suicidal",
  ]) {
    assert.equal(matchLocalAnswer(question)?.source, URGENT_SAFETY_SOURCE, question);
  }
});

test("matching is case-insensitive", () => {
  assert.equal(matchLocalAnswer("FAINT after my period")?.source, URGENT_SAFETY_SOURCE);
  assert.match(matchLocalAnswer("Is BROWN blood normal?")?.text ?? "", /Dark brown blood/);
});

test("keywords match from the start of a word only", () => {
  // Prefixes count ("darker" hits "dark")...
  assert.ok(matchLocalAnswer("darker"));
  // ...but a keyword buried inside another word doesn't match.
  assert.equal(matchLocalAnswer("unsafe"), null);
  assert.equal(matchLocalAnswer("woman"), null);
});

test("ordinary questions get their topic answer", () => {
  assert.match(matchLocalAnswer("Can a cup break my hymen?")?.text ?? "", /menstrual cup/);
  assert.match(matchLocalAnswer("why do I poop more")?.text ?? "", /bowel movements/);
  assert.match(matchLocalAnswer("should I use soap down there")?.text ?? "", /self-cleaning/);
});

test("no match and empty input return null", () => {
  assert.equal(matchLocalAnswer("hello there"), null);
  assert.equal(matchLocalAnswer("   "), null);
});

test("spoken confirmation needs a yes and no no", () => {
  assert.equal(isSpokenConfirmation("yes please"), true);
  assert.equal(isSpokenConfirmation("haan kar do"), true);
  assert.equal(isSpokenConfirmation("हाँ"), true);
  assert.equal(isSpokenConfirmation("ok but don't save it"), false);
  assert.equal(isSpokenConfirmation("ji nahi"), false);
  assert.equal(isSpokenConfirmation("tell me more"), false);
});

test("isAiConsentRequired reads the error code", () => {
  assert.equal(isAiConsentRequired({ code: "AI_CONSENT_REQUIRED" }), true);
  assert.equal(isAiConsentRequired({ code: "FEATURE_LOCKED" }), false);
  assert.equal(isAiConsentRequired(new Error("x")), false);
  assert.equal(isAiConsentRequired(null), false);
});
