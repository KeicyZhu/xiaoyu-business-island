import test from "node:test";
import assert from "node:assert/strict";
import { single, multi, numeric, order } from "../src/campaign-question.js";
const engine = await import("../src/campaigns-state.js").catch(() => ({}));
const questions = [
  single("s", "判断", ["A", "B"], 1, "B"),
  multi("m", "多选", ["A", "B", "C"], [0, 2], "A/C"),
  numeric("n", "计算", 2.5, 0.01, "万元", "2.5"),
  order("o", "顺序", ["验收", "调查", "上线"], [1, 0, 2], "先调查"),
];
const mission = (id) => ({
  id,
  questions,
  deliverable: { checklist: ["证据", "计算", "风险", "验证"] },
  decisions: [
    {
      id: "safe",
      effect: { budget: -2, readiness: 10, trust: 5 },
      consequence: "小规模验证",
    },
    {
      id: "rush",
      effect: { budget: -5, readiness: 2, trust: -15 },
      consequence: "返工风险",
    },
  ],
});
const campaigns = [
  {
    id: "a",
    initial: { budget: 10, readiness: 20, trust: 60 },
    missions: [mission("a1"), mission("a2")],
  },
  {
    id: "b",
    initial: { budget: 8, readiness: 10, trust: 50 },
    missions: [mission("b1")],
  },
];
const draft = {
  decisionId: "safe",
  answer:
    "先核对证据和数据口径，然后说明方案、风险与验证办法，形成可交接的任务说明，并确定责任人、验收时间与回滚条件。",
  checks: [0, 1, 2, 3],
  answers: { s: 1, m: [0, 2], n: "2.5", o: [1, 0, 2] },
};
test("campaign engine exposes immutable versioned progress", () => {
  assert.equal(typeof engine.createCampaignState, "function");
  const s = engine.createCampaignState();
  assert.equal(s.version, "1.0.0");
  assert.deepEqual(s.events, []);
});
test("question types validate strict inputs and exact multi/order sets", () => {
  assert.equal(typeof engine.gradeQuestion, "function");
  assert.equal(engine.gradeQuestion(questions[0], 1), true);
  assert.equal(engine.gradeQuestion(questions[0], "1"), false);
  assert.equal(engine.gradeQuestion(questions[1], [2, 0]), true);
  assert.equal(engine.gradeQuestion(questions[1], [0, 0, 2]), false);
  assert.equal(engine.gradeQuestion(questions[1], [0, 1, 2]), false);
  assert.equal(engine.gradeQuestion(questions[2], "2.50"), true);
  for (const x of ["", null, "Infinity", "2.5x", [], true])
    assert.equal(engine.gradeQuestion(questions[2], x), false);
  assert.equal(engine.gradeQuestion(questions[3], [1, 0, 2]), true);
  assert.equal(engine.gradeQuestion(questions[3], [0, 1, 2]), false);
});
test("locked mission cannot save, complete or grant effects", () => {
  const s = engine.createCampaignState();
  assert.equal(
    engine.reduceCampaign(
      s,
      { type: "DRAFT", campaignId: "a", missionId: "a2", draft },
      campaigns,
    ),
    s,
  );
  assert.equal(
    engine.reduceCampaign(
      s,
      { type: "COMPLETE", campaignId: "a", missionId: "a2" },
      campaigns,
    ),
    s,
  );
  assert.equal(engine.isMissionUnlocked(s, campaigns[0], 1), false);
});
test("missing objective answers or self-check blocks completion", () => {
  let s = engine.createCampaignState();
  s = engine.reduceCampaign(
    s,
    {
      type: "DRAFT",
      campaignId: "a",
      missionId: "a1",
      draft: { ...draft, answers: { ...draft.answers, s: 0 } },
    },
    campaigns,
  );
  assert.equal(
    engine.reduceCampaign(
      s,
      { type: "COMPLETE", campaignId: "a", missionId: "a1" },
      campaigns,
    ),
    s,
  );
  assert.equal(
    engine.assessMission(campaigns[0].missions[0], s.drafts.a1).correct,
    3,
  );
  for (const bad of [
    { ...draft, checks: [0, 0, 0] },
    { ...draft, checks: [0, 1, 9] },
    { ...draft, decisionId: "fake" },
    { ...draft, answer: "短" },
  ]) {
    assert.equal(
      engine.assessMission(campaigns[0].missions[0], bad).ready,
      false,
    );
  }
});
test("complete both tracks with carry-forward decisions and idempotent rewards", () => {
  let s = engine.createCampaignState();
  for (const c of campaigns)
    for (const m of c.missions) {
      s = engine.reduceCampaign(
        s,
        { type: "DRAFT", campaignId: c.id, missionId: m.id, draft },
        campaigns,
      );
      s = engine.reduceCampaign(
        s,
        { type: "COMPLETE", campaignId: c.id, missionId: m.id },
        campaigns,
      );
      assert.ok(s.completed[m.id]);
      assert.equal(
        engine.reduceCampaign(
          s,
          { type: "COMPLETE", campaignId: c.id, missionId: m.id },
          campaigns,
        ),
        s,
      );
    }
  assert.deepEqual(engine.campaignMetrics(s, campaigns[0]), {
    budget: 6,
    readiness: 40,
    trust: 70,
    completed: 2,
  });
  assert.deepEqual(engine.campaignMetrics(s, campaigns[1]), {
    budget: 6,
    readiness: 20,
    trust: 55,
    completed: 1,
  });
  const imported = engine.deserializeCampaign(
    engine.serializeCampaign(s),
    campaigns,
  );
  assert.deepEqual(imported, s);
});
test("changing a draft cannot alter a completed decision or other track", () => {
  let s = engine.createCampaignState();
  s = engine.reduceCampaign(
    s,
    { type: "DRAFT", campaignId: "a", missionId: "a1", draft },
    campaigns,
  );
  s = engine.reduceCampaign(
    s,
    { type: "COMPLETE", campaignId: "a", missionId: "a1" },
    campaigns,
  );
  assert.equal(
    engine.reduceCampaign(
      s,
      {
        type: "DRAFT",
        campaignId: "a",
        missionId: "a1",
        draft: { ...draft, decisionId: "rush" },
      },
      campaigns,
    ),
    s,
  );
  assert.equal(engine.campaignMetrics(s, campaigns[1]).budget, 8);
});
test("save import rejects fabricated completions, corrupt IDs, oversized or wrong versions", () => {
  const s = engine.createCampaignState();
  for (const payload of [
    { ...s, version: "9" },
    { ...s, events: [{ type: "COMPLETE", campaignId: "a", missionId: "a2" }] },
    {
      ...s,
      events: [
        { type: "DRAFT", campaignId: "a", missionId: "__proto__", draft },
      ],
    },
  ])
    assert.throws(() =>
      engine.deserializeCampaign(JSON.stringify(payload), campaigns),
    );
  assert.throws(() =>
    engine.deserializeCampaign(" ".repeat(2 * 1024 * 1024 + 1), campaigns),
  );
  const extra = JSON.parse(engine.serializeCampaign(s));
  extra.completed = { a2: {} };
  assert.deepEqual(
    engine.deserializeCampaign(JSON.stringify(extra), campaigns).completed,
    {},
  );
});
test("drafts coalesce to keep long reports exportable without losing submitted choices", () => {
  let s = engine.createCampaignState();
  for (let i = 0; i < 30; i++)
    s = engine.reduceCampaign(
      s,
      {
        type: "DRAFT",
        campaignId: "a",
        missionId: "a1",
        draft: { ...draft, answer: "数据".repeat(2000) + i },
      },
      campaigns,
    );
  assert.equal(s.events.length, 1);
  assert.deepEqual(
    engine.deserializeCampaign(engine.serializeCampaign(s), campaigns),
    s,
  );
});
test("actual twin curriculum has 16 sourced stages and 96 uniquely keyed mixed exercises", async () => {
  const { campaigns: actual, caseSources } = await import(
    "../src/campaigns-data.js"
  );
  assert.equal(actual.length, 2);
  const ids = new Set();
  let total = 0;
  for (const c of actual) {
    assert.equal(c.missions.length, 8);
    for (const m of c.missions) {
      assert.equal(m.questions.length, 6);
      assert.equal(m.concepts.length, 3);
      assert.equal(m.deliverable.checklist.length, 4);
      for (const id of m.realCase.sourceIds) assert.ok(caseSources[id], id);
      assert.deepEqual(
        new Set(m.questions.map((q) => q.type)),
        new Set(["single", "multi", "number", "order"]),
      );
      for (const q of m.questions) {
        assert.ok(!ids.has(q.id), q.id);
        ids.add(q.id);
        assert.ok(q.explanation.length > 15);
        assert.equal(
          engine.gradeQuestion(
            q,
            q.type === "number" ? String(q.answer) : q.answer,
          ),
          true,
        );
        total++;
      }
    }
  }
  assert.equal(total, 96);
});
test("both real campaign routes support complete replay and resource carry-forward", async () => {
  const { campaigns: actual } = await import("../src/campaigns-data.js");
  let s = engine.createCampaignState();
  for (const c of actual) {
    for (const m of c.missions) {
      const d = {
        ...draft,
        decisionId: m.decisions[0].id,
        answers: Object.fromEntries(
          m.questions.map((q) => [
            q.id,
            q.type === "number" ? String(q.answer) : q.answer,
          ]),
        ),
      };
      s = engine.reduceCampaign(
        s,
        { type: "DRAFT", campaignId: c.id, missionId: m.id, draft: d },
        actual,
      );
      s = engine.reduceCampaign(
        s,
        { type: "COMPLETE", campaignId: c.id, missionId: m.id },
        actual,
      );
      assert.ok(s.completed[m.id], m.id);
    }
    assert.equal(engine.campaignMetrics(s, c).completed, 8);
    assert.ok(engine.campaignMetrics(s, c).budget >= 0);
  }
  assert.deepEqual(
    engine.deserializeCampaign(engine.serializeCampaign(s), actual),
    s,
  );
});
