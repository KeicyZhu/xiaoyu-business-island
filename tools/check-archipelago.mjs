async function checkArchipelago(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:4173/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector(".archipelago-ready");
  const sizes = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const result = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("[data-destination]")].map(
        (el) => ({
          id: el.dataset.destination,
          r: el.getBoundingClientRect().toJSON(),
        }),
      );
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        labels,
      };
    });
    if (result.overflow) throw Error("Page overflow " + width);
    for (const { id, r } of result.labels)
      if (r.left < 0 || r.right > width)
        throw Error(`Label clipped ${width} ${id}`);
    for (let i = 0; i < result.labels.length; i++)
      for (let j = i + 1; j < result.labels.length; j++) {
        const a = result.labels[i].r,
          b = result.labels[j].r;
        if (
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        )
          throw Error("Labels overlap " + width);
      }
    await page.screenshot({
      path: `output/playwright/three-map-${width}.png`,
      fullPage: true,
    });
    sizes.push({ width, labels: 3, overflow: false });
  }
  const extension = await page.evaluate(() => {
    const gl = document
      .querySelector(".archipelago-canvas")
      .getContext("webgl2");
    window.__qaLoss = gl.getExtension("WEBGL_lose_context");
    window.__qaLoss?.loseContext();
    return Boolean(window.__qaLoss);
  });
  if (!extension) throw Error("Context loss extension unavailable");
  await page.waitForSelector(".archipelago-scene.scene-unavailable");
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (await page.locator(".archipelago-canvas").isVisible())
    throw Error("Lost context masks fallback");
  await page.evaluate(() => window.__qaLoss.restoreContext());
  await page.waitForSelector(".archipelago-ready:not(.scene-unavailable)");
  await page.screenshot({
    path: "output/playwright/three-map-restored.png",
    fullPage: true,
  });
  const fallback = await page.context().newPage();
  try {
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : original.call(this, type, ...args);
      };
    });
    await fallback.goto("http://127.0.0.1:4173/");
    await fallback.waitForSelector(".scene-unavailable");
    if ((await fallback.locator("[data-destination]").count()) !== 3)
      throw Error("Fallback lost islands");
    await fallback.locator('[data-destination="learning"] button').click();
    await fallback.locator('[data-open="0"]').first().click();
    if (!(await fallback.locator("#lesson-dialog").isVisible()))
      throw Error("Fallback cannot learn");
  } finally {
    await fallback.close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  return {
    passed: true,
    sizes,
    contextRestore: true,
    noWebGLLearning: true,
    errors,
  };
}
