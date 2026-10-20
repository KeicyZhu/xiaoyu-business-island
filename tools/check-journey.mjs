// Browser QA fixture uses only valid reducer events in an isolated test profile.
// It is never loaded by the production game and is not demo footage.
async function prepareLearningFixture(page, count = 11) {
  await page.evaluate(async (count) => {
    const { lessons } = await import("./src/curriculum.js");
    const { createState, reduce, serializeState } = await import(
      "./src/state.js"
    );
    let state = createState();
    for (const lesson of lessons.slice(0, count)) {
      const apply = (event) => {
        state = reduce(state, { ...event, lessonId: lesson.id }, lessons);
      };
      apply({ type: "LEARN" });
      apply({
        type: "CASE",
        answer:
          "浏览器测试：核对案例市场与指标口径，写出方案、风险及验证办法，再按明确标准自查。",
        checkedCount: 3,
      });
      for (const q of lesson.questions)
        apply({ type: "ANSWER", questionId: q.id, option: q.answer });
      apply({ type: "COMPLETE" });
    }
    localStorage.setItem("xiaoyu-island-save-v1", serializeState(state));
  }, count);
  await page.reload();
}
async function checkJourney(page) {
  page.setDefaultTimeout(60000);
  await page.goto("http://127.0.0.1:4173/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareLearningFixture(page, 0);
  for (const id of ["double11", "brand"]) {
    const entry = page.locator(`[data-track="${id}"]`);
    if ((await entry.getAttribute("aria-disabled")) !== "true")
      throw Error("Practice not locked");
    // aria-disabled intentionally leaves the explanation reachable via pointer/keyboard.
    await entry.dispatchEvent("click");
    if (await page.locator(".mission-tabs").count())
      throw Error("Locked entry bypassed");
  }
  await page.locator('[data-destination="learning"] button').click();
  if ((await page.locator(".map-node").count()) !== 11)
    throw Error("Learning lessons missing");
  await page.locator('.nav-item[data-screen="twin"]').click();
  await prepareLearningFixture(page, 10);
  if (
    (await page
      .locator('[data-track="brand"]')
      .getAttribute("aria-disabled")) !== "true"
  )
    throw Error("Ten lessons unlock practice");
  // Finish the last lesson through the actual UI, including graduation CTA.
  await page.locator('[data-destination="learning"] button').click();
  await page.locator('[data-open="10"]').first().click();
  for (let i = 0; i < 3; i++)
    await page.locator('[data-action="concept-next"]').click();
  await page
    .locator("#case-answer")
    .fill(
      "核对公开证据与仿真假设，先确认贡献和现金指标，再选择分阶段上线，写明风险、停止条件和负责人。",
    );
  await page.locator('[data-action="case-reveal"]').click();
  for (let i = 0; i < 3; i++)
    await page.locator(`input[name="rubric"][value="${i}"]`).check();
  await page.locator('[data-action="case-complete"]').click();
  const questions = await page.evaluate(async () =>
    (await import("./src/curriculum.js")).lessons.flatMap((l) => l.questions),
  );
  for (let i = 0; i < 5; i++) {
    const prompt = await page.locator(".question-title").textContent();
    const question = questions.find((q) => q.prompt === prompt);
    if (!question) throw Error("Unknown graduation question");
    await page.locator(`[data-choice="${question.answer}"]`).click();
    await page.locator('[data-action="quiz-submit"]').click();
    await page.locator('[data-action="quiz-next"]').click();
  }
  await page.locator('[data-action="after-run"]').click();
  await page.locator('[data-action="ending-practice"]').click();
  if (await page.locator("#lesson-dialog").isVisible())
    throw Error("Graduation dialog stayed open");
  for (const id of ["double11", "brand"]) {
    await page.locator(`[data-track="${id}"]`).click();
    if ((await page.locator('[data-c-act="stage"]').count()) !== 8)
      throw Error("Stage list missing");
    await page.locator('[data-c-act="home"]').click();
  }
  return {
    passed: true,
    learning: 11,
    independentlyUnlocked: ["double11", "brand"],
    parkourRequired: false,
  };
}
