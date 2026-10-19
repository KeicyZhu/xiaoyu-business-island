// Run with playwright-cli run-code --filename=tools/check-labels.mjs.
async function checkLabels(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4173/");
  await page
    .locator('[data-screen="map"]')
    .first()
    .click({ noWaitAfter: true });
  await page.waitForSelector(".scene-ready");
  const results = [];
  for (const width of [1512, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const labels = await page.locator(".node-label").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          text: n.textContent,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      }),
    );
    for (const a of labels) {
      if (a.x < 0 || a.right > width || a.w === 0 || a.h === 0)
        throw new Error(`${width}px name clipped: ${a.text}`);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i],
          b = labels[j];
        if (
          a.x < b.right - 1 &&
          b.x < a.right - 1 &&
          a.y < b.bottom - 1 &&
          b.y < a.bottom - 1
        )
          throw new Error(`${width}px names overlap: ${a.text}/${b.text}`);
      }
    await page.screenshot({
      path: `output/playwright/m03-${width}.png`,
      fullPage: true,
      timeout: 30000,
      animations: "disabled",
    });
    results.push({ width, visible: labels.length, overlap: false });
  }
  return { passed: true, results };
}
