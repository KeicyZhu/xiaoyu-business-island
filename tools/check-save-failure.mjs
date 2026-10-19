// Run in an isolated Playwright session; the failing Storage write never persists progress.
async function checkSaveFailure(page) {
  const scratch = await page.context().newPage();
  try {
    await scratch.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        return key === "xiaoyu-island-save-v1" ? null : getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === "xiaoyu-island-save-v1")
          throw new DOMException("Test storage quota", "QuotaExceededError");
        return setItem.call(this, key, value);
      };
    });
    await scratch.goto("http://127.0.0.1:4173/");
    await scratch.locator('.quest-panel [data-open="0"]').click();
    for (let i = 0; i < 3; i++)
      await scratch.locator('[data-action="concept-next"]').click();
    if (!(await scratch.locator("#toast").innerText()).includes("未保存"))
      throw new Error("Success toast hid save failure");
    await scratch.locator(".modal-close").click();
    if (!(await scratch.locator("#save-status").isVisible()))
      throw new Error("Persistent save failure notice missing");
    await scratch.locator('#save-status [data-screen="report"]').click();
    if (!(await scratch.locator('[data-action="export"]').isVisible()))
      throw new Error("Save warning must lead to export");
    return {
      passed: true,
      check:
        "quota failure remains visible after successful learning action and leads to export",
    };
  } finally {
    await scratch.close();
    await page.bringToFront();
  }
}
