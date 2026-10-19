/** Export reviewed source/docs without private research or local conversation history. */
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = await realpath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const destination = path.join(root, "output", "public-release");
await mkdir(destination, { recursive: true });
if ((await realpath(destination)) !== destination)
  throw new Error("Public export directory must not be symlinked");
const files = [
  "index.html",
  "package.json",
  "package-lock.json",
  "README.md",
  ".gitattributes",
  ".gitignore",
  "RIGHTS.md",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.txt",
  "docs/PRD.md",
  "docs/PLAY_GUIDE.md",
  "docs/product/game-map.md",
  "docs/product/game-map.json",
  "docs/product/architecture.md",
  "docs/product/AGENTS-public.md",
  "docs/knowledge/README.md",
  "docs/knowledge/business-handbook.md",
  "docs/knowledge/advanced-handbook.md",
  "docs/knowledge/catalog.json",
  "docs/knowledge/coverage-report.md",
  "docs/knowledge/learning-path.md",
  "docs/knowledge/corrections.md",
  "docs/knowledge/source-audit-business.json",
  "docs/knowledge/source-audit-advanced.json",
  "docs/deployment/README.md",
  "docs/deployment/pages-workflow.yml",
  "docs/deployment/verify-workflow.yml",
  "docs/images/desktop.png",
  "docs/images/mobile.png",
];
async function collect(folder, pattern) {
  for (const entry of await readdir(path.join(root, folder), {
    withFileTypes: true,
  })) {
    if (entry.isSymbolicLink())
      throw new Error(`Refusing symlink: ${folder}/${entry.name}`);
    if (entry.isDirectory()) await collect(`${folder}/${entry.name}`, pattern);
    else if (pattern.test(entry.name)) files.push(`${folder}/${entry.name}`);
  }
}
await collect("src", /\.(js|css)$/);
await collect("assets", /\.svg$/);
await collect("tests", /\.test\.mjs$/);
await collect("tools", /\.mjs$/);
// Reject stale files from an earlier export before anything can be staged.
const allowed = new Set([...files, "AGENTS.md", "PUBLIC_MANIFEST.json"]);
async function verifyExisting(relative = "") {
  for (const entry of await readdir(path.join(destination, relative), {
    withFileTypes: true,
  })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected export symlink: ${name}`);
    if (!relative && [".git", "dist", ".DS_Store"].includes(entry.name))
      continue;
    if (entry.isDirectory()) await verifyExisting(name);
    else if (!allowed.has(name))
      throw new Error(`Unreviewed file in public export: ${name}`);
  }
}
await verifyExisting();
const manifest = [];
for (const relative of files.sort()) {
  const source = path.join(root, relative);
  if (
    (await lstat(source)).isSymbolicLink() ||
    (await realpath(source)) !== source
  )
    throw new Error(`Refusing symlink: ${relative}`);
  const content = await readFile(source);
  if (/\.(md|json|mjs|js|yml|css|html)$/.test(relative)) {
    const text = content.toString("utf8");
    if (/\bsk-[A-Za-z0-9_-]{24,}|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(text))
      throw new Error(`Credential pattern: ${relative}`);
    if (/\/Users\/[^/\s]+\/|cruxjumper\.com|codex:\/\/threads\//.test(text))
      throw new Error(`Local environment details: ${relative}`);
  }
  const target = path.join(destination, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  manifest.push({
    path: relative,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}
await copyFile(
  path.join(root, "docs/product/AGENTS-public.md"),
  path.join(destination, "AGENTS.md"),
);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
await writeFile(
  path.join(destination, "PUBLIC_MANIFEST.json"),
  JSON.stringify(
    {
      version: "0.3.0",
      sourceCommit,
      exportedAt: new Date().toISOString(),
      note: "Reviewed public source snapshot. Original private research and local conversation history are not included. Subsequent public releases retain their own Git history.",
      files: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Exported ${manifest.length + 2} reviewed files → ${destination}`);
