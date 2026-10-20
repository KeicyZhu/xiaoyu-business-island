/** Compose a Playwright CLI callback without importing QA fixtures into the game. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
const checks = {
  journey: "checkJourney",
  archipelago: "checkArchipelago",
  twin: "checkTwin",
  "twin-layout": "checkTwinLayout",
  "twin-quota": "checkTwinQuota",
  "twin-recovery": "checkTwinRecovery",
};
const name = process.argv[2];
if (!Object.hasOwn(checks, name))
  throw Error("Choose: " + Object.keys(checks).join(", "));
const fixture = await readFile(
  new URL("./check-journey.mjs", import.meta.url),
  "utf8",
);
const body =
  name === "journey"
    ? fixture
    : fixture +
      "\n" +
      (await readFile(new URL(`./check-${name}.mjs`, import.meta.url), "utf8"));
await mkdir("output/playwright", { recursive: true });
const output = `output/playwright/check-${name}-run.mjs`;
await writeFile(
  output,
  `async (page) => {\n${body}\nreturn await ${checks[name]}(page);\n}`,
);
console.log(output);
