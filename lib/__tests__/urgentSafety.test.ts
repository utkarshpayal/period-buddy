import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLocalAnswer, URGENT_SAFETY_SOURCE } from "../qaFallback";
import { isUrgentQuestion, mentionsSelfHarm, URGENT_REPLY, URGENT_REPLY_HI, urgentReplyFor } from "../urgentSafety";

test("medical red flags are urgent", () => {
  for (const question of [
    "I fill a pad every hour since this morning",
    "soaking through my pads so fast",
    "I passed out in the bathroom during my period",
    "I'm 6 weeks pregnant and have cramps",
    "positive test yesterday and now spotting",
    "missed my period and there's sharp pain on one side",
    "bleeding after sex again",
    "post-coital spotting",
    "I'm postmenopausal and saw some blood",
    "high fever and pelvic pain",
    "sudden severe pain in my belly",
    "the cramps are so bad I can't stand",
    "feeling light-headed and bleeding a lot",
  ]) {
    assert.equal(isUrgentQuestion(question), true, question);
  }
});

test("Hindi and Hinglish red flags are urgent", () => {
  for (const question of [
    "har ghante pad badalna pad raha hai",
    "main behosh ho gayi thi",
    "sex ke baad khoon aa raha hai",
    "pregnant hoon aur dard ho raha hai",
    "bukhar ke saath pet mein dard",
    "achanak bahut tez dard",
    "हर घंटे पैड भर जाता है",
    "गर्भवती हूँ और खून आ रहा है",
    "मुझे बेहोशी आती है",
  ]) {
    assert.equal(isUrgentQuestion(question), true, question);
  }
});

test("self-harm is urgent in English and Hindi", () => {
  for (const question of ["I don't want to live anymore", "I keep hurting myself", "mujhe marna hai", "khudkushi ke khayal", "मैं आत्महत्या के बारे में सोचती हूँ"]) {
    assert.equal(mentionsSelfHarm(question), true, question);
    assert.equal(isUrgentQuestion(question), true, question);
  }
});

test("everyday questions are not urgent", () => {
  for (const question of [
    "Is brown period blood normal?",
    "why are my cramps worse this month",
    "I feel dizzy sometimes when I stand up",
    "can I get pregnant on my period",
    "how do I use a menstrual cup",
    "periods aur mood swings",
    "",
  ]) {
    assert.equal(isUrgentQuestion(question), false, question);
  }
});

test("the reply is Hindi for Devanagari questions, else English", () => {
  assert.equal(urgentReplyFor("गर्भवती हूँ और खून आ रहा है"), URGENT_REPLY_HI);
  assert.equal(urgentReplyFor("sex ke baad khoon"), URGENT_REPLY);
  assert.match(URGENT_REPLY, /112/);
  assert.match(URGENT_REPLY, /14416/);
  assert.match(URGENT_REPLY_HI, /112/);
  assert.match(URGENT_REPLY_HI, /14416/);
});

test("offline answers escalate red flags the old keywords missed", () => {
  for (const question of ["bleeding after sex", "I passed out", "pregnant with cramps", "हर घंटे पैड भर जाता है"]) {
    assert.equal(matchLocalAnswer(question)?.source, URGENT_SAFETY_SOURCE, question);
  }
  assert.equal(matchLocalAnswer("हर घंटे पैड भर जाता है")?.text, URGENT_REPLY_HI);
  // An ordinary question still gets its topic answer.
  assert.match(matchLocalAnswer("Is brown blood normal?")?.text ?? "", /Dark brown blood/);
});
