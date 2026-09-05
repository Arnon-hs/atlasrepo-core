import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeDecisionPack } from "../../dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));

async function readJson(name) {
  return JSON.parse(await readFile(join(root, name), "utf8"));
}

const dossier = await readJson("task-dossier.v0.2.json");
const route = await readJson("route.v0.2.json");
const workflowModule = await readJson("workflow-module-release.v0.2.json");

const decisionPack = composeDecisionPack({
  dossier,
  route,
  modules: [workflowModule],
  packId: "c708a342-d1f8-407b-9a12-a26522b24708",
  createdAt: "2026-09-05T01:00:00+07:00",
  answer: "Dify is relevant enough for a bounded local pilot, but adoption and deployment remain blocked until qualified license review, runtime validation, operations review, and security review are complete.",
  limitations: [
    "This example evaluates pinned public evidence and does not authorize execution or production deployment."
  ]
});

process.stdout.write(`${JSON.stringify(decisionPack, null, 2)}\n`);
