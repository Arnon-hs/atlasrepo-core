import Ajv2020Module, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./canonical.js";
import type {
  CoreDocumentByKind,
  DecisionPack,
  DocumentKind,
  EvidenceV02,
  PinnedRouteV02,
  TaskDossier,
  TaskDossierV02,
  WorkflowModuleReleaseV01,
  WorkflowModuleReleaseV02,
} from "./types.js";

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot, "schemas", name), "utf8")) as Record<
    string,
    unknown
  >;
}

const schemaByVersion = {
  "atlasrepo.core/task-dossier/v0.1": loadSchema("task-dossier.v0.1.schema.json"),
  "atlasrepo.core/task-dossier/v0.2": loadSchema("task-dossier.v0.2.schema.json"),
  "atlasrepo.core/workflow-module-release/v0.1": loadSchema(
    "workflow-module-release.v0.1.schema.json",
  ),
  "atlasrepo.core/workflow-module-release/v0.2": loadSchema(
    "workflow-module-release.v0.2.schema.json",
  ),
  "atlasrepo.core/route/v0.1": loadSchema("route.v0.1.schema.json"),
  "atlasrepo.core/route/v0.2": loadSchema("route.v0.2.schema.json"),
  "atlasrepo.core/decision-pack/v0.1": loadSchema("decision-pack.v0.1.schema.json"),
  "atlasrepo.core/execution-pack/v0.1": loadSchema("execution-pack.v0.1.schema.json"),
  "atlasrepo.core/result-pack/v0.1": loadSchema("result-pack.v0.1.schema.json"),
} satisfies Record<string, Record<string, unknown>>;

type SchemaVersion = keyof typeof schemaByVersion;

const kindBySchemaVersion: Record<SchemaVersion, DocumentKind> = {
  "atlasrepo.core/task-dossier/v0.1": "task-dossier",
  "atlasrepo.core/task-dossier/v0.2": "task-dossier",
  "atlasrepo.core/workflow-module-release/v0.1": "workflow-module-release",
  "atlasrepo.core/workflow-module-release/v0.2": "workflow-module-release",
  "atlasrepo.core/route/v0.1": "route",
  "atlasrepo.core/route/v0.2": "route",
  "atlasrepo.core/decision-pack/v0.1": "decision-pack",
  "atlasrepo.core/execution-pack/v0.1": "execution-pack",
  "atlasrepo.core/result-pack/v0.1": "result-pack",
};

const latestSchemaVersionByKind: Record<DocumentKind, SchemaVersion> = {
  "task-dossier": "atlasrepo.core/task-dossier/v0.2",
  "workflow-module-release": "atlasrepo.core/workflow-module-release/v0.2",
  route: "atlasrepo.core/route/v0.2",
  "decision-pack": "atlasrepo.core/decision-pack/v0.1",
  "execution-pack": "atlasrepo.core/execution-pack/v0.1",
  "result-pack": "atlasrepo.core/result-pack/v0.1",
};

const defaultSchemaVersionByKind: Record<DocumentKind, SchemaVersion> = {
  "task-dossier": "atlasrepo.core/task-dossier/v0.1",
  "workflow-module-release": "atlasrepo.core/workflow-module-release/v0.1",
  route: "atlasrepo.core/route/v0.1",
  "decision-pack": "atlasrepo.core/decision-pack/v0.1",
  "execution-pack": "atlasrepo.core/execution-pack/v0.1",
  "result-pack": "atlasrepo.core/result-pack/v0.1",
};

const Ajv2020 = Ajv2020Module as unknown as new (options: object) => {
  compile(schema: object): ValidateFunction;
};
const addFormats = addFormatsModule as unknown as (ajv: object) => void;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validatorByVersion = Object.fromEntries(
  Object.entries(schemaByVersion).map(([version, schema]) => [version, ajv.compile(schema)]),
) as Record<SchemaVersion, ValidateFunction>;

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
    if (ids.has(value.id)) issues.push(issue(path, `duplicate id: ${value.id}`));
    ids.add(value.id);
  }
  return ids;
}

function uniqueNames(
  values: Array<{ name: string }>,
  path: string,
  issues: ValidationIssue[],
): void {
  const names = new Set<string>();
  for (const value of values) {
    if (names.has(value.name)) issues.push(issue(path, `duplicate name: ${value.name}`));
    names.add(value.name);
  }
}

function checkRefs(
  refs: string[],
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const ref of refs) {
    if (!allowed.has(ref)) issues.push(issue(path, `unknown reference: ${ref}`));
  }
}

