async function checkTwinQuota(page) {
  const scratch = await page.context().newPage();
  try {
    await scratch.addInitScript(() => {
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k) {
        return k === "xiaoyu-twin-campaign-v1" ? null : get.call(this, k);
      };
      Storage.prototype.setItem = function (k, v) {
        if (k === "xiaoyu-twin-campaign-v1")
          throw new DOMException("Test quota", "QuotaExceededError");
        return set.call(this, k, v);
      };
    });
    await scratch.goto("http://127.0.0.1:4173/");
    await scratch
      .locator('[data-track="double11"]')
      .click({ noWaitAfter: true, timeout: 60000 });
    await scratch
      .locator('.mission-tabs [data-tab="deliverable"]')
      .click({ noWaitAfter: true });
    const answer =
      "这是保存失败回归测试。填写完整交付说明后切换全局页面，再返回任务，原有方案应仍保存在内存且提示未保存，并能够导出备份。";
    await scratch.locator("[data-c-report]").fill(answer);
    await scratch
      .locator('.nav-item[data-screen="books"]')
      .click({ noWaitAfter: true });
    await scratch
      .locator('.nav-item[data-screen="twin"]')
      .click({ noWaitAfter: true });
    await scratch
      .locator('[data-track="double11"]')
      .click({ noWaitAfter: true, timeout: 60000 });
    await scratch
      .locator('.mission-tabs [data-tab="deliverable"]')
      .click({ noWaitAfter: true });
    if ((await scratch.locator("[data-c-report]").inputValue()) !== answer)
      throw Error("Unsaved draft lost across navigation");
    if (!(await scratch.locator("[data-save-warning]").isVisible()))
      throw Error("Quota warning lost");
    return {
      passed: true,
      check: "quota-failed draft and warning persist across global remount",
    };
  } finally {
    await scratch.close();
    await page.bringToFront();
  }
}
