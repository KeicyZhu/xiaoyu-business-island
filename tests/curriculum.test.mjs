import test from "node:test";
import assert from "node:assert/strict";
let curriculum;
try {
  curriculum = await import("../src/curriculum.js");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
test("主线包含十一地区及可追溯版本", () => {
  assert.ok(curriculum, "课程文件尚未实现");
  assert.equal(curriculum.CURRICULUM_VERSION, "1.0.0");
  assert.equal(curriculum.lessons.length, 11);
});
test("关卡、概念与题目 ID 唯一，题目能回查已教概念", () => {
  assert.ok(curriculum, "课程文件尚未实现");
  const lessons = curriculum.lessons;
  const concepts = lessons.flatMap((l) => l.concepts.map((c) => c.id));
  const ids = [
    ...lessons.map((l) => l.id),
    ...concepts,
    ...lessons.flatMap((l) => l.questions.map((q) => q.id)),
  ];
  assert.equal(new Set(ids).size, ids.length);
  const taught = new Set();
  for (const l of lessons) {
    assert.ok(l.concepts.length >= 3);
    for (const c of l.concepts) {
      taught.add(c.id);
      for (const key of ["title", "definition", "example", "pitfall"])
        assert.ok(c[key]?.trim());
    }
    assert.ok(l.questions.length >= 4);
    for (const q of l.questions) {
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
      assert.ok(taught.has(q.conceptId), `${q.id}引用未教概念`);
      assert.ok(q.explanation.length > 20);
    }
    assert.ok(
      new Set(l.questions.map((q) => q.answer)).size >= 3,
      `${l.id}答案位置过于一致`,
    );
  }
});
test("每区有案例自查、奖励和公开来源，内容声明为模拟", () => {
  assert.ok(curriculum, "课程文件尚未实现");
  for (const l of curriculum.lessons) {
    for (const key of ["title", "subtitle", "icon", "color", "book", "clue"])
      assert.ok(l[key]);
    assert.match(l.color, /^#[\da-f]{6}$/i);
    for (const key of ["name", "icon", "description"]) assert.ok(l.reward[key]);
    assert.equal(l.caseStudy.rubric.length, 4);
    assert.match(l.caseStudy.scenario, /模拟/);
    assert.ok(l.caseStudy.reference.length > 30);
    assert.equal(new URL(l.source.url).protocol, "https:");
    assert.ok(l.source.label);
  }
});
test("关键数值题与校订口径回归", () => {
  assert.ok(curriculum, "课程文件尚未实现");
  const qs = curriculum.lessons.flatMap((l) => l.questions);
  const correct = (id) => {
    const q = qs.find((q) => q.id === id);
    assert.ok(q, id);
    return q.options[q.answer];
  };
  assert.equal(correct("beach-q1"), "2%");
  assert.equal(correct("ads-q1"), "0.5 元");
  assert.equal(correct("operations-q1"), "1500 元");
  assert.equal(correct("platform-q1"), "20 元");
  assert.equal(correct("final-q1"), "750 元");
});
test("竞价教学区分出价值与实际收入，贡献在首次案例前解释", () => {
  assert.ok(curriculum);
  const auction = curriculum.lessons.find((l) => l.id === "platform");
  const model = auction.concepts.find((c) => c.id === "auction");
  assert.match(model.definition, /按出价估算/);
  assert.match(model.pitfall, /不等于实际/);
  assert.match(
    auction.questions.find((q) => q.id === "platform-q1").explanation,
    /不等于实际/,
  );
  const creative = curriculum.lessons.find((l) => l.id === "creative");
  assert.ok(
    creative.concepts.some(
      (c) =>
        /贡献/.test(c.definition) &&
        /商品/.test(c.definition) &&
        /履约/.test(c.definition) &&
        /广告/.test(c.definition) &&
        /固定/.test(c.definition),
    ),
    "首次考查贡献前应提供定义",
  );
  const final = curriculum.lessons.find((l) => l.id === "final");
  assert.ok(final.caseStudy.rubric.some((s) => /未经证实/.test(s)));
  assert.ok(final.caseStudy.rubric.every((s) => !/不实承诺/.test(s)));
});
