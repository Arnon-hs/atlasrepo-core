import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptResearchEvaluation } from "../../dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const request = JSON.parse(
  await readFile(join(root, "research-evaluation-adapter.v0.1.json"), "utf8"),
);
const result = adaptResearchEvaluation(request);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
