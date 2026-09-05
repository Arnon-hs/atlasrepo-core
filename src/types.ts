export type DocumentKind =
  | "task-dossier"
  | "workflow-module-release"
  | "route"
  | "decision-pack"
  | "execution-pack"
  | "result-pack";

export interface Producer {
  name: string;
  version: string;
}

export interface Evidence {
  id: string;
  kind:
    | "document"
    | "repository-analysis"
    | "user-input"
    | "execution-result"
    | "dataset"
    | "other";
  title: string;
  uri?: string;
  digest: string;
  observedAt: string;
  producer: Producer;
  license?: string;
  limitations?: string[];
}

export interface EvidenceV02 {
  id: string;
  kind: Evidence["kind"];
  title: string;
  resourceRef: string;
  publicUri?: string;
  digest: string;
  observedAt: string;
  producer: Producer;
  accessHint: "public" | "restricted";
  license?: string;
  limitations: string[];
}

export interface Hypothesis {
  id: string;
  statement: string;
  status: "proposed" | "supported" | "rejected";
  evidenceIds: string[];
}

export interface Check {
  id: string;
  hypothesisId?: string;
  description: string;
  status: "pending" | "passed" | "failed" | "inconclusive";
  evidenceIds: string[];
}

export interface Decision {
  summary: string;
  rationale: string;
  hypothesisIds: string[];
  evidenceIds: string[];
  decidedAt: string;
}

export interface Action {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  resultEvidenceIds: string[];
}

export interface Outcome {
  status: "succeeded" | "partial" | "failed" | "unknown";
  summary: string;
  evidenceIds: string[];
  recordedAt: string;
}

export interface TaskDossierV01 {
  schemaVersion: "atlasrepo.core/task-dossier/v0.1";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  context: {
    description: string;
    constraints: string[];
  };
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  checks: Check[];
  decision?: Decision;
  actions: Action[];
  outcome?: Outcome;
  extensions?: Record<string, unknown>;
}

export type ClaimClassification = "confirmed" | "assumption" | "recommendation";
export type DecisionStatus = "recommended" | "conditional" | "abstained";

export interface EvidenceBackedClaim {
  id: string;
  statement: string;
  classification: ClaimClassification;
  evidenceIds: string[];
  limitations: string[];
}

export interface TaskDossierV02 {
  schemaVersion: "atlasrepo.core/task-dossier/v0.2";
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  context: {
    description: string;
    constraints: Array<{ id: string; description: string; required: boolean }>;
  };
  evidence: EvidenceV02[];
  claims: EvidenceBackedClaim[];
  hypotheses: Hypothesis[];
  checks: Array<Check & { required: boolean }>;
  decision?: Decision & {
    status: DecisionStatus;
    claimIds: string[];
    unresolvedGates: string[];
    limitations: string[];
  };
  actions: Action[];
  outcome?: Outcome;
  extensions?: Record<string, unknown>;
}

export type TaskDossier = TaskDossierV01;
export type AnyTaskDossier = TaskDossierV01 | TaskDossierV02;

export interface WorkflowModuleReleaseV01 {
  schemaVersion: "atlasrepo.core/workflow-module-release/v0.1";
  moduleId: string;
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  applicability: string[];
  inputs: Array<{ name: string; description: string; required: boolean }>;
  steps: Array<{ id: string; title: string; instruction: string; checkIds: string[] }>;
  checks: Array<{ id: string; description: string }>;
  materials: Array<{
    kind:
      | "lesson"
      | "article"
      | "video"
      | "prompt"
      | "skill"
      | "checklist"
      | "template"
      | "source-file"
      | "other";
    title: string;
    uri: string;
    digest: string;
  }>;
  extensions?: Record<string, unknown>;
}

export type WorkflowMaterialKind =
  | "lesson"
  | "article"
  | "video"
  | "prompt"
  | "skill"
  | "checklist"
  | "template"
  | "source-file"
  | "other";

export interface ModulePin {
  moduleId: string;
  version: string;
}

