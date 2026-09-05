import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  adaptResearchEvaluation,
  canonicalResearchEvidenceReceipt,
  sha256Digest,
  validateDocument,
} from "../dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = join(repositoryRoot, "examples", "dify");

async function readJson(name) {
  return JSON.parse(await readFile(join(exampleRoot, name), "utf8"));
}

test("Atlas Research Dify result deterministically becomes Core evidence", async () => {
  const request = await readJson("research-evaluation-adapter.v0.1.json");
  const expected = await readJson("research-evidence.v0.1.json");
  let networkAttempted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkAttempted = true;
    throw new Error("network access is forbidden in the adapter benchmark");
  };
  let first;
  let second;
  try {
    first = adaptResearchEvaluation(request);
    second = adaptResearchEvaluation(structuredClone(request));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(first, expected);
  assert.deepEqual(second, expected);
  assert.equal(networkAttempted, false);
  assert.equal(first.receiptDigest, sha256Digest(first.receipt));
  assert.equal(first.receipt.evidenceDigest, sha256Digest(first.evidence));
  assert.equal(
    canonicalResearchEvidenceReceipt(first.receipt),
    canonicalResearchEvidenceReceipt(second.receipt),
  );
});

test("Atlas Research Dify provenance pins evaluator, input, and output", async () => {
  const request = await readJson("research-evaluation-adapter.v0.1.json");
  const result = adaptResearchEvaluation(request);

  assert.equal(result.receipt.evaluator.name, "atlas-research");
  assert.equal(result.receipt.evaluator.version, "0.2.0");
  assert.equal(result.receipt.evaluator.digest, request.evaluator.digest);
  assert.equal(result.receipt.inputDigest, request.input.digest);
  assert.equal(result.receipt.outputDigest, request.output.digest);
  assert.equal(result.evidence.digest, request.output.digest);
  assert.equal(request.output.content.status, "passed");
  assert.equal(request.output.content.decision.status, "conditional");
  assert.deepEqual(request.output.content.decision.unresolved_gates, [
    "license-review",
    "local-runtime-pilot",
    "operations-review",
    "security-review",
  ]);
});

test("adapted Dify evidence remains valid inside the public Core dossier contract", async () => {
  const request = await readJson("research-evaluation-adapter.v0.1.json");
  const dossier = await readJson("task-dossier.v0.2.json");
  const result = adaptResearchEvaluation(request);
  dossier.evidence.push(result.evidence);
  dossier.extensions = {
    ...dossier.extensions,
    researchEvaluationReceipts: [result.receipt],
  };

  assert.deepEqual(validateDocument("task-dossier", dossier), { ok: true });
  assert.equal(result.evidence.accessHint, "public");
  assert.match(result.evidence.publicUri, /\/blob\/[a-f0-9]{40}\//);
});
