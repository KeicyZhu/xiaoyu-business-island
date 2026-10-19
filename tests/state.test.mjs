import test from "node:test";
import assert from "node:assert/strict";
const engine = await import("../src/state.js").catch(() => ({}));
const lessons = [
  {
    id: "a",
    caseStudy: { rubric: ["目标", "证据", "行动", "验证"] },
    questions: [
      { id: "q1", options: ["A", "B"], answer: 1 },
      { id: "q2", options: ["A", "B"], answer: 0 },
    ],
  },
  {
    id: "b",
    caseStudy: { rubric: ["目标", "证据", "行动", "验证"] },
    questions: [{ id: "q3", options: ["A", "B"], answer: 0 }],
  },
];
const answer = "先核对毛利和履约成本，然后小预算测试素材并记录转化结果。";
function run(events) {
  return events.reduce(
    (s, e) => engine.reduce(s, e, lessons),
    engine.createState(),
  );
}
const start = [
  { type: "LEARN", lessonId: "a" },
  { type: "CASE", lessonId: "a", answer, checkedCount: 3 },
];
const finish = [
  ...start,
  { type: "ANSWER", lessonId: "a", questionId: "q1", option: 0 },
  { type: "ANSWER", lessonId: "a", questionId: "q1", option: 1 },
  { type: "ANSWER", lessonId: "a", questionId: "q2", option: 0 },
  { type: "COMPLETE", lessonId: "a" },
];
test("exports state API", () =>
  assert.equal(typeof engine.createState, "function"));
