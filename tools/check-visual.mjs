// Run with playwright-cli run-code --filename=tools/check-visual.mjs
// Use an isolated browser profile: exercises UI and screenshots, never modifies user saves.
async function checkVisual(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:4173";
  const ready = () => page.waitForSelector(".scene-ready canvas");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 1180 });
  await page.goto(origin);
  await page
    .locator('[data-screen="map"]')
    .first()
    .click({ noWaitAfter: true });
  const priorSave = await page.evaluate(() =>
    localStorage.getItem("xiaoyu-island-save-v1"),
  );
  try {
    await page.evaluate(() => localStorage.removeItem("xiaoyu-island-save-v1"));
    await page.goto(origin);
    await page
      .locator('[data-screen="map"]')
      .first()
      .click({ noWaitAfter: true });
    await ready();
    assert(
      (await page.title()).startsWith("空降之商业女王小玉"),
      "Updated product title missing",
    );
    assert(
      (await page.locator(".node-label:visible").count()) === 11,
      "Every landmark name must be visible initially",
    );
    const before = await page
      .locator('.map-node[data-select="0"]')
      .getAttribute("style");
    await page
      .getByRole("button", { name: "向右旋转地图", exact: true })
      .click();
    const rotated = await page
      .locator('.map-node[data-select="0"]')
      .getAttribute("style");
    assert(before !== rotated, "Camera must move projected markers");
    await page
      .getByRole("button", { name: "恢复地图视角", exact: true })
      .click();
    assert(
      before ===
        (await page
          .locator('.map-node[data-select="0"]')
          .getAttribute("style")),
      "Reset must restore exact marker positions",
    );
    await page.locator('.map-node[data-select="10"]').click();
    assert(
      await page.locator('.quest-panel [data-open="10"]').isDisabled(),
      "Previewing locked region must not unlock it",
    );
    assert(
      (await page
        .locator('.map-node[data-select="10"]')
        .getAttribute("aria-pressed")) === "true",
      "Selection announced",
    );

    await page.evaluate(() => {
      const gl = document.querySelector(".island-canvas").getContext("webgl2");
      window.__m02Context = gl.getExtension("WEBGL_lose_context");
      if (!window.__m02Context)
        throw new Error("Context loss test requires WEBGL_lose_context");
      window.__m02Context.loseContext();
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".island-map")
          .classList.contains("scene-ready"),
    );
    assert(
      (await page.locator(".map-controls button:disabled").count()) === 5,
      "Context loss must disable all camera controls",
    );
    assert(
      (await page.locator(".map-render-status").innerText()).includes(
        "平面地图",
      ),
      "Fallback status must be explicit",
    );
    assert(
      (
        await page.locator('.map-node[data-select="0"]').getAttribute("style")
      ).includes("14%"),
      "Context loss must restore fallback coordinates",
    );
    await page.evaluate(() => window.__m02Context.restoreContext());
    await ready();
    await page.waitForFunction(
      () => !document.querySelector('[data-action="map-reset"]').disabled,
    );

    // A second page checks genuine no-WebGL startup and learning accessibility.
    const fallback = await page.context().newPage();
    await fallback.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : getContext.call(this, type, ...args);
      };
    });
    await fallback.goto(origin);
    await fallback
      .locator('[data-screen="map"]')
      .first()
      .click({ noWaitAfter: true });
    await fallback.waitForFunction(() =>
      document
        .querySelector(".map-render-status")
        ?.textContent.includes("平面地图"),
    );
    assert(
      (await fallback.locator(".map-node").count()) === 11,
      "Fallback must preserve eleven regions",
    );
    await fallback.locator("[data-open]").first().click();
    assert(
      await fallback.locator("#lesson-dialog").isVisible(),
      "Learning must open without WebGL",
    );
    await fallback.close();
    await page.bringToFront();

    // Unmount/remount three times: no leftover canvases or stale scene state.
    for (let i = 0; i < 3; i++) {
      await page.locator('.nav-item[data-screen="books"]').click();
      assert(
        (await page.locator(".island-canvas").count()) === 0,
        "Scene canvas must be disposed on navigation",
      );
      await page.locator('.nav-item[data-screen="map"]').click();
      await ready();
      assert(
        (await page.locator(".island-canvas").count()) === 1,
        "Only one scene after navigation",
      );
    }
    const checkMarkerHits = async (label) => {
      const hits = await page.locator(".map-node").evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.querySelector(".node-icon").getBoundingClientRect();
          const x = r.x + r.width / 2,
            y = r.y + r.height / 2;
          return {
            expected: node.dataset.select,
            actual: document.elementFromPoint(x, y)?.closest("[data-select]")
              ?.dataset.select,
            x,
            y,
          };
        }),
      );
      for (const hit of hits)
        assert(
          hit.expected === hit.actual,
          `${label}: marker ${Number(hit.expected) + 1} center blocked by ${hit.actual} at ${hit.x}, ${hit.y}`,
        );
    };
    await checkMarkerHits("desktop");
    await page.locator('.map-node[data-select="0"]').click();
    await page.screenshot({
      path: "output/playwright/bali-desktop.png",
      fullPage: true,
      timeout: 30000,
      animations: "disabled",
    });
    await page.locator(".island-map").screenshot({
      path: "output/playwright/bali-island.png",
      timeout: 30000,
      animations: "disabled",
    });

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(
        () =>
          document.querySelector(".island-canvas")?.clientWidth ===
          document.querySelector(".island-map")?.clientWidth,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Page overflow at ${width}px`,
      );
      assert(
        await page.evaluate(
          () =>
            document.querySelector(".island-world").scrollLeft === 0 &&
            document.querySelector(".world-title").getBoundingClientRect()
              .left >= 0,
        ),
        "Mobile title must remain in viewport after scene capture",
      );
      assert(
        (await page.locator(".node-label:visible").count()) === 11,
        `All names must stay visible at ${width}px`,
      );
      await checkMarkerHits(`mobile ${width}`);
      await page.getByRole("button", { name: "缩小地图", exact: true }).click();
      await page
        .getByRole("button", { name: "向右旋转地图", exact: true })
        .click();
      await checkMarkerHits(`mobile ${width} rotated and zoomed out`);
      await page
        .getByRole("button", { name: "恢复地图视角", exact: true })
        .click();
      await page.locator('.map-node[data-select="0"]').click();
      await page.screenshot({
        path: `output/playwright/bali-mobile-${width}.png`,
        fullPage: true,
        timeout: 30000,
        animations: "disabled",
      });
      await page.locator(".map-directory summary").click();
      await page.locator('.map-directory [data-select="10"]').click();
      assert(
        await page.locator('.quest-panel [data-open="10"]').isDisabled(),
        "Mobile directory preserves lock",
      );
      if ((await page.locator(".map-directory").getAttribute("open")) !== null)
        await page.locator(".map-directory summary").click();
      for (const screen of ["books", "bag", "review", "report", "map"]) {
        await page.locator(`.nav-item[data-screen="${screen}"]`).click();
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${screen} overflows at ${width}px`,
        );
      }
      await ready();
    }
    await page.setViewportSize({ width: 1512, height: 1180 });
    return {
      passed: true,
      checks: [
        "3D camera projection/reset",
        "locked region preview",
        "real WebGL loss and restoration",
        "startup without WebGL",
        "navigation disposal",
        "desktop/mobile marker center hit targets",
        "390px and 320px full-map layout",
        "all navigation screens",
      ],
    };
  } finally {
    await page.evaluate((save) => {
      if (save === null) localStorage.removeItem("xiaoyu-island-save-v1");
      else localStorage.setItem("xiaoyu-island-save-v1", save);
    }, priorSave);
  }
}
