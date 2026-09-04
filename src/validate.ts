import Ajv2020Module, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CoreDocument,
  DocumentKind,
  TaskDossier,
  WorkflowModuleRelease,
} from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(packageRoot, "schemas", name), "utf8")) as object;
}

const schemaByKind: Record<DocumentKind, object> = {
  "task-dossier": loadSchema("task-dossier.v0.1.schema.json"),
  "workflow-module-release": loadSchema("workflow-module-release.v0.1.schema.json"),
  route: loadSchema("route.v0.1.schema.json"),
  "execution-pack": loadSchema("execution-pack.v0.1.schema.json"),
  "result-pack": loadSchema("result-pack.v0.1.schema.json"),
};

const Ajv2020 = Ajv2020Module as unknown as new (options: object) => {
  compile(schema: object): ValidateFunction;
};
const addFormats = addFormatsModule as unknown as (ajv: object) => void;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validatorByKind = Object.fromEntries(
  Object.entries(schemaByKind).map(([kind, schema]) => [kind, ajv.compile(schema)]),
) as Record<DocumentKind, ValidateFunction>;

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function schemaIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) =>
    issue(error.instancePath || "/", error.message ?? "is invalid"),
  );
}

function uniqueIds(
  values: Array<{ id: string }>,
  path: string,
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      issues.push(issue(path, `duplicate id: ${value.id}`));
    }
    ids.add(value.id);
  }
  return ids;
}

function checkRefs(
  refs: string[],
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const ref of refs) {
    if (!allowed.has(ref)) {
      issues.push(issue(path, `unknown reference: ${ref}`));
    }
  }
}

function validateDossier(document: TaskDossier): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const evidenceIds = uniqueIds(document.evidence, "/evidence", issues);
  const hypothesisIds = uniqueIds(document.hypotheses, "/hypotheses", issues);
  uniqueIds(document.checks, "/checks", issues);
  uniqueIds(document.actions, "/actions", issues);

  for (const hypothesis of document.hypotheses) {
    checkRefs(hypothesis.evidenceIds, evidenceIds, `/hypotheses/${hypothesis.id}/evidenceIds`, issues);
  }
  for (const check of document.checks) {
    if (check.hypothesisId && !hypothesisIds.has(check.hypothesisId)) {
      issues.push(issue(`/checks/${check.id}/hypothesisId`, `unknown reference: ${check.hypothesisId}`));
    }
    checkRefs(check.evidenceIds, evidenceIds, `/checks/${check.id}/evidenceIds`, issues);
  }
  if (document.decision) {
    checkRefs(document.decision.hypothesisIds, hypothesisIds, "/decision/hypothesisIds", issues);
    checkRefs(document.decision.evidenceIds, evidenceIds, "/decision/evidenceIds", issues);
  }
  for (const action of document.actions) {
    checkRefs(action.resultEvidenceIds, evidenceIds, `/actions/${action.id}/resultEvidenceIds`, issues);
  }
  if (document.outcome) {
    checkRefs(document.outcome.evidenceIds, evidenceIds, "/outcome/evidenceIds", issues);
  }
  if (Date.parse(document.updatedAt) < Date.parse(document.createdAt)) {
    issues.push(issue("/updatedAt", "must not be earlier than createdAt"));
  }
  return issues;
}

function validateWorkflowRelease(document: WorkflowModuleRelease): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checkIds = uniqueIds(document.checks, "/checks", issues);
  uniqueIds(document.steps, "/steps", issues);
  for (const step of document.steps) {
    checkRefs(step.checkIds, checkIds, `/steps/${step.id}/checkIds`, issues);
  }
  const inputNames = new Set<string>();
  for (const input of document.inputs) {
    if (inputNames.has(input.name)) {
      issues.push(issue("/inputs", `duplicate name: ${input.name}`));
    }
    inputNames.add(input.name);
  }
  return issues;
}

export function validateDocument(kind: DocumentKind, value: unknown): ValidationResult {
  const validator = validatorByKind[kind];
  if (!validator(value)) {
    return { ok: false, issues: schemaIssues(validator.errors) };
  }
  const domainIssues =
    kind === "task-dossier"
      ? validateDossier(value as TaskDossier)
      : kind === "workflow-module-release"
        ? validateWorkflowRelease(value as WorkflowModuleRelease)
        : [];
  return domainIssues.length === 0 ? { ok: true } : { ok: false, issues: domainIssues };
}

export function assertValidDocument(
  kind: DocumentKind,
  value: unknown,
): asserts value is CoreDocument {
  const result = validateDocument(kind, value);
  if (!result.ok) {
    const detail = result.issues.map(({ path, message }) => `${path} ${message}`).join("; ");
    throw new Error(`Invalid ${kind}: ${detail}`);
  }
}

const kindBySchemaVersion: Record<string, DocumentKind> = {
  "atlasrepo.core/task-dossier/v0.1": "task-dossier",
  "atlasrepo.core/workflow-module-release/v0.1": "workflow-module-release",
  "atlasrepo.core/route/v0.1": "route",
  "atlasrepo.core/execution-pack/v0.1": "execution-pack",
  "atlasrepo.core/result-pack/v0.1": "result-pack",
};

export function inferDocumentKind(value: unknown): DocumentKind {
  if (value === null || typeof value !== "object") {
    throw new Error("Document must be an object");
  }
  const version = (value as Record<string, unknown>).schemaVersion;
  if (typeof version !== "string" || !(version in kindBySchemaVersion)) {
    throw new Error(`Unsupported schemaVersion: ${String(version)}`);
  }
  return kindBySchemaVersion[version]!;
}

export function getSchema(kind: DocumentKind): Record<string, unknown> {
  return schemaByKind[kind] as Record<string, unknown>;
}
