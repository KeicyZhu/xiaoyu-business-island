import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function resolvePublicPath(url, root = PROJECT_ROOT) {
  if (typeof url !== "string") return null;
  const raw = url.split("?")[0];
  // Disallow encoded path syntax before normalization can hide traversal.
  if (raw.includes("%") || raw.includes("\\") || raw.includes("\0"))
    return null;
  const name = raw === "/" ? "/index.html" : raw;
  if (
    !/^\/(?:index\.html|THIRD_PARTY_NOTICES\.txt|assets\/gtm\/(?:annual-plan|message-house)\.png|src\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css)|assets\/(?:[\w-]+\/)*[\w.-]+\.svg)$/.test(
      name,
    )
  )
    return null;
  if (name.split("/").some((p) => p === ".." || p === ".")) return null;
  try {
    const base = await realpath(root);
    const candidate = path.resolve(base, `.${name}`);
    if (!candidate.startsWith(`${base}${path.sep}`)) return null;
    const resolved = await realpath(candidate);
    if (resolved !== candidate || !(await stat(resolved)).isFile()) return null;
    return resolved;
  } catch {
    return null;
  }
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
export function createHandler(root = PROJECT_ROOT) {
  return async (req, res) => {
    const file = await resolvePublicPath(req.url, root);
    if (!file || !["GET", "HEAD"].includes(req.method)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    try {
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)],
        "Content-Length": content.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535");
  const server = http.createServer(createHandler());
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`小玉商业岛：http://127.0.0.1:${port}`),
  );
}
