import assert from "node:assert/strict";
import test from "node:test";
import {
  composeDecisionPack,
  sha256Digest,
  validateDocument,
} from "../src/index.js";
import { clone, validComposition } from "./v02-fixtures.js";

test("decision-pack composition is deterministic and keeps restricted citations private", () => {
  const input = validComposition();
  const first = composeDecisionPack(input);
  const second = composeDecisionPack(clone(input));

  assert.deepEqual(first, second);
  assert.deepEqual(validateDocument("decision-pack", first), { ok: true });
  assert.equal(first.status, "recommended");
  assert.equal(first.dossier.digest, sha256Digest(input.dossier));
  assert.equal(first.route.digest, sha256Digest(input.route));
  assert.deepEqual(first.citations.map(({ evidenceId }) => evidenceId), [
    "dossier-evidence",
    "module-evidence",
  ]);
  assert.equal(first.citations[0]!.publicUri, input.dossier.evidence[0]!.publicUri);
  assert.equal("publicUri" in first.citations[1]!, false);
  assert.equal(first.citations[1]!.accessHint, "restricted");
  assert.match(sha256Digest(first), /^sha256:[a-f0-9]{64}$/);
});

test("composition rejects a module digest mismatch", () => {
  const input = validComposition();
  input.route.modules[0]!.digest = `sha256:${"f".repeat(64)}`;
  assert.throws(() => composeDecisionPack(input), /Digest mismatch for module release/);
});

test("composition rejects conflicting evidence metadata for the same id", () => {
  const input = validComposition();
  const { publicUri: _publicUri, ...base } = input.dossier.evidence[0]!;
  const duplicate = { ...base, accessHint: "restricted" as const };
  input.modules[0]!.evidence.push(duplicate);
  input.route.modules[0]!.digest = sha256Digest(input.modules[0]!);

  assert.throws(
    () => composeDecisionPack(input),
    /Evidence id dossier-evidence has conflicting metadata/,
  );
});

test("composition rejects a route module missing from supplied releases", () => {
  const input = validComposition();
  input.modules = [];
  assert.throws(
    () => composeDecisionPack(input),
    /module releases must exactly match the route|Missing module release/,
  );
});

test("composition rejects an unselected required dependency", () => {
  const input = validComposition();
  const dependency = { moduleId: "prepare-source", version: "0.2.0" };
  input.modules[0]!.prerequisites = [dependency];
  input.route.modules[0]!.digest = sha256Digest(input.modules[0]!);
  input.route.modules[0]!.dependsOn = [dependency];

  assert.throws(
    () => composeDecisionPack(input),
    /Missing dependency prepare-source@0\.2\.0/,
  );
});

test("an unresolved required constraint produces a conditional pack", () => {
  const input = validComposition();
  input.route.constraintCoverage[0]!.status = "unresolved";
  input.route.status = "conditional";
  input.route.unresolvedGates = ["local-verification"];

  const pack = composeDecisionPack(input);
  assert.equal(pack.status, "conditional");
  assert.deepEqual(pack.unresolvedGates, ["local-verification"]);
});

test("a conditional pack requires an explicit unresolved gate", () => {
  const input = validComposition();
  input.route.constraintCoverage[0]!.status = "unresolved";
  input.route.status = "conditional";

  assert.throws(
    () => composeDecisionPack(input),
    /requires at least one explicit unresolved gate/,
  );
});

test("a covered constraint requires a selected module", () => {
  const input = validComposition();
  input.route.constraintCoverage[0]!.moduleIds = [];

  const validation = validateDocument("route", input.route);
  assert.equal(validation.ok, false);
  assert.throws(() => composeDecisionPack(input), /Invalid route/);
});

test("conditional route and decision pack statuses require an explicit unresolved reason", () => {
  const input = validComposition();
  input.route.status = "conditional";
  assert.equal(validateDocument("route", input.route).ok, false);

  const pack = composeDecisionPack(validComposition());
  pack.status = "conditional";
  assert.equal(validateDocument("decision-pack", pack).ok, false);
});

test("a failed required dossier check cannot produce a recommendation", () => {
  const input = validComposition();
  input.dossier.checks[0]!.status = "failed";

  assert.throws(
    () => composeDecisionPack(input),
    /failed required check requires an abstained decision/,
  );
});

test("a failed required readiness criterion produces an abstained pack", () => {
  const input = validComposition();
  input.route.modules[0]!.criterionResults[0]!.status = "failed";
  input.route.status = "abstained";

  const pack = composeDecisionPack(input);
  assert.equal(pack.status, "abstained");
});

test("a failed optional readiness criterion does not force abstention", () => {
  const input = validComposition();
  input.modules[0]!.readinessCriteria.push({
    id: "optional-observation",
    description: "An optional observation may fail without blocking the route.",
    required: false,
    checkIds: [input.modules[0]!.checks[0]!.id],
  });
  input.route.modules[0]!.criterionResults.push({
    criterionId: "optional-observation",
    status: "failed",
    evidenceIds: ["module-evidence"],
  });
  input.route.modules[0]!.digest = sha256Digest(input.modules[0]!);

  assert.deepEqual(validateDocument("route", input.route), { ok: true });
  assert.equal(composeDecisionPack(input).status, "recommended");
});
