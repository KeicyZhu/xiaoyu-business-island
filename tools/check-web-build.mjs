// Requires the built dist mounted at http://127.0.0.1:4174/xiaoyu/.
async function checkWebBuild(page) {
  const scratch = await page.context().newPage();
  const failures = [],
    consoleIssues = [];
  scratch.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  scratch.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      consoleIssues.push(message.text());
  });
  try {
    await scratch.emulateMedia({ reducedMotion: "no-preference" });
    await scratch.setViewportSize({ width: 1440, height: 1000 });
    await scratch.goto("http://127.0.0.1:4174/xiaoyu/");
    await scratch.bringToFront();
    await scratch.waitForSelector(".scene-ready", {
      state: "attached",
      timeout: 60000,
    });
    const star = scratch.locator(".sky-star").first();
    if (
      (await star.evaluate((el) => getComputedStyle(el).animationPlayState)) !==
      "running"
    )
      throw new Error("Star animation is not running");
    const first = await star.evaluate((el) => getComputedStyle(el).translate);
    await scratch.waitForFunction(
      (before) =>
        getComputedStyle(document.querySelector(".sky-star")).translate !==
        before,
      first,
    );
    await scratch.locator('.quest-panel [data-open="0"]').click();
    if (
      (await star.evaluate((el) => getComputedStyle(el).animationPlayState)) !==
      "paused"
    )
      throw new Error("Reading must pause sky animations");
    const metrics = await scratch.evaluate(async () => {
      const { mountIsland } = await import("./src/island-scene.js");
      const target = document.createElement("div");
      target.style.cssText =
        "position:fixed;left:-2000px;top:0;width:900px;height:650px";
      document.body.append(target);
      const scene = mountIsland(target, { reducedMotion: true });
      if (!scene) throw new Error("Profile requires WebGL");
      await new Promise(requestAnimationFrame);
      const stats = scene.diagnostics();
      scene.dispose();
      target.remove();
      return stats;
    });
    if (failures.length)
      throw new Error(`Subpath assets failed: ${failures.join(", ")}`);
    if (consoleIssues.length)
      throw new Error(`Build console problems: ${consoleIssues.join("; ")}`);
    if (metrics.textures > 5 || metrics.drawCalls > 350)
      throw new Error(
        `Scene exceeded rendering budget: ${JSON.stringify(metrics)}`,
      );
    return {
      passed: true,
      basePath: "/xiaoyu/",
      checks: [
        "relative HTML/CSS/module/SVG paths",
        "actual star animation",
        "modal pauses decorative motion",
        "no warning or error",
      ],
      metrics,
    };
  } catch (error) {
    const context = await scratch
      .evaluate(() => ({
        url: location.href,
        status: document.querySelector(".map-render-status")?.textContent,
        ready: !!document.querySelector(".scene-ready"),
        canvas: document.querySelectorAll("canvas").length,
      }))
      .catch(() => ({}));
    throw new Error(
      `${error.message}; page=${JSON.stringify(context)}; requests=${JSON.stringify(failures)}; console=${JSON.stringify(consoleIssues)}`,
    );
  } finally {
    await scratch.close();
    await page.bringToFront();
  }
}
