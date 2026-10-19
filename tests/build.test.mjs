import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const server = await import("../tools/server.mjs").catch(() => ({}));
const builder = await import("../tools/build.mjs").catch(() => ({}));
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "queen-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const d of ["src", "assets", "private", "docs", "dist"])
    await mkdir(path.join(root, d));
  for (const [name, value] of Object.entries({
    "index.html": "hello",
    "src/main.js": "export {};",
    "src/style.css": "body {}",
    "assets/island.svg": "<svg/>",
    "private/secret.md": "PRIVATE",
    "docs/info.md": "DOCS",
    "src/archive.zip": "ZIP",
    "assets/original.jpg": "IMAGE",
    "THIRD_PARTY_NOTICES.txt": "The MIT License — three.js authors",
    "dist/stale.js": "OLD",
  }))
    await writeFile(path.join(root, name), value);
  return root;
}
test("public resolver exists", () =>
  assert.equal(typeof server.resolvePublicPath, "function"));
test("public path whitelist rejects source leakage and traversal", async (t) => {
  const root = await fixture(t);
  for (const url of [
    "/",
    "/index.html",
    "/src/main.js",
    "/src/style.css",
    "/assets/island.svg",
    "/THIRD_PARTY_NOTICES.txt",
  ])
    assert.ok(await server.resolvePublicPath(url, root), url);
  for (const url of [
    "/private/secret.md",
    "/docs/info.md",
    "/src/archive.zip",
    "/assets/original.jpg",
    "/src/../private/secret.md",
    "/src/%2e%2e/private/secret.md",
    "/%2e%2e/index.html",
    "/src%2fmain.js",
    "/src/%252e%252e/private/secret.md",
    "/src/",
    "/package.json",
    "/auth.txt",
    "/private/THIRD_PARTY_NOTICES.txt",
    "/src/missing.js",
    "/%",
    "/index.html%00",
    "//index.html",
  ])
    assert.equal(await server.resolvePublicPath(url, root), null, url);
  await symlink(
    path.join(root, "private/secret.md"),
    path.join(root, "src/leak.js"),
  );
  assert.equal(await server.resolvePublicPath("/src/leak.js", root), null);
});
test("build only copies whitelisted public files and removes stale output", async (t) => {
  const root = await fixture(t);
  await symlink(
    path.join(root, "private/secret.md"),
    path.join(root, "src/leak.js"),
  );
  const result = await builder.build(root);
  assert.equal(result.count, 5);
  assert.deepEqual((await readdir(path.join(root, "dist"))).sort(), [
    "THIRD_PARTY_NOTICES.txt",
    "assets",
    "index.html",
    "src",
  ]);
  assert.deepEqual((await readdir(path.join(root, "dist/src"))).sort(), [
    "main.js",
    "style.css",
  ]);
  assert.equal(
    await readFile(path.join(root, "private/secret.md"), "utf8"),
    "PRIVATE",
  );
  await assert.rejects(readFile(path.join(root, "dist/stale.js")));
  assert.match(
    await readFile(path.join(root, "dist/THIRD_PARTY_NOTICES.txt"), "utf8"),
    /MIT License/,
  );
});
test("build refuses symlinked output rather than deleting its target", async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, "dist"), { recursive: true });
  await symlink(path.join(root, "private"), path.join(root, "dist"));
  await assert.rejects(builder.build(root));
  assert.equal(
    await readFile(path.join(root, "private/secret.md"), "utf8"),
    "PRIVATE",
  );
});
test("HTTP preview responds 404 for private files and 200 only for public assets", async (t) => {
  const { createServer } = await import("node:http");
  const root = await fixture(t);
  const http = createServer(server.createHandler(root));
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => http.close(resolve)));
  const origin = `http://127.0.0.1:${http.address().port}`;
  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "hello");
  for (const name of [
    "/private/secret.md",
    "/docs/info.md",
    "/src/archive.zip",
    "/src/",
  ])
    assert.equal((await fetch(origin + name)).status, 404);
  const head = await fetch(`${origin}/src/main.js`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
