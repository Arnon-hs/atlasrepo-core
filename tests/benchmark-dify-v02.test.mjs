import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertValidDocument,
  composeDecisionPack,
  sha256Digest,
} from "../dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = join(repositoryRoot, "examples", "dify");

async function readJson(name) {
  return JSON.parse(await readFile(join(exampleRoot, name), "utf8"));
}

function rawSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function compositionInput(dossier, route, workflowModule) {
  return {
    dossier,
    route,
    modules: [workflowModule],
    packId: "c708a342-d1f8-407b-9a12-a26522b24708",
    createdAt: "2026-09-05T01:00:00+07:00",
    answer: "Dify is relevant enough for a bounded local pilot, but adoption and deployment remain blocked until qualified license review, runtime validation, operations review, and security review are complete.",
    limitations: [
      "This example evaluates pinned public evidence and does not authorize execution or production deployment."
    ]
  };
}

test("Dify v0.2 fixtures validate and preserve exact pins", async () => {
  const dossier = await readJson("task-dossier.v0.2.json");
  const workflowModule = await readJson("workflow-module-release.v0.2.json");
  const route = await readJson("route.v0.2.json");
  const expected = await readJson("decision-pack.v0.1.json");

  assertValidDocument("task-dossier", dossier);
  assertValidDocument("workflow-module-release", workflowModule);
  assertValidDocument("route", route);
  assertValidDocument("decision-pack", expected);

  assert.equal(route.dossier.digest, sha256Digest(dossier));
  assert.equal(route.modules[0].digest, sha256Digest(workflowModule));
  assert.equal(expected.route.digest, sha256Digest(route));
  assert.equal(expected.status, "conditional");
  assert.deepEqual(expected.unresolvedGates, [
    "license-review",
    "local-runtime-pilot",
    "operations-review",
    "security-review"
  ]);
});

test("Dify v0.2 material digests match bundled bytes and the source manifest", async () => {
  const workflowModule = await readJson("workflow-module-release.v0.2.json");
  const manifest = await readJson("evidence-manifest.json");
  const manifestDigests = new Map(
    manifest.evidence.map((item) => [item.id, `sha256:${item.sha256 ?? item.canonicalObservationSha256}`])
  );
  const revision = manifest.evidence.find((item) => item.id === "ev-revision");
  assert.equal(rawSha256(Buffer.from(revision.bytesRepresented, "utf8")), `sha256:${revision.sha256}`);
  const metadata = manifest.evidence.find((item) => item.id === "ev-repository-metadata");
  assert.equal(sha256Digest(metadata.observation), `sha256:${metadata.canonicalObservationSha256}`);

  for (const material of workflowModule.materials) {
    if (material.id === "material-evidence-manifest") {
      assert.match(material.resourceRef, /@v0\.2\.0:/);
      assert.match(material.publicUri, /\/blob\/v0\.2\.0\//);
    } else {
      assert.match(material.resourceRef, /@[a-f0-9]{40}/);
      assert.match(material.publicUri, /\/[a-f0-9]{40}\//);
    }
    if (material.bundlePath) {
      const bytes = await readFile(join(exampleRoot, material.bundlePath));
      assert.equal(rawSha256(bytes), material.digest, material.id);
    }
  }

  assert.equal(
    workflowModule.materials.find((item) => item.id === "material-upstream-license").digest,
    manifestDigests.get("ev-license")
  );
  assert.equal(
    workflowModule.materials.find((item) => item.id === "material-upstream-compose").digest,
    manifestDigests.get("ev-compose")
  );
});

test("Dify decision pack composition is deterministic and matches the fixture", async () => {
  const dossier = await readJson("task-dossier.v0.2.json");
  const workflowModule = await readJson("workflow-module-release.v0.2.json");
  const route = await readJson("route.v0.2.json");
  const expected = await readJson("decision-pack.v0.1.json");
  const input = compositionInput(dossier, route, workflowModule);

  const first = composeDecisionPack(input);
  const second = composeDecisionPack(input);
  assert.deepEqual(first, expected);
  assert.deepEqual(second, expected);
  assert.equal(sha256Digest(first), sha256Digest(second));
});

test("Dify fixtures pass CLI validation and CLI composition", async () => {
  const kinds = [
    ["task-dossier", "task-dossier.v0.2.json"],
    ["workflow-module-release", "workflow-module-release.v0.2.json"],
    ["route", "route.v0.2.json"],
    ["decision-pack", "decision-pack.v0.1.json"]
  ];
  for (const [kind, name] of kinds) {
    const output = execFileSync(
      process.execPath,
      [join(repositoryRoot, "dist", "cli.js"), "validate", kind, join(exampleRoot, name)],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    assert.equal(JSON.parse(output).ok, true, name);
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "atlasrepo-core-dify-v02-"));
  try {
    const dossier = await readJson("task-dossier.v0.2.json");
    const workflowModule = await readJson("workflow-module-release.v0.2.json");
    const route = await readJson("route.v0.2.json");
    const inputPath = join(temporaryRoot, "input.json");
    const outputPath = join(temporaryRoot, "output.json");
    await writeFile(
      inputPath,
      `${JSON.stringify(compositionInput(dossier, route, workflowModule), null, 2)}\n`,
      "utf8"
    );
    execFileSync(
      process.execPath,
      [join(repositoryRoot, "dist", "cli.js"), "compose", "decision-pack", inputPath, "--out", outputPath],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
    assert.deepEqual(
      JSON.parse(await readFile(outputPath, "utf8")),
      await readJson("decision-pack.v0.1.json")
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