function validateDossierCommon(document: TaskDossier | TaskDossierV02): ValidationIssue[] {
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

const sensitiveParameterNames = new Set([
  "access-key",
  "access_key",
  "access-token",
  "access_token",
  "apikey",
  "api-key",
  "api_key",
  "auth",
  "authorization",
  "bearer",
  "credential",
  "key",
  "sig",
  "signature",
  "token",
]);

function sensitiveParameter(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    sensitiveParameterNames.has(normalized) ||
    normalized.startsWith("x-amz-") ||
    normalized.startsWith("x-goog-") ||
    normalized.startsWith("x-ms-")
  );
}

function validateReference(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
  publicOnly = false,
): void {
  if (!value) return;
  if (/\s|[\u0000-\u001f\u007f]/u.test(value)) {
    issues.push(issue(path, "must not contain whitespace or control characters"));
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    if (publicOnly || /^https?:/i.test(value)) issues.push(issue(path, "must be a valid URL"));
    return;
  }
  if (publicOnly && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    issues.push(issue(path, "must use the http or https scheme"));
  }
  if (["blob:", "data:", "file:", "javascript:"].includes(parsed.protocol)) {
    issues.push(issue(path, `must not use the ${parsed.protocol} scheme`));
  }
  if (["authorization:", "bearer:", "basic:", "token:", "apikey:", "api-key:"].includes(parsed.protocol)) {
    issues.push(issue(path, `must not use the ${parsed.protocol} credential scheme`));
  }
  if (parsed.username || parsed.password) {
    issues.push(issue(path, "must not contain embedded credentials"));
  }
  for (const key of parsed.searchParams.keys()) {
    if (sensitiveParameter(key)) issues.push(issue(path, `must not contain secret query parameter: ${key}`));
  }
  let fragment = parsed.hash;
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    issues.push(issue(path, "contains a malformed URL fragment"));
    return;
  }
  const fragmentParameters = new URLSearchParams(fragment.replace(/^#/, ""));
  for (const key of fragmentParameters.keys()) {
    if (sensitiveParameter(key)) {
      issues.push(issue(path, `must not contain secret fragment parameter: ${key}`));
    }
  }
}

function validateEvidenceV02(
  evidence: EvidenceV02[],
  path: string,
  issues: ValidationIssue[],
): Set<string> {
  const ids = uniqueIds(evidence, path, issues);
  for (const item of evidence) {
    validateReference(item.resourceRef, `${path}/${item.id}/resourceRef`, issues);
    validateReference(item.publicUri, `${path}/${item.id}/publicUri`, issues, true);
    if (item.accessHint === "restricted" && item.publicUri) {
      issues.push(issue(`${path}/${item.id}/publicUri`, "restricted evidence must not expose a public URI"));
    }
  }
  return ids;
}

function validateDossierV02(document: TaskDossierV02): ValidationIssue[] {
  const issues = validateDossierCommon(document);
  const evidenceIds = validateEvidenceV02(document.evidence, "/evidence", issues);
  const claimIds = uniqueIds(document.claims, "/claims", issues);
  uniqueIds(document.context.constraints, "/context/constraints", issues);

  for (const claim of document.claims) {
    checkRefs(claim.evidenceIds, evidenceIds, `/claims/${claim.id}/evidenceIds`, issues);
    if (claim.evidenceIds.length === 0) {
      issues.push(issue(`/claims/${claim.id}/evidenceIds`, `${claim.classification} claim requires evidence`));
    }
  }
  for (const hypothesis of document.hypotheses) {
    if (hypothesis.status !== "proposed" && hypothesis.evidenceIds.length === 0) {
      issues.push(issue(`/hypotheses/${hypothesis.id}/evidenceIds`, `${hypothesis.status} hypothesis requires evidence`));
    }
  }
  for (const check of document.checks) {
    if ((check.status === "passed" || check.status === "failed") && check.evidenceIds.length === 0) {
      issues.push(issue(`/checks/${check.id}/evidenceIds`, `${check.status} check requires evidence`));
    }
  }
  if (document.decision) {
    checkRefs(document.decision.claimIds, claimIds, "/decision/claimIds", issues);
    if (document.decision.status === "recommended" && document.decision.unresolvedGates.length > 0) {
      issues.push(issue("/decision/status", "recommended decision cannot have unresolved gates"));
    }
    if (document.decision.status === "conditional" && document.decision.unresolvedGates.length === 0) {
      issues.push(issue("/decision/unresolvedGates", "conditional decision requires an explicit unresolved gate"));
    }
    const requiredFailed = document.checks.some(
      ({ required, status }) => required && status === "failed",
    );
    const requiredUnresolved = document.checks.some(
      ({ required, status }) =>
        required && (status === "pending" || status === "inconclusive"),
    );
    if (requiredFailed && document.decision.status !== "abstained") {
      issues.push(issue("/decision/status", "failed required check requires an abstained decision"));
    }
    if (requiredUnresolved && document.decision.status === "recommended") {
      issues.push(issue("/decision/status", "unresolved required check cannot produce a recommended decision"));
    }
  }
  for (const action of document.actions) {
    if ((action.status === "completed" || action.status === "failed") && action.resultEvidenceIds.length === 0) {
      issues.push(issue(`/actions/${action.id}/resultEvidenceIds`, `${action.status} action requires result evidence`));
    }
  }
  if (document.outcome && document.outcome.status !== "unknown" && document.outcome.evidenceIds.length === 0) {
    issues.push(issue("/outcome/evidenceIds", `${document.outcome.status} outcome requires evidence`));
  }
  return issues;
}

function validateWorkflowV01(document: WorkflowModuleReleaseV01): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checkIds = uniqueIds(document.checks, "/checks", issues);
  uniqueIds(document.steps, "/steps", issues);
  for (const step of document.steps) {
    checkRefs(step.checkIds, checkIds, `/steps/${step.id}/checkIds`, issues);
  }
  uniqueNames(document.inputs, "/inputs", issues);
  return issues;
}

