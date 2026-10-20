import test from "node:test";
import assert from "node:assert/strict";
import { lessons } from "../src/curriculum.js";
import { campaigns } from "../src/campaigns-data.js";
import {
  createState,
  reduce,
  serializeState,
  deserializeState,
} from "../src/state.js";
import {
  createCampaignState,
  reduceCampaign,
  serializeCampaign,
  deserializeCampaign,
} from "../src/campaigns-state.js";
const journey = await import("../src/journey.js").catch(() => ({}));
function learning(count) {
  let state = createState();
  for (const lesson of lessons.slice(0, count)) {
    const apply = (event) => {
      state = reduce(state, { ...event, lessonId: lesson.id }, lessons);
    };
    apply({ type: "LEARN" });
    apply({
      type: "CASE",
      answer:
        "核对现实案例的市场边界及仿真数据，并确定指标、方案、风险和后续验证办法。",
      checkedCount: 3,
    });
    for (const q of lesson.questions)
      apply({ type: "ANSWER", questionId: q.id, option: q.answer });
    apply({ type: "COMPLETE" });
  }
  return deserializeState(serializeState(state), lessons);
}
test("practice unlocks only after all eleven learning lessons, with no parkour requirement", () => {
  assert.equal(typeof journey.getJourneyProgress, "function");
  for (const n of [0, 1, 10, 11]) {
    const p = journey.getJourneyProgress(learning(n), lessons);
    assert.equal(p.completed, n);
    assert.equal(p.total, 11);
    assert.equal(p.practiceUnlocked, n === 11);
  }
  assert.equal(journey.getJourneyProgress(null, []).practiceUnlocked, false);
});
test("both branches enforce the foundation before writing and preserve old replay", () => {
  assert.equal(typeof journey.reducePractice, "function");
  for (const track of campaigns) {
    const mission = track.missions[0];
    const event = {
      type: "DRAFT",
      campaignId: track.id,
      missionId: mission.id,
      draft: {
        decisionId: mission.decisions[0].id,
        answer: "原版本保存的项目草稿，继续保留。",
        checks: [],
        answers: {},
      },
    };
    const empty = createCampaignState();
    assert.equal(
      journey.reducePractice(empty, event, campaigns, learning(10), lessons),
      empty,
    );
    const old = reduceCampaign(empty, event, campaigns);
    const restored = deserializeCampaign(serializeCampaign(old), campaigns);
    assert.deepEqual(restored.drafts, old.drafts);
    assert.equal(
      journey.reducePractice(
        restored,
        { ...event, draft: { ...event.draft, answer: "禁止未学习改写原存档" } },
        campaigns,
        learning(0),
        lessons,
      ),
      restored,
    );
    const next = journey.reducePractice(
      empty,
      event,
      campaigns,
      learning(11),
      lessons,
    );
    assert.equal(next.drafts[mission.id].answer, event.draft.answer);
    assert.equal(
      journey.reducePractice(
        next,
        { type: "COMPLETE", campaignId: track.id, missionId: mission.id },
        campaigns,
        learning(0),
        lessons,
      ),
      next,
    );
  }
});
