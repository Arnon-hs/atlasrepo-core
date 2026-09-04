import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestFile = resolve(here, "../../examples/dify/evidence-manifest.json");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const revisionEvidence = manifest.evidence.find((item) => item.id === "ev-revision");
assert.ok(revisionEvidence, "missing ev-revision");
const refResult = spawnSync(
  "git",
  ["ls-remote", manifest.subject.url, "refs/heads/main"],
  { encoding: null },
);
assert.equal(refResult.status, 0, refResult.stderr?.toString() || "git ls-remote failed");
if (sha256(refResult.stdout) !== revisionEvidence.sha256) {
  console.warn("notice: main moved after the recorded observation; pinned evidence is unchanged");
}

for (const evidence of manifest.evidence.filter((item) => item.kind.startsWith("upstream-"))) {
  const response = await fetch(evidence.sourceUrl, {
    headers: { "user-agent": "atlasrepo-core-dify-evidence-verifier/0.1" },
  });
  assert.equal(response.ok, true, `${evidence.id} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, evidence.sizeBytes, `${evidence.id} size mismatch`);
  assert.equal(sha256(bytes), evidence.sha256, `${evidence.id} digest mismatch`);
}

const metadataEvidence = manifest.evidence.find(
  (item) => item.id === "ev-repository-metadata",
);
assert.ok(metadataEvidence, "missing ev-repository-metadata");
const metadataResponse = await fetch(metadataEvidence.sourceUrl, {
  headers: {
    accept: "application/vnd.github+json",
    "user-agent": "atlasrepo-core-dify-evidence-verifier/0.1",
    "x-github-api-version": "2022-11-28",
  },
});
assert.equal(metadataResponse.ok, true, `repository metadata returned HTTP ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const canonicalObservation = {
  defaultBranch: metadata.default_branch,
  description: metadata.description,
  isArchived: metadata.archived,
  licenseInfo: {
    key: metadata.license?.key,
    name: metadata.license?.name,
  },
  nameWithOwner: metadata.full_name,
  visibility: metadata.visibility?.toUpperCase(),
};
if (
  sha256(`${JSON.stringify(canonicalObservation)}\n`) !==
  metadataEvidence.canonicalObservationSha256
) {
  console.warn("notice: mutable repository metadata changed after the recorded observation");
}

const pinnedCount = manifest.evidence.filter((item) => item.kind.startsWith("upstream-")).length;
console.log(`verified ${pinnedCount} pinned Dify source files at ${manifest.subject.revision}`);