function validateDag(
  nodes: Array<{ id: string; dependsOn: string[] }>,
  path: string,
  issues: ValidationIssue[],
): void {
  const ids = new Set(nodes.map(({ id }) => id));
  const dependencies = new Map(nodes.map(({ id, dependsOn }) => [id, dependsOn]));
  for (const node of nodes) {
    checkRefs(node.dependsOn, ids, `${path}/${node.id}/dependsOn`, issues);
    if (node.dependsOn.includes(node.id)) issues.push(issue(`${path}/${node.id}/dependsOn`, "self dependency is not allowed"));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push(issue(path, `dependency cycle includes: ${id}`));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (ids.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

function modulePinKey(pin: { moduleId: string; version: string }): string {
  return `${pin.moduleId}@${pin.version}`;
}

function uniqueModulePins(
  values: Array<{ moduleId: string; version: string }>,
  path: string,
  issues: ValidationIssue[],
): void {
  const keys = new Set<string>();
  for (const value of values) {
    const key = modulePinKey(value);
    if (keys.has(key)) issues.push(issue(path, `duplicate module pin: ${key}`));
    keys.add(key);
  }
}

function validateBundlePath(value: string | undefined, path: string, issues: ValidationIssue[]): void {
  if (!value) return;
  const normalized = normalize(value);
  if (
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").includes("..") ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    issues.push(issue(path, "must be a relative path contained by the bundle"));
  }
}

function validateWorkflowV02(document: WorkflowModuleReleaseV02): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const evidenceIds = validateEvidenceV02(document.evidence, "/evidence", issues);
  const claimIds = uniqueIds(document.claims, "/claims", issues);
  const checkIds = uniqueIds(document.checks, "/checks", issues);
  const stepIds = uniqueIds(document.steps, "/steps", issues);
  const criterionIds = uniqueIds(document.readinessCriteria, "/readinessCriteria", issues);
  const materialIds = uniqueIds(document.materials, "/materials", issues);
  void claimIds;
  void criterionIds;
  void materialIds;

  for (const claim of document.claims) {
    checkRefs(claim.evidenceIds, evidenceIds, `/claims/${claim.id}/evidenceIds`, issues);
    if (claim.evidenceIds.length === 0) {
      issues.push(issue(`/claims/${claim.id}/evidenceIds`, `${claim.classification} claim requires evidence`));
    }
  }
  for (const step of document.steps) {
    checkRefs(step.checkIds, checkIds, `/steps/${step.id}/checkIds`, issues);
    checkRefs(step.dependsOn, stepIds, `/steps/${step.id}/dependsOn`, issues);
    const { approval, effect } = step.executionPolicy;
    if ((effect === "external-write" || effect === "destructive") && approval !== "required-before-step") {
      issues.push(issue(`/steps/${step.id}/executionPolicy/approval`, `${effect} step requires explicit approval`));
    }
    if (
      step.executionPolicy.idempotency === "not-applicable" &&
      step.executionPolicy.maxAttempts !== 1
    ) {
      issues.push(issue(`/steps/${step.id}/executionPolicy/maxAttempts`, "non-idempotent step must allow exactly one attempt"));
    }
    if (effect === "destructive" && step.executionPolicy.maxAttempts !== 1) {
      issues.push(issue(`/steps/${step.id}/executionPolicy/maxAttempts`, "destructive step must allow exactly one attempt"));
    }
  }
  validateDag(document.steps, "/steps", issues);
  for (const criterion of document.readinessCriteria) {
    checkRefs(criterion.checkIds, checkIds, `/readinessCriteria/${criterion.id}/checkIds`, issues);
  }
  for (const material of document.materials) {
    checkRefs(material.evidenceIds, evidenceIds, `/materials/${material.id}/evidenceIds`, issues);
    validateReference(material.resourceRef, `/materials/${material.id}/resourceRef`, issues);
    validateReference(material.publicUri, `/materials/${material.id}/publicUri`, issues, true);
    validateBundlePath(material.bundlePath, `/materials/${material.id}/bundlePath`, issues);
    if (!material.bundlePath && !material.publicUri) {
      issues.push(issue(`/materials/${material.id}`, "requires bundlePath or publicUri"));
    }
    if (material.accessHint === "restricted" && material.publicUri) {
      issues.push(issue(`/materials/${material.id}/publicUri`, "restricted material must not expose a public URI"));
    }
  }
  uniqueNames(document.inputs, "/inputs", issues);
  uniqueNames(document.outputs, "/outputs", issues);
  uniqueModulePins(document.prerequisites, "/prerequisites", issues);
  uniqueModulePins(document.relatedModules, "/relatedModules", issues);
  for (const pin of [...document.prerequisites, ...document.relatedModules]) {
    if (pin.moduleId === document.moduleId) {
      issues.push(issue("/prerequisites", "module cannot reference another version of itself"));
    }
  }
  return issues;
}

function validateRouteV02(document: PinnedRouteV02): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const moduleIds = new Set<string>();
  const constraintIds = new Set<string>();
  for (const module of document.modules) {
    if (moduleIds.has(module.moduleId)) issues.push(issue("/modules", `duplicate module: ${module.moduleId}`));
    moduleIds.add(module.moduleId);
    const criteria = new Set<string>();
    for (const criterion of module.criterionResults) {
      if (criteria.has(criterion.criterionId)) {
        issues.push(issue(`/modules/${module.moduleId}/criterionResults`, `duplicate criterion: ${criterion.criterionId}`));
      }
      criteria.add(criterion.criterionId);
      if (
        (criterion.status === "fulfilled" || criterion.status === "failed") &&
        criterion.evidenceIds.length === 0
      ) {
        issues.push(
          issue(
            `/modules/${module.moduleId}/criterionResults/${criterion.criterionId}/evidenceIds`,
            `${criterion.status} criterion requires evidence`,
          ),
        );
      }
    }
  }
  for (const coverage of document.constraintCoverage) {
    if (constraintIds.has(coverage.constraintId)) {
      issues.push(issue("/constraintCoverage", `duplicate constraint: ${coverage.constraintId}`));
    }
    constraintIds.add(coverage.constraintId);
    checkRefs(coverage.moduleIds, moduleIds, `/constraintCoverage/${coverage.constraintId}/moduleIds`, issues);
    if (coverage.status === "covered" && coverage.moduleIds.length === 0) {
      issues.push(
        issue(
          `/constraintCoverage/${coverage.constraintId}/moduleIds`,
          "covered constraint requires at least one selected module",
        ),
      );
    }
  }
  const criterionStatuses = document.modules.flatMap(({ criterionResults }) =>
    criterionResults.map(({ status }) => status),
  );
  const coverageStatuses = document.constraintCoverage.map(({ status }) => status);
  const hasUnresolved =
    criterionStatuses.includes("unresolved") || coverageStatuses.includes("unresolved");
  if (document.status === "conditional" && !hasUnresolved && document.unresolvedGates.length === 0) {
    issues.push(issue("/status", "conditional route requires an unresolved result or explicit gate"));
  }
  if (document.status === "recommended" && document.unresolvedGates.length > 0) {
    issues.push(issue("/status", "recommended route cannot contain unresolved gates"));
  }
  return issues;
}

function validateDecisionPack(document: DecisionPack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const moduleIds = new Set<string>();
  for (const module of document.modules) {
    if (moduleIds.has(module.moduleId)) issues.push(issue("/modules", `duplicate module: ${module.moduleId}`));
    moduleIds.add(module.moduleId);
  }
  uniqueIds(
    document.citations.map((citation) => ({ id: citation.evidenceId })),
    "/citations",
    issues,
  );
  for (const citation of document.citations) {
    validateReference(citation.resourceRef, `/citations/${citation.evidenceId}/resourceRef`, issues);
    validateReference(citation.publicUri, `/citations/${citation.evidenceId}/publicUri`, issues, true);
    if (citation.accessHint === "restricted" && citation.publicUri) {
      issues.push(
        issue(
          `/citations/${citation.evidenceId}/publicUri`,
          "restricted citation must not expose a public URI",
        ),
      );
    }
  }
  if (document.status === "recommended" && document.unresolvedGates.length > 0) {
    issues.push(issue("/status", "recommended decision pack cannot have unresolved gates"));
  }
  if (document.status === "conditional" && document.unresolvedGates.length === 0) {
    issues.push(issue("/status", "conditional decision pack requires an explicit unresolved gate"));
  }
  return issues;
}

function schemaVersion(value: unknown): SchemaVersion | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const version = (value as Record<string, unknown>).schemaVersion;
  return typeof version === "string" && Object.hasOwn(schemaByVersion, version)
    ? (version as SchemaVersion)
    : undefined;
}

