// Isolated browser QA; clears only this test profile's twin save.
async function checkTwin(page) {
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/");
  await prepareLearningFixture(page);
  await page.evaluate(() => localStorage.removeItem("xiaoyu-twin-campaign-v1"));
  await page.reload();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".archipelago-scene.archipelago-ready").length === 1,
  );
  const tracks = await page.evaluate(
    async () => (await import("./src/campaigns-data.js")).campaigns,
  );
  const click = (s) => page.locator(s).first().click({ noWaitAfter: true });
  for (const track of tracks) {
    await click(`[data-c-act="enter"][data-track="${track.id}"]`);
    if (
      !(await page.locator('[data-c-act="stage"][data-index="1"]').isDisabled())
    )
      throw Error("Later stage unlocked too early");
    for (const mission of track.missions) {
      await click('[data-tab="decision"]');
      await page
        .locator(
          `input[name="campaign-decision"][value="${mission.decisions[0].id}"]`,
        )
        .check();
      await click('[data-tab="questions"]');
      if (mission === track.missions[0]) await click('[data-c-act="grade"]');
      for (const q of mission.questions) {
        if (q.type === "number")
          await page
            .locator(`[data-c-number="${q.id}"]`)
            .fill(String(q.answer));
        if (q.type === "single")
          await page
            .locator(`[data-c-question="${q.id}"][value="${q.answer}"]`)
            .check();
        if (q.type === "multi")
          for (const n of q.answer)
            await page
              .locator(`[data-c-question="${q.id}"][value="${n}"]`)
              .check();
        if (q.type === "order")
          for (const n of q.answer)
            await click(
              `[data-c-act="order"][data-q="${q.id}"][data-option="${n}"]`,
            );
      }
      await click('[data-c-act="grade"]');
      if (await page.locator(".question-feedback.incorrect").count())
        throw Error("Correct answers graded wrong " + mission.id);
      await click('[data-tab="deliverable"]');
      await page
        .locator("[data-c-report]")
        .fill(
          `本阶段选择${mission.decisions[0].title}。先根据公开案例与仿真材料核对指标口径，明确${mission.objective}。由产品、数据和运营分别确认责任人、上线前验收、异常回退、成本护栏及后续交付时间。`,
        );
      for (let i = 0; i < 4; i++)
        await page.locator(`[data-c-check="${i}"]`).check();
      await click('[data-c-act="complete"]');
      if (!(await page.locator('[data-c-act="next"]').count()))
        throw Error("Stage not complete " + mission.id);
      await click('[data-c-act="next"]');
    }
    await click('[data-c-act="home"]');
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".archipelago-scene.archipelago-ready").length === 1,
      {},
      { timeout: 90000 },
    );
  }
  const saved = await page.evaluate(() =>
    localStorage.getItem("xiaoyu-twin-campaign-v1"),
  );
  await page.reload();
  await click('[data-c-act="report"]');
  if ((await page.locator(".report-mission").count()) !== 16)
    throw Error("Missing project records");
  const progress = await page.evaluate(async () => {
    const { campaigns } = await import("./src/campaigns-data.js");
    const { deserializeCampaign, campaignMetrics } = await import(
      "./src/campaigns-state.js"
    );
    const s = deserializeCampaign(
      localStorage.getItem("xiaoyu-twin-campaign-v1"),
      campaigns,
    );
    return campaigns.map((c) => ({ id: c.id, ...campaignMetrics(s, c) }));
  });
  if (progress.some((x) => x.completed !== 8)) throw Error("Replay failed");
  if (errors.length) throw Error(errors.join("\n"));
  return {
    passed: true,
    stages: 16,
    questions: 96,
    progress,
    saveBytes: new TextEncoder().encode(saved).length,
  };
}