export interface WorkflowModuleReleaseV02 {
  schemaVersion: "atlasrepo.core/workflow-module-release/v0.2";
  moduleId: string;
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  locale: string;
  audiences: string[];
  applicability: string[];
  problem: string;
  intendedOutcomes: string[];
  exclusions: string[];
  evidence: EvidenceV02[];
  claims: EvidenceBackedClaim[];
  prerequisites: ModulePin[];
  relatedModules: Array<ModulePin & {
    relationship: "recommended" | "alternative" | "next";
  }>;
  inputs: Array<{
    name: string;
    description: string;
    required: boolean;
    valueSchema: Record<string, unknown>;
  }>;
  outputs: Array<{
    name: string;
    description: string;
    required: boolean;
    valueSchema: Record<string, unknown>;
  }>;
  steps: Array<{
    id: string;
    title: string;
    instruction: string;
    dependsOn: string[];
    checkIds: string[];
    executionPolicy: {
      effect: "read-only" | "local-write" | "external-write" | "destructive";
      approval: "not-required" | "required-before-step";
      networkDomains: string[];
      secretNames: string[];
      timeoutSeconds: number;
      costLimitUsd?: number;
      idempotency: "not-applicable" | "idempotent" | "requires-key";
      maxAttempts: number;
      recovery: string;
    };
  }>;
  checks: Array<{
    id: string;
    description: string;
    evidenceRequirements: string[];
  }>;
  readinessCriteria: Array<{
    id: string;
    description: string;
    required: boolean;
    checkIds: string[];
  }>;
  materials: Array<{
    id: string;
    kind: WorkflowMaterialKind;
    title: string;
    resourceRef: string;
    bundlePath?: string;
    publicUri?: string;
    digest: string;
    mediaType: string;
    locale: string;
    accessHint: "public" | "restricted";
    license: string;
    attribution: string;
    evidenceIds: string[];
    limitations: string[];
  }>;
  extensions?: Record<string, unknown>;
}

export type WorkflowModuleRelease = WorkflowModuleReleaseV01;
export type AnyWorkflowModuleRelease =
  | WorkflowModuleReleaseV01
  | WorkflowModuleReleaseV02;

export interface PinnedRouteV01 {
  schemaVersion: "atlasrepo.core/route/v0.1";
  id: string;
  createdAt: string;
  title: string;
  modules: ModulePin[];
}

export type CriterionStatus = "fulfilled" | "unresolved" | "failed";
export type ConstraintCoverageStatus = "covered" | "unresolved" | "failed";

export interface PinnedRouteV02 {
  schemaVersion: "atlasrepo.core/route/v0.2";
  id: string;
  createdAt: string;
  title: string;
  goal: string;
  dossier: { id: string; revision: number; digest: string };
  status: DecisionStatus;
  unresolvedGates: string[];
  constraintCoverage: Array<{
    constraintId: string;
    status: ConstraintCoverageStatus;
    moduleIds: string[];
  }>;
  modules: Array<ModulePin & {
    digest: string;
    rationale: string;
    dependsOn: ModulePin[];
    criterionResults: Array<{
      criterionId: string;
      status: CriterionStatus;
      evidenceIds: string[];
    }>;
  }>;
}

export type PinnedRoute = PinnedRouteV01;
export type AnyPinnedRoute = PinnedRouteV01 | PinnedRouteV02;

export interface DecisionPack {
  schemaVersion: "atlasrepo.core/decision-pack/v0.1";
  id: string;
  createdAt: string;
  status: DecisionStatus;
  answer: string;
  dossier: { id: string; revision: number; digest: string };
  route: { id: string; digest: string };
  modules: Array<ModulePin & { digest: string; title: string }>;
  citations: Array<{
    evidenceId: string;
    title: string;
    resourceRef: string;
    publicUri?: string;
    digest: string;
    accessHint: "public" | "restricted";
  }>;
  unresolvedGates: string[];
  limitations: string[];
}

export interface ExecutionPack {
  schemaVersion: "atlasrepo.core/execution-pack/v0.1";
  id: string;
  dossierId: string;
  createdAt: string;
  scope: string;
  constraints: string[];
  steps: Array<{ id: string; instruction: string }>;
  expectedArtifacts: string[];
}

export interface ResultPack {
  schemaVersion: "atlasrepo.core/result-pack/v0.1";
  id: string;
  executionPackId: string;
  completedAt: string;
  status: "succeeded" | "partial" | "failed";
  summary: string;
  evidence: Array<{ title: string; digest: string; uri: string }>;
}

export type CoreDocument =
  | AnyTaskDossier
  | AnyWorkflowModuleRelease
  | AnyPinnedRoute
  | DecisionPack
  | ExecutionPack
  | ResultPack;

export interface CoreDocumentByKind {
  "task-dossier": AnyTaskDossier;
  "workflow-module-release": AnyWorkflowModuleRelease;
  route: AnyPinnedRoute;
  "decision-pack": DecisionPack;
  "execution-pack": ExecutionPack;
  "result-pack": ResultPack;
}

export interface StructuredGenerationRequest {
  schema: Record<string, unknown>;
  prompt: string;
  evidence: Evidence[];
}

export interface StructuredGenerationResult<T> {
  value: T;
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}

export interface ModelProvider {
  readonly name: string;
  generate<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

export interface EvidenceRequest {
  query: string;
  constraints: string[];
}

export interface EvidenceProvider {
  readonly name: string;
  collect(request: EvidenceRequest): Promise<Evidence[]>;
}

export interface ArtifactStore {
  put(kind: DocumentKind, document: CoreDocument, expectedRevision?: number): Promise<void>;
  get(kind: DocumentKind, id: string): Promise<CoreDocument>;
  list(kind: DocumentKind): Promise<CoreDocument[]>;
}
