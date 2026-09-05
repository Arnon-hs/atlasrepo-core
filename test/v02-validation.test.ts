import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  getSchema,
  getLatestSchema,
  inferDocumentKind,
  validateDocument,
  type TaskDossierV01,
  type TaskDossierV02,
  type WorkflowModuleReleaseV02,
} from "../src/index.js";
import { clone, validDossierV02, validWorkflowV02 } from "./v02-fixtures.js";

function assertInvalid(
  kind: "task-dossier" | "workflow-module-release",
  document: unknown,
  expected: RegExp,
): void {
  const result = validateDocument(kind, document);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.map(({ path, message }) => `${path} ${message}`).join("; "), expected);
  }
}

test("v0.1 dossiers remain valid under their published evidence semantics", async () => {
  const path = join(import.meta.dirname, "..", "fixtures", "task-dossier.valid.json");
  const dossier = JSON.parse(await readFile(path, "utf8")) as TaskDossierV01;
  dossier.hypotheses[0]!.evidenceIds = [];
  dossier.actions[0] = {
    ...dossier.actions[0]!,
    status: "completed",
    resultEvidenceIds: [],
  };
  dossier.outcome = {
    status: "succeeded",
    summary: "Legacy outcome without attached evidence.",
    evidenceIds: [],
    recordedAt: "2026-09-05T00:10:00.000Z",
  };

  assert.equal(inferDocumentKind(dossier), "task-dossier");
  assert.deepEqual(validateDocument("task-dossier", dossier), { ok: true });
  assert.equal(
    getSchema("task-dossier", "atlasrepo.core/task-dossier/v0.1").$id,
    "https://atlasrepo.com/schemas/core/task-dossier.v0.1.schema.json",
  );
  assert.equal(
    getSchema("task-dossier").$id,
    "https://atlasrepo.com/schemas/core/task-dossier.v0.1.schema.json",
  );
  assert.match(String(getLatestSchema("task-dossier").$id), /task-dossier\.v0\.2/);
});

test("prototype property names are never accepted as schema versions", () => {
  for (const schemaVersion of ["toString", "constructor", "__proto__"]) {
    assert.throws(
      () => inferDocumentKind({ schemaVersion }),
      /Unsupported schemaVersion/,
    );
    assert.throws(
      () => getSchema("task-dossier", schemaVersion),
      /Unsupported task-dossier schemaVersion/,
    );
  }
});

test("v0.2 dossiers require evidence for asserted facts and completed work", () => {
  const cases: Array<{
    name: string;
    mutate: (dossier: TaskDossierV02) => void;
    expected: RegExp;
  }> = [
    {
      name: "confirmed claim",
      mutate: (dossier) => { dossier.claims[0]!.evidenceIds = []; },
      expected: /confirmed claim requires evidence/,
    },
    {
      name: "supported hypothesis",
      mutate: (dossier) => { dossier.hypotheses[0]!.evidenceIds = []; },
      expected: /supported hypothesis requires evidence/,
    },
    {
      name: "passed check",
      mutate: (dossier) => { dossier.checks[0]!.evidenceIds = []; },
      expected: /passed check requires evidence/,
    },
    {
      name: "completed action",
      mutate: (dossier) => {
        dossier.actions[0]!.status = "completed";
        dossier.actions[0]!.resultEvidenceIds = [];
      },
      expected: /completed action requires result evidence/,
    },
    {
      name: "succeeded outcome",
      mutate: (dossier) => {
        dossier.outcome = {
          status: "succeeded",
          summary: "The pilot succeeded.",
          evidenceIds: [],
          recordedAt: "2026-09-05T00:30:00.000Z",
        };
      },
      expected: /succeeded outcome requires evidence/,
    },
  ];

  for (const scenario of cases) {
    const dossier = validDossierV02();
    scenario.mutate(dossier);
    assertInvalid("task-dossier", dossier, scenario.expected);
  }
});

test("v0.2 workflow claims require evidence", () => {
  const workflow = validWorkflowV02();
  workflow.claims[0]!.evidenceIds = [];
  assertInvalid("workflow-module-release", workflow, /confirmed claim requires evidence/);
});

test("restricted evidence cannot expose a public URL", () => {
  const dossier = validDossierV02();
  dossier.evidence[0]!.accessHint = "restricted";
  assertInvalid(
    "task-dossier",
    dossier,
    /restricted evidence must not expose a public URI/,
  );
});

