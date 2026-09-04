import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  inferDocumentKind,
  validateDocument,
  type DocumentKind,
  type TaskDossier,
} from "../src/index.js";

const fixtureDir = join(import.meta.dirname, "..", "fixtures");
const fixtures: Array<[DocumentKind, string]> = [
  ["task-dossier", "task-dossier.valid.json"],
  ["workflow-module-release", "workflow-module-release.valid.json"],
  ["route", "route.valid.json"],
  ["execution-pack", "execution-pack.valid.json"],
  ["result-pack", "result-pack.valid.json"],
];

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(fixtureDir, name), "utf8")) as unknown;
}

test("all published fixtures satisfy schema and domain validation", async () => {
  for (const [kind, name] of fixtures) {
    const document = await fixture(name);
    assert.equal(inferDocumentKind(document), kind);
    assert.deepEqual(validateDocument(kind, document), { ok: true });
  }
});

test("strict schemas reject unknown properties", async () => {
  const document = (await fixture("task-dossier.valid.json")) as TaskDossier & {
    unexpected?: boolean;
  };
  document.unexpected = true;
  const result = validateDocument("task-dossier", document);
  assert.equal(result.ok, false);
});

test("domain validation rejects dangling evidence references", async () => {
  const document = (await fixture("task-dossier.valid.json")) as TaskDossier;
  document.hypotheses[0]!.evidenceIds = ["missing"];
  const result = validateDocument("task-dossier", document);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issues[0]!.message, /unknown reference/);
});

test("domain validation rejects duplicate workflow identifiers", async () => {
  const document = (await fixture("workflow-module-release.valid.json")) as {
    steps: Array<{ id: string; title: string; instruction: string; checkIds: string[] }>;
  };
  document.steps.push({ ...document.steps[0]! });
  const result = validateDocument("workflow-module-release", document);
  assert.equal(result.ok, false);
});

