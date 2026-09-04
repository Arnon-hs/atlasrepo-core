import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dossierFile = resolve(root, "examples/dify/task-dossier.json");
const manifestFile = resolve(root, "examples/dify/evidence-manifest.json");
const caseFile = resolve(root, "benchmarks/dify/case.json");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

test("Dify dossier validates through the public Core CLI", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "dist/cli.js"), "validate", "task-dossier", dossierFile],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `CLI validation failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("Dify dossier completes a local Core store round trip", async () => {
  const store = await mkdtemp(resolve(tmpdir(), "atlasrepo-core-dify-"));
  try {
    const put = spawnSync(
      process.execPath,
      [
        resolve(root, "dist/cli.js"),
        "dossier",
        "put",
        dossierFile,
        "--store",
        store,
        "--expected-revision",
        "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(put.status, 0, `dossier put failed: ${put.stderr}`);

    const dossier = await readJson(dossierFile);
    const get = spawnSync(
      process.execPath,
      [resolve(root, "dist/cli.js"), "dossier", "get", dossier.id, "--store", store],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(get.status, 0, `dossier get failed: ${get.stderr}`);
    assert.deepEqual(JSON.parse(get.stdout), dossier);
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test("Dify evidence is pinned, content-addressed, and explicitly non-runtime", async () => {
  const manifest = await readJson(manifestFile);
  const benchmark = await readJson(caseFile);

  assert.equal(manifest.subject.revision, benchmark.expected.subjectRevision);
  assert.equal(manifest.collectionPolicy.repositoryCodeExecuted, false);
  assert.equal(manifest.collectionPolicy.containersStarted, false);

  const evidenceById = new Map(manifest.evidence.map((item) => [item.id, item]));
  for (const id of benchmark.expected.requiredEvidenceIds) {
    assert.ok(evidenceById.has(id), `missing evidence ${id}`);
  }

  for (const evidence of manifest.evidence) {
    const digest = evidence.sha256 ?? evidence.canonicalObservationSha256;
    assert.match(digest, /^[a-f0-9]{64}$/, `${evidence.id} has no valid SHA-256`);
    if (evidence.kind.startsWith("upstream-")) {
      assert.match(
        evidence.sourceUrl,
        new RegExp(manifest.subject.revision),
        `${evidence.id} is not revision-pinned`,
      );
    }
  }
});

test("Dify decision remains conditional and preserves unresolved gates", async () => {
  const dossier = await readJson(dossierFile);
  const benchmark = await readJson(caseFile);
  const extension = dossier.extensions.atlasrepoBenchmark;

  assert.equal(extension.decisionStatus, benchmark.expected.decisionStatus);
  assert.match(dossier.decision.summary, /conditional-pilot/);
  assert.equal(extension.runtimeEvidencePresent, false);
  assert.equal(extension.repositoryCodeExecuted, false);
  assert.equal(extension.legalConclusionPresent, false);

  const actions = new Map(dossier.actions.map((action) => [action.id, action]));
  for (const gateId of benchmark.expected.requiredGateIds) {
    assert.equal(actions.get(gateId)?.status, "pending", `${gateId} is not pending`);
  }

  const licenseEvidence = dossier.evidence.find((item) => item.id === "ev-license");
  assert.ok(licenseEvidence);
  assert.match(licenseEvidence.license, /^LicenseRef-/);
  assert.ok(licenseEvidence.limitations.some((item) => /not legal advice/i.test(item)));
});

test("Every material Dify hypothesis and decision cites known evidence", async () => {
  const dossier = await readJson(dossierFile);
  const evidenceIds = new Set(dossier.evidence.map((item) => item.id));

  for (const hypothesis of dossier.hypotheses) {
    assert.ok(hypothesis.evidenceIds.length > 0, `${hypothesis.id} has no evidence`);
    for (const id of hypothesis.evidenceIds) {
      assert.ok(evidenceIds.has(id), `${hypothesis.id} cites unknown evidence ${id}`);
    }
  }

  assert.ok(dossier.decision.evidenceIds.length > 0);
  for (const id of dossier.decision.evidenceIds) {
    assert.ok(evidenceIds.has(id), `decision cites unknown evidence ${id}`);
  }

  const supported = dossier.hypotheses.filter((item) => item.status === "supported");
  assert.deepEqual(supported.map((item) => item.id), ["hyp-functional-fit"]);
});