test("restricted decision-pack citations cannot expose a public URL", () => {
  const result = validateDocument("decision-pack", {
    schemaVersion: "atlasrepo.core/decision-pack/v0.1",
    id: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-09-05T00:20:00.000Z",
    status: "conditional",
    answer: "Human review is required.",
    dossier: {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      digest: `sha256:${"1".repeat(64)}`,
    },
    route: {
      id: "22222222-2222-4222-8222-222222222222",
      digest: `sha256:${"2".repeat(64)}`,
    },
    modules: [],
    citations: [{
      evidenceId: "ev-private",
      title: "Private evidence",
      resourceRef: "atlasrepo-private:evidence/ev-private",
      publicUri: "https://example.com/private",
      digest: `sha256:${"3".repeat(64)}`,
      accessHint: "restricted",
    }],
    unresolvedGates: ["human-review"],
    limitations: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.map(({ message }) => message).join("; "), /restricted citation/);
  }
});

test("public references reject bearer-like query parameters", () => {
  const dossier = validDossierV02();
  dossier.evidence[0]!.publicUri = "https://example.com/receipt?bearer=secret";
  assertInvalid(
    "task-dossier",
    dossier,
    /must not contain secret query parameter: bearer/,
  );
});

test("references reject embedded data and signed URL credentials without false positives", () => {
  const disallowed = [
    "data:text/plain,PRIVATE_BYTES",
    "file:///private/material.txt",
    "https://storage.example/object?X-Goog-Signature=secret",
    "https://example.com/object#access_token=secret",
    "Bearer sk-secret-value",
    "Authorization:Bearer-secret",
  ];
  for (const value of disallowed) {
    const dossier = validDossierV02();
    dossier.evidence[0]!.resourceRef = value;
    assertInvalid(
      "task-dossier",
      dossier,
      /must not use|must not contain whitespace|secret (?:query|fragment) parameter/,
    );
  }

  const allowed = validDossierV02();
  allowed.evidence[0]!.publicUri = "https://example.com/search?monkey=ape#keyboard";
  assert.deepEqual(validateDocument("task-dossier", allowed), { ok: true });
});

test("terminal criterion results require evidence", () => {
  const input = validWorkflowV02();
  const route = {
    schemaVersion: "atlasrepo.core/route/v0.2",
    id: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-09-05T00:20:00.000Z",
    title: "Invalid terminal criterion",
    goal: "Exercise fail-closed route validation.",
    dossier: {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      digest: `sha256:${"1".repeat(64)}`,
    },
    status: "recommended",
    unresolvedGates: [],
    constraintCoverage: [],
    modules: [
      {
        moduleId: input.moduleId,
        version: input.version,
        digest: `sha256:${"2".repeat(64)}`,
        rationale: "Test route.",
        dependsOn: [],
        criterionResults: [
          { criterionId: "source-ready", status: "fulfilled", evidenceIds: [] },
        ],
      },
    ],
  };
  const result = validateDocument("route", route);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(
      result.issues.map(({ path, message }) => `${path} ${message}`).join("; "),
      /fulfilled criterion requires evidence/,
    );
  }
});

test("external writes require explicit approval", () => {
  const workflow = validWorkflowV02();
  workflow.steps[0]!.executionPolicy.effect = "external-write";
  workflow.steps[0]!.executionPolicy.approval = "not-required";
  assertInvalid(
    "workflow-module-release",
    workflow,
    /external-write step requires explicit approval/,
  );
});

test("workflow step dependency cycles fail validation", () => {
  const workflow = clone<WorkflowModuleReleaseV02>(validWorkflowV02());
  workflow.steps[0]!.dependsOn = [workflow.steps[0]!.id];
  assertInvalid("workflow-module-release", workflow, /dependency cycle|self dependency/);
});

test("workflow release versions follow SemVer 2.0.0", () => {
  for (const version of ["1.0.0-a..b", "1.0.0-01"]) {
    const workflow = validWorkflowV02();
    workflow.version = version;
    assertInvalid("workflow-module-release", workflow, /must match pattern/);
  }

  const valid = validWorkflowV02();
  valid.version = "1.0.0-rc.1+build.7";
  assert.deepEqual(validateDocument("workflow-module-release", valid), { ok: true });
});