export function validateDocument(kind: DocumentKind, value: unknown): ValidationResult {
  try {
    canonicalJson(value);
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          "/",
          error instanceof Error ? error.message : "document must be JSON-compatible",
        ),
      ],
    };
  }
  const version = schemaVersion(value);
  if (!version) {
    return {
      ok: false,
      issues: [issue("/schemaVersion", `unsupported schemaVersion: ${String((value as Record<string, unknown> | null)?.schemaVersion)}`)],
    };
  }
  if (kindBySchemaVersion[version] !== kind) {
    return { ok: false, issues: [issue("/schemaVersion", `does not identify a ${kind} document`)] };
  }
  const validator = validatorByVersion[version];
  if (!validator(value)) return { ok: false, issues: schemaIssues(validator.errors) };

  let domainIssues: ValidationIssue[] = [];
  if (version === "atlasrepo.core/task-dossier/v0.1") {
    domainIssues = validateDossierCommon(value as TaskDossier);
  } else if (version === "atlasrepo.core/task-dossier/v0.2") {
    domainIssues = validateDossierV02(value as TaskDossierV02);
  } else if (version === "atlasrepo.core/workflow-module-release/v0.1") {
    domainIssues = validateWorkflowV01(value as WorkflowModuleReleaseV01);
  } else if (version === "atlasrepo.core/workflow-module-release/v0.2") {
    domainIssues = validateWorkflowV02(value as WorkflowModuleReleaseV02);
  } else if (version === "atlasrepo.core/route/v0.2") {
    domainIssues = validateRouteV02(value as PinnedRouteV02);
  } else if (version === "atlasrepo.core/decision-pack/v0.1") {
    domainIssues = validateDecisionPack(value as DecisionPack);
  }
  return domainIssues.length === 0 ? { ok: true } : { ok: false, issues: domainIssues };
}

