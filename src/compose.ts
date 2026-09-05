import { canonicalJson, sha256Digest } from "./canonical.js";
import type {
  DecisionPack,
  DecisionStatus,
  EvidenceV02,
  PinnedRouteV02,
  TaskDossierV02,
  WorkflowModuleReleaseV02,
} from "./types.js";
import { assertValidDocument } from "./validate.js";

export interface ComposeDecisionPackInput {
  dossier: TaskDossierV02;
  route: PinnedRouteV02;
  modules: WorkflowModuleReleaseV02[];
  packId: string;
  createdAt: string;
  answer: string;
  limitations: string[];
}

function pinKey(value: { moduleId: string; version: string }): string {
  return `${value.moduleId}@${value.version}`;
}

function mergeStatus(left: DecisionStatus, right: DecisionStatus): DecisionStatus {
  const rank: Record<DecisionStatus, number> = {
    recommended: 0,
    conditional: 1,
    abstained: 2,
  };
  return rank[left] >= rank[right] ? left : right;
}

function requiredRouteStatus(
  dossier: TaskDossierV02,
  route: PinnedRouteV02,
  modules: Map<string, WorkflowModuleReleaseV02>,
): DecisionStatus {
  let status: DecisionStatus = dossier.decision?.status ?? "abstained";
  const constraints = new Map(dossier.context.constraints.map((value) => [value.id, value]));
  const coverage = new Map(route.constraintCoverage.map((value) => [value.constraintId, value]));

  for (const check of dossier.checks) {
    if (!check.required) continue;
    if (check.status === "failed") status = "abstained";
    if (check.status === "pending" || check.status === "inconclusive") {
      status = mergeStatus(status, "conditional");
    }
  }

  for (const constraint of constraints.values()) {
    if (!constraint.required) continue;
    const result = coverage.get(constraint.id);
    if (!result || result.status === "unresolved") status = mergeStatus(status, "conditional");
    if (result?.status === "failed") status = "abstained";
  }

  for (const routeModule of route.modules) {
    const release = modules.get(pinKey(routeModule));
    if (!release) continue;
    const results = new Map(
      routeModule.criterionResults.map((result) => [result.criterionId, result]),
    );
    for (const criterion of release.readinessCriteria) {
      if (!criterion.required) continue;
      const result = results.get(criterion.id);
      if (!result || result.status === "unresolved") status = mergeStatus(status, "conditional");
      if (result?.status === "failed") status = "abstained";
    }
  }

  if (route.unresolvedGates.length > 0) status = mergeStatus(status, "conditional");
  return status;
}

function addEvidence(
  target: Map<string, EvidenceV02>,
  evidence: EvidenceV02[],
  source: string,
): void {
  for (const item of evidence) {
    const existing = target.get(item.id);
    if (existing) {
      const existingIdentity = { ...existing, limitations: [] };
      const itemIdentity = { ...item, limitations: [] };
      if (canonicalJson(existingIdentity) !== canonicalJson(itemIdentity)) {
        throw new Error(`Evidence id ${item.id} has conflicting metadata in ${source}`);
      }
      target.set(item.id, {
        ...existing,
        limitations: [...new Set([...existing.limitations, ...item.limitations])].sort(),
      });
    } else {
      target.set(item.id, { ...item, limitations: [...item.limitations] });
    }
  }
}

function assertExactRoute(
  dossier: TaskDossierV02,
  route: PinnedRouteV02,
  releases: Map<string, WorkflowModuleReleaseV02>,
): void {
  if (
    route.dossier.id !== dossier.id ||
    route.dossier.revision !== dossier.revision ||
    route.dossier.digest !== sha256Digest(dossier)
  ) {
    throw new Error("Route dossier pin does not match the supplied dossier");
  }
  if (!dossier.decision) throw new Error("A dossier decision is required to compose a decision pack");

  const selected = new Set(route.modules.map(pinKey));
  if (selected.size !== route.modules.length) throw new Error("Route contains duplicate module pins");
  if (releases.size !== route.modules.length) {
    throw new Error("Supplied module releases must exactly match the route");
  }

  const index = new Map(route.modules.map((module, position) => [pinKey(module), position]));
  const constraintIds = new Set(dossier.context.constraints.map(({ id }) => id));
  const coveredConstraints = new Set<string>();

  for (const coverage of route.constraintCoverage) {
    if (!constraintIds.has(coverage.constraintId)) {
      throw new Error(`Route references unknown constraint ${coverage.constraintId}`);
    }
    coveredConstraints.add(coverage.constraintId);
  }
  for (const constraint of dossier.context.constraints) {
    if (constraint.required && !coveredConstraints.has(constraint.id)) {
      throw new Error(`Route omits required constraint ${constraint.id}`);
    }
  }

  for (const routeModule of route.modules) {
    const key = pinKey(routeModule);
    const release = releases.get(key);
    if (!release) throw new Error(`Missing module release ${key}`);
    if (routeModule.digest !== sha256Digest(release)) {
      throw new Error(`Digest mismatch for module release ${key}`);
    }
    const expectedCriteria = new Set(release.readinessCriteria.map(({ id }) => id));
    const actualCriteria = new Set(routeModule.criterionResults.map(({ criterionId }) => criterionId));
    for (const criterion of expectedCriteria) {
      if (!actualCriteria.has(criterion)) throw new Error(`Route omits criterion ${key}#${criterion}`);
    }
    for (const criterion of actualCriteria) {
      if (!expectedCriteria.has(criterion)) throw new Error(`Route references unknown criterion ${key}#${criterion}`);
    }

    const declaredDependencies = new Set(routeModule.dependsOn.map(pinKey));
    const prerequisites = new Set(release.prerequisites.map(pinKey));
    if (
      declaredDependencies.size !== prerequisites.size ||
      [...declaredDependencies].some((dependency) => !prerequisites.has(dependency))
    ) {
      throw new Error(`Route dependencies do not match release prerequisites for ${key}`);
    }
    for (const dependency of declaredDependencies) {
      if (!selected.has(dependency)) throw new Error(`Missing dependency ${dependency} required by ${key}`);
      if ((index.get(dependency) ?? Number.POSITIVE_INFINITY) >= (index.get(key) ?? -1)) {
        throw new Error(`Dependency ${dependency} must precede ${key}`);
      }
    }
  }
}

