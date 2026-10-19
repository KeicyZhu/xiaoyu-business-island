import {
  readdir,
  lstat,
  realpath,
  mkdir,
  rm,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePublicPath, PROJECT_ROOT } from "./server.mjs";
export async function build(root = PROJECT_ROOT) {
  const base = await realpath(root);
  const output = path.join(base, "dist");
  if (path.dirname(output) !== base || path.basename(output) !== "dist")
    throw new Error("Unsafe output path");
  const existing = await lstat(output).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory()))
    throw new Error("dist must be a real directory");
  const files = [];
  async function collect(relative) {
    const source = path.join(base, relative);
    const info = await lstat(source).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (!info || info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const entry of await readdir(source))
        await collect(`${relative}/${entry}`);
    } else if (info.isFile() && (await resolvePublicPath(`/${relative}`, base)))
      files.push(relative);
  }
  for (const entry of [
    "index.html",
    "THIRD_PARTY_NOTICES.txt",
    "src",
    "assets",
  ])
    await collect(entry);
  if (!files.includes("index.html"))
    throw new Error("Missing public index.html");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const relative of files) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(base, relative), destination);
  }
  return { count: files.length, output };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await build();
  console.log(`Built ${result.count} public files → ${result.output}`);
}