export function assertValidDocument<K extends DocumentKind>(
  kind: K,
  value: unknown,
): asserts value is CoreDocumentByKind[K] {
  const result = validateDocument(kind, value);
  if (!result.ok) {
    const detail = result.issues.map(({ path, message }) => `${path} ${message}`).join("; ");
    throw new Error(`Invalid ${kind}: ${detail}`);
  }
}

export function inferDocumentKind(value: unknown): DocumentKind {
  const version = schemaVersion(value);
  if (!version) {
    const raw =
      value !== null && typeof value === "object"
        ? (value as Record<string, unknown>).schemaVersion
        : undefined;
    throw new Error(`Unsupported schemaVersion: ${String(raw)}`);
  }
  return kindBySchemaVersion[version];
}

export function getSchema(
  kind: DocumentKind,
  version: string = defaultSchemaVersionByKind[kind],
): Record<string, unknown> {
  if (!Object.hasOwn(schemaByVersion, version) || kindBySchemaVersion[version as SchemaVersion] !== kind) {
    throw new Error(`Unsupported ${kind} schemaVersion: ${version}`);
  }
  return schemaByVersion[version as SchemaVersion];
}

export function getLatestSchema(kind: DocumentKind): Record<string, unknown> {
  return getSchema(kind, latestSchemaVersionByKind[kind]);
}
