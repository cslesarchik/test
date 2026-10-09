const assert = require("node:assert/strict");
const { test } = require("node:test");
const { scoreMoment } = require("../src/heuristics.js");

const msgs = (...texts) => texts.map((text, i) => ({ author: `p${i}`, text }));
const THRESHOLD = 0.35;

test("celebrations score above the threshold", () => {
  const { score, signals } = scoreMoment(msgs("deploy is green", "WE SHIPPED IT 🎉🎉"));
  assert.ok(score >= THRESHOLD, `score ${score}`);
  assert.ok(signals.includes("celebration"));
});

test("laughter in a draft counts", () => {
  const { score } = scoreMoment(msgs("I accidentally emailed the whole company my grocery list"), "lmao 😂");
  assert.ok(score >= THRESHOLD, `score ${score}`);
});

test("light frustration banter scores", () => {
  const { score } = scoreMoment(msgs("CI broke again", "ugh not again 🙃", "send help"));
  assert.ok(score >= THRESHOLD, `score ${score}`);
});

test("plain work questions stay below the threshold", () => {
  const { score } = scoreMoment(msgs("Can you review PR 412 when you get a chance?", "Which branch should I target?"));
  assert.ok(score < THRESHOLD, `score ${score}`);
});

test("code and long messages are penalized", () => {
  const { score } = scoreMoment(msgs("haha ok", "```const x = () => {}```"));
  assert.ok(score < THRESHOLD, `score ${score}`);
});

test("sensitive topics are vetoed even with strong signals", () => {
  for (const text of [
    "so sorry for your loss, sending love 🙏",
    "layoffs announced today",
    "SEV1 outage in prod omg",
  ]) {
    const r = scoreMoment(msgs("congrats!!! 🎉", text));
    assert.equal(r.blocked, true, text);
    assert.equal(r.score, 0, text);
  }
});

test("a GIF that was just posted suppresses another", () => {
  const r = scoreMoment(msgs("lol 😂", "https://media.giphy.com/media/abc/giphy.gif"));
  assert.equal(r.score, 0);
});

test("empty input is harmless", () => {
  assert.deepEqual(scoreMoment([], ""), { score: 0, signals: [], blocked: false });
});