test("locked lessons and invalid order cannot mutate state", () => {
  const s = engine.createState();
  for (const e of [
    { type: "LEARN", lessonId: "b" },
    { type: "CASE", lessonId: "a", answer, checkedCount: 3 },
    { type: "ANSWER", lessonId: "a", questionId: "q1", option: 1 },
    { type: "COMPLETE", lessonId: "a" },
    { type: "UNKNOWN" },
    { type: "LEARN", lessonId: "__proto__" },
  ])
    assert.equal(engine.reduce(s, e, lessons), s);
  assert.equal(engine.isUnlocked(s, 0, lessons), true);
  assert.equal(engine.isUnlocked(s, 1, lessons), false);
});
test("case requires meaningful answer and explicit self-check", () => {
  const s = run(start.slice(0, 1));
  for (const e of [
    { answer: "short", checkedCount: 3 },
    { answer, checkedCount: 2 },
    { answer: 123, checkedCount: 3 },
  ])
    assert.equal(
      engine.reduce(s, { type: "CASE", lessonId: "a", ...e }, lessons),
      s,
    );
  assert.equal(engine.getProgress(run(start), "a").caseDone, true);
});
test("case self-check count cannot exceed the actual rubric, including imported saves", () => {
  const learned = run(start.slice(0, 1));
  for (const checkedCount of [3, 4]) {
    const next = engine.reduce(
      learned,
      { type: "CASE", lessonId: "a", answer, checkedCount },
      lessons,
    );
    assert.equal(engine.getProgress(next, "a").caseDone, true);
    assert.deepEqual(
      engine.deserializeState(engine.serializeState(next), lessons),
      next,
    );
  }
  for (const checkedCount of [5, 100]) {
    const event = { type: "CASE", lessonId: "a", answer, checkedCount };
    assert.equal(engine.reduce(learned, event, lessons), learned);
    const forged = {
      version: engine.RULES_VERSION,
      seed: learned.seed,
      events: [...learned.events, event],
    };
    assert.throws(() =>
      engine.deserializeState(JSON.stringify(forged), lessons),
    );
  }
});
test("wrong answers can be corrected; all questions required and rewards idempotent", () => {
  let s = run(finish.slice(0, 3));
  assert.equal(
    engine.reduce(s, { type: "COMPLETE", lessonId: "a" }, lessons),
    s,
  );
  s = run(finish);
  assert.equal(engine.getProgress(s, "a").completed, true);
  assert.equal(engine.isUnlocked(s, 1, lessons), true);
  for (const type of ["LEARN", "COMPLETE"])
    assert.equal(engine.reduce(s, { type, lessonId: "a" }, lessons), s);
  assert.deepEqual(engine.getStats(s, lessons), {
    completed: 1,
    total: 2,
    books: 1,
    clues: 1,
    rewards: 1,
    correct: 2,
    attempts: 3,
    accuracy: (2 / 3) * 100,
  });
});
test("invalid answer indices and question IDs ignored", () => {
  const s = run(start);
  for (const e of [
    { questionId: "q1", option: 2 },
    { questionId: "q1", option: -1 },
    { questionId: "q1", option: "1" },
    { questionId: "missing", option: 0 },
  ])
    assert.equal(
      engine.reduce(s, { type: "ANSWER", lessonId: "a", ...e }, lessons),
      s,
    );
});
test("draft is safe text, immutable, bounded, and cannot bypass lock", () => {
  const s = engine.createState();
  const text = "<img src=x onerror=alert(1)>";
  const n = engine.reduce(
    s,
    { type: "DRAFT", lessonId: "a", answer: text },
    lessons,
  );
  assert.equal(engine.getProgress(n, "a").caseAnswer, text);
  assert.deepEqual(s.progress, {});
  for (const e of [
    { lessonId: "b", answer },
    { lessonId: "a", answer: {} },
    { lessonId: "a", answer: "x".repeat(20001) },
  ])
    assert.equal(engine.reduce(s, { type: "DRAFT", ...e }, lessons), s);
});
test("review requires completed lesson and settings are boolean", () => {
  const e = { type: "REVIEW", lessonId: "a", questionId: "q1", option: 1 };
  const s = run(start);
  assert.equal(engine.reduce(s, e, lessons), s);
  const n = engine.reduce(run(finish), e, lessons);
  assert.equal(engine.getProgress(n, "a").review.q1[0].correct, true);
  assert.equal(
    engine.reduce(s, { type: "SETTINGS", reducedMotion: "true" }, lessons),
    s,
  );
  assert.equal(
    engine.reduce(s, { type: "SETTINGS", reducedMotion: true }, lessons)
      .settings.reducedMotion,
    true,
  );
});
test("save import and deterministic replay match state", () => {
  const s = run(finish.map((e, i) => ({ ...e, at: i })));
  assert.deepEqual(engine.replay(s.events, lessons, s.seed), s);
  assert.deepEqual(
    engine.deserializeState(engine.serializeState(s), lessons),
    s,
  );
  const hacked = JSON.parse(engine.serializeState(s));
  hacked.progress = { b: { completed: true } };
  assert.equal(
    engine.getProgress(
      engine.deserializeState(JSON.stringify(hacked), lessons),
      "b",
    ).completed,
    false,
  );
});
test("malformed, oversized, wrong-version and invalid event saves throw", () => {
  for (const raw of [
    "{",
    "null",
    "[]",
    JSON.stringify({ version: "bad", seed: 1, events: [] }),
    JSON.stringify({
      version: "1.0.0",
      seed: 1,
      events: [{ type: "LEARN", lessonId: "b" }],
    }),
    JSON.stringify({
      version: "1.0.0",
      seed: 1,
      events: Array(10001).fill({ type: "SETTINGS", reducedMotion: true }),
    }),
    " ".repeat(2000001),
  ])
    assert.throws(() => engine.deserializeState(raw, lessons));
});
test("seeded shuffle preserves inputs and repeats", () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(engine.shuffle(a, 13), engine.shuffle(a, 13));
  assert.deepEqual(a, [1, 2, 3, 4, 5]);
  assert.deepEqual(engine.shuffle(a, 13).sort(), a);
});
test("long Chinese drafts coalesce and exported saves roundtrip without redundant snapshot", () => {
  let s = engine.createState();
  for (let i = 0; i < 110; i++)
    s = engine.reduce(
      s,
      {
        type: "DRAFT",
        lessonId: "a",
        answer: String(i) + "甲".repeat(19990),
        at: i,
      },
      lessons,
    );
  assert.equal(s.events.filter((e) => e.type === "DRAFT").length, 1);
  const raw = engine.serializeState(s);
  assert.equal(Object.hasOwn(JSON.parse(raw), "progress"), false);
  assert.deepEqual(engine.deserializeState(raw, lessons), s);
  assert.deepEqual(engine.replay(s.events, lessons, s.seed), s);
});
test("coalescing drafts across case submission retains valid replay when reverting answer", () => {
  let s = run([{ type: "DRAFT", lessonId: "a", answer: "最初草稿" }, ...start]);
  s = engine.reduce(
    s,
    { type: "DRAFT", lessonId: "a", answer: "后续草稿" },
    lessons,
  );
  s = engine.reduce(s, { type: "DRAFT", lessonId: "a", answer }, lessons);
  assert.equal(engine.getProgress(s, "a").caseAnswer, answer);
  assert.deepEqual(engine.replay(s.events, lessons, s.seed), s);
  s = engine.reduce(
    s,
    { type: "DRAFT", lessonId: "a", answer: "最终草稿" },
    lessons,
  );
  assert.deepEqual(
    engine.deserializeState(engine.serializeState(s), lessons),
    s,
  );
});
test("save size is checked as UTF8 bytes against exported common limit", () => {
  assert.equal(engine.MAX_SAVE_BYTES, 5 * 1024 * 1024);
  const raw = JSON.stringify({
    version: engine.RULES_VERSION,
    seed: 1,
    events: [],
    padding: "甲".repeat(1800000),
  });
  assert.throws(() => engine.deserializeState(raw, lessons));
});

test("clearing only draft restores canonical initial state", () => {
  const s = run([
    { type: "DRAFT", lessonId: "a", answer: "hello" },
    { type: "DRAFT", lessonId: "a", answer: "" },
  ]);
  assert.deepEqual(
    engine.deserializeState(engine.serializeState(s), lessons),
    s,
  );
});
