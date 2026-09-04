export type DocumentKind =
  | "task-dossier"
  | "workflow-module-release"
  | "route"
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

export interface TaskDossier {
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

export interface WorkflowModuleRelease {
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

export interface PinnedRoute {
  schemaVersion: "atlasrepo.core/route/v0.1";
  id: string;
  createdAt: string;
  title: string;
  modules: Array<{ moduleId: string; version: string }>;
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
  | TaskDossier
  | WorkflowModuleRelease
  | PinnedRoute
  | ExecutionPack
  | ResultPack;

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

