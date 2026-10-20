async function checkTwinLayout(page) {
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.setDefaultTimeout(60000);
  await page.goto("http://127.0.0.1:4173/");
  await prepareLearningFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page
      .locator('[data-screen="twin"]')
      .first()
      .click({ noWaitAfter: true });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".archipelago-scene.archipelago-ready").length === 1,
      {},
      { timeout: 60000 },
    );
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Homeoverflow" + width);
    await page.screenshot({
      path: `output/playwright/twin-${width}.png`,
      fullPage: true,
      timeout: 30000,
      animations: "disabled",
    });
    await page.locator('[data-track="brand"]').click({ noWaitAfter: true });
    if (await page.locator(".campaign-report").count()) continue;
    for (const tab of ["brief", "decision", "questions", "deliverable"]) {
      await page
        .locator(`.mission-tabs [data-tab="${tab}"]`)
        .click({ noWaitAfter: true });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error(tab + " overflow " + width);
      if (tab === "brief")
        await page.screenshot({
          path: `output/playwright/twin-mission-${width}.png`,
          fullPage: true,
          timeout: 30000,
          animations: "disabled",
        });
    }
  }
  const checks = await page.evaluate(async () => {
    const urls = [
      "assets/gtm/annual-plan.png",
      "assets/gtm/message-house.png",
      "assets/gtm/unreviewed.png",
    ];
    return Promise.all(
      urls.map(async (url) => ({ url, status: (await fetch(url)).status })),
    );
  });
  if (
    checks[0].status !== 200 ||
    checks[1].status !== 200 ||
    checks[2].status !== 404
  )
    throw Error("Reference image whitelist");
  if (problems.length) throw Error(problems.join(";"));
  return { passed: true, viewports: [1440, 390, 320], imageChecks: checks };
}