export function composeDecisionPack(input: ComposeDecisionPackInput): DecisionPack {
  assertValidDocument("task-dossier", input.dossier);
  assertValidDocument("route", input.route);
  for (const module of input.modules) assertValidDocument("workflow-module-release", module);

  const releases = new Map<string, WorkflowModuleReleaseV02>();
  for (const module of input.modules) {
    const key = pinKey(module);
    if (releases.has(key)) throw new Error(`Duplicate supplied module release ${key}`);
    releases.set(key, module);
  }
  assertExactRoute(input.dossier, input.route, releases);

  const status = requiredRouteStatus(input.dossier, input.route, releases);
  if (input.route.status !== status) {
    throw new Error(`Route status ${input.route.status} must be ${status}`);
  }

  const evidence = new Map<string, EvidenceV02>();
  addEvidence(evidence, input.dossier.evidence, "dossier");
  for (const module of input.modules) addEvidence(evidence, module.evidence, pinKey(module));

  const citationIds = new Set<string>();
  const addRefs = (ids: string[]): void => {
    for (const id of ids) {
      if (!evidence.has(id)) throw new Error(`Decision route references unknown evidence ${id}`);
      citationIds.add(id);
    }
  };
  addRefs(input.dossier.decision?.evidenceIds ?? []);
  for (const check of input.dossier.checks) {
    if (check.required) addRefs(check.evidenceIds);
  }
  const claimById = new Map(input.dossier.claims.map((claim) => [claim.id, claim]));
  for (const claimId of input.dossier.decision?.claimIds ?? []) {
    const claim = claimById.get(claimId);
    if (!claim) throw new Error(`Decision references unknown claim ${claimId}`);
    addRefs(claim.evidenceIds);
  }
  for (const module of input.route.modules) {
    for (const criterion of module.criterionResults) addRefs(criterion.evidenceIds);
  }

  const unresolvedGates = [...new Set([
    ...(input.dossier.decision?.unresolvedGates ?? []),
    ...input.route.unresolvedGates,
  ])].sort();
  if (status === "conditional" && unresolvedGates.length === 0) {
    throw new Error("A conditional decision pack requires at least one explicit unresolved gate");
  }
  const limitations = [...new Set([
    ...input.limitations,
    ...(input.dossier.decision?.limitations ?? []),
    ...[...citationIds].flatMap((id) => evidence.get(id)?.limitations ?? []),
  ])].sort();

  const decisionPack: DecisionPack = {
    schemaVersion: "atlasrepo.core/decision-pack/v0.1",
    id: input.packId,
    createdAt: input.createdAt,
    status,
    answer: input.answer,
    dossier: {
      id: input.dossier.id,
      revision: input.dossier.revision,
      digest: sha256Digest(input.dossier),
    },
    route: { id: input.route.id, digest: sha256Digest(input.route) },
    modules: input.route.modules.map((module) => {
      const release = releases.get(pinKey(module))!;
      return {
        moduleId: module.moduleId,
        version: module.version,
        digest: module.digest,
        title: release.title,
      };
    }),
    citations: [...citationIds].map((id) => {
      const item = evidence.get(id)!;
      return {
        evidenceId: item.id,
        title: item.title,
        resourceRef: item.resourceRef,
        ...(item.accessHint === "public" && item.publicUri ? { publicUri: item.publicUri } : {}),
        digest: item.digest,
        accessHint: item.accessHint,
      };
    }),
    unresolvedGates,
    limitations,
  };
  assertValidDocument("decision-pack", decisionPack);
  return decisionPack;
}
