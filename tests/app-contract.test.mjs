import test from "node:test";
import assert from "node:assert/strict";
import { lessons } from "../src/curriculum.js";
import {
  createState,
  reduce,
  deserializeState,
  serializeState,
  getStats,
} from "../src/state.js";
test("all eleven lessons can be completed using UI event contracts then restored", () => {
  let state = createState();
  for (const l of lessons) {
    const send = (event) => {
      state = reduce(state, { lessonId: l.id, ...event }, lessons);
    };
    send({ type: "LEARN" });
    send({
      type: "DRAFT",
      answer:
        "我会先核对业务目标与成本口径，再用对照实验验证方案是否带来增量。",
    });
    send({
      type: "CASE",
      answer:
        "我会先核对业务目标与成本口径，再用对照实验验证方案是否带来增量。",
      checkedCount: 3,
    });
    for (const q of l.questions)
      send({ type: "ANSWER", questionId: q.id, option: q.answer });
    send({ type: "COMPLETE" });
  }
  assert.equal(getStats(state, lessons).completed, 11);
  assert.deepEqual(deserializeState(serializeState(state), lessons), state);
});
