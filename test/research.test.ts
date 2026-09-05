import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptResearchEvaluation,
  canonicalResearchEvidenceReceipt,
  sha256Digest,
  validateDocument,
} from "../src/index.js";
import { validDossierV02 } from "./v02-fixtures.js";

function request(accessHint: "public" | "restricted" = "public"): Record<string, unknown> {
  const evaluatorContent = { commit: "a".repeat(40), implementation: "offline-evaluator" };
  const inputContent = { caseId: "dify-case", requestedStatus: "conditional" };
  const outputContent = {
    schema_version: "atlasrepo.research/core-golden-eval-result/v0.1",
    status: "passed",
    decision: "conditional",
  };
  return {
    evaluationId: "research-dify-evaluation",
    title: "Atlas Research Dify evaluation",
    observedAt: "2026-09-05T02:00:00Z",
    evidenceKind: "repository-analysis",
    sourceSchema: {
      id: "atlasrepo.research/core-golden-eval-result/v0.1",
      version: "v0.1",
    },
    access: {
      resourceRef: "github:Arnon-hs/atlas-research@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:result.json",
      accessHint,
      ...(accessHint === "public"
        ? { publicUri: "https://github.com/Arnon-hs/atlas-research/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/result.json" }
        : {}),
    },
    evaluator: {
      name: "atlas-research",
      version: "0.2.0",
      digest: sha256Digest(evaluatorContent),
      content: evaluatorContent,
    },
    input: { digest: sha256Digest(inputContent), content: inputContent },
    output: { digest: sha256Digest(outputContent), content: outputContent },
    license: "MIT",
    limitations: ["The evaluation does not authorize deployment."],
  };
}

test("research evaluation adapter produces valid Core evidence and exact provenance", () => {
  const result = adaptResearchEvaluation(request());
  const dossier = validDossierV02();
  dossier.evidence.push(result.evidence);
  dossier.extensions = { researchEvaluationReceipts: [result.receipt] };

  assert.deepEqual(validateDocument("task-dossier", dossier), { ok: true });
  assert.equal(result.evidence.digest, result.receipt.outputDigest);
  assert.equal(result.evidence.accessHint, "public");
  assert.equal(result.receipt.evaluator.name, "atlas-research");
  assert.equal(result.receipt.evaluator.version, "0.2.0");
  assert.equal(result.receipt.evidenceDigest, sha256Digest(result.evidence));
  assert.equal(result.receiptDigest, sha256Digest(result.receipt));
  assert.equal(
    canonicalResearchEvidenceReceipt(result.receipt),
    canonicalResearchEvidenceReceipt(structuredClone(result.receipt)),
  );
});

test("research evaluation adapter is deterministic across object insertion order", () => {
  const first = request();
  const second = request();
  const input = (second.input as { content: Record<string, unknown> }).content;
  (second.input as { content: Record<string, unknown> }).content = {
    requestedStatus: input.requestedStatus,
    caseId: input.caseId,
  };

  assert.deepEqual(adaptResearchEvaluation(first), adaptResearchEvaluation(second));
});

test("research evaluation adapter rejects every mismatched digest", () => {
  for (const field of ["evaluator", "input", "output"] as const) {
    const candidate = request();
    (candidate[field] as { digest: string }).digest = `sha256:${"f".repeat(64)}`;
    assert.throws(
      () => adaptResearchEvaluation(candidate),
      new RegExp(`request\\.${field}\\.digest does not match`),
    );
  }
});

test("research evaluation adapter fails closed on classification and contract drift", () => {
  const restricted = request("restricted");
  (restricted.access as Record<string, unknown>).publicUri = "https://example.com/result.json";
  assert.throws(() => adaptResearchEvaluation(restricted), /restricted research evidence/);

  const unclassified = request();
  delete (unclassified.access as Record<string, unknown>).accessHint;
  assert.throws(() => adaptResearchEvaluation(unclassified), /accessHint is required/);

  const drifted = request();
  drifted.provider = "openai";
  assert.throws(() => adaptResearchEvaluation(drifted), /unknown property: provider/);

  const wrongSchema = request();
  (wrongSchema.sourceSchema as Record<string, unknown>).id = "atlasrepo.research/other/v0.1";
  assert.throws(() => adaptResearchEvaluation(wrongSchema), /schema_version does not match/);

  const credentialReference = request();
  (credentialReference.access as Record<string, unknown>).resourceRef = "bearer:secret";
  assert.throws(() => adaptResearchEvaluation(credentialReference), /bearer: scheme/);
});

test("research evaluation adapter keeps restricted evidence free of public URLs", () => {
  const result = adaptResearchEvaluation(request("restricted"));
  assert.equal(result.evidence.accessHint, "restricted");
  assert.equal(Object.hasOwn(result.evidence, "publicUri"), false);
  assert.equal(result.receipt.accessHint, "restricted");
});
