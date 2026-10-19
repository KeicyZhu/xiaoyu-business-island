async function checkTwinRecovery(page) {
  const checks = [];
  const scratch = await page.context().newPage();
  try {
    await scratch.goto("http://127.0.0.1:4173/");
    await scratch.evaluate(() =>
      localStorage.setItem("xiaoyu-twin-campaign-v1", '{"broken":true}'),
    );
    await scratch.reload();
    await scratch
      .locator('[data-track="brand"]')
      .click({ noWaitAfter: true, timeout: 60000 });
    await scratch
      .locator('.mission-tabs [data-tab="deliverable"]')
      .click({ noWaitAfter: true });
    await scratch
      .locator("[data-c-report]")
      .fill(
        "测试损坏存档恢复：输入新方案不能静默覆盖原来无法读取的数据，先导出原始内容再决定是否重置。",
      );
    if (
      (await scratch.evaluate(() =>
        localStorage.getItem("xiaoyu-twin-campaign-v1"),
      )) !== '{"broken":true}'
    )
      throw Error("Corrupt save overwritten");
    checks.push("corrupt original retained after editing");
    const [download] = await Promise.all([
      scratch.waitForEvent("download"),
      scratch
        .locator('[data-save-warning] [data-c-act="export"]')
        .click({ noWaitAfter: true }),
    ]);
    await download.saveAs("output/playwright/twin-corrupt-backup.json");
    checks.push("raw backup download");
    await scratch.evaluate(() =>
      localStorage.removeItem("xiaoyu-twin-campaign-v1"),
    );
    await scratch.reload();
    await scratch
      .locator('[data-track="brand"]')
      .click({ noWaitAfter: true, timeout: 60000 });
    await scratch
      .locator('.mission-tabs [data-tab="questions"]')
      .click({ noWaitAfter: true });
    await scratch.locator('[data-c-act="grade"]').click({ noWaitAfter: true });
    const q = await scratch.evaluate(async () =>
      (
        await import("./src/campaigns-data.js")
      ).campaigns[1].missions[0].questions.find((q) => q.type === "number"),
    );
    await scratch.locator(`[data-c-number="${q.id}"]`).fill(String(q.answer));
    if (
      !(await scratch
        .locator(`[data-question-id="${q.id}"] .question-feedback.correct`)
        .count())
    )
      throw Error("Feedback stale");
    checks.push("corrected numeric feedback updates immediately");
    return { passed: true, checks };
  } finally {
    await scratch.close();
    await page.bringToFront();
  }
}
