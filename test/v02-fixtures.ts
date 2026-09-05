import { sha256Digest } from "../src/index.js";
import type {
  ComposeDecisionPackInput,
  EvidenceV02,
  PinnedRouteV02,
  TaskDossierV02,
  WorkflowModuleReleaseV02,
} from "../src/index.js";

const firstDigest = `sha256:${"1".repeat(64)}`;
const secondDigest = `sha256:${"2".repeat(64)}`;
const materialDigest = `sha256:${"3".repeat(64)}`;

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function dossierEvidence(): EvidenceV02 {
  return {
    id: "dossier-evidence",
    kind: "repository-analysis",
    title: "Pinned Dify repository analysis",
    resourceRef: "atlasrepo://evidence/dify-source",
    publicUri: "https://github.com/langgenius/dify/tree/0123456789abcdef0123456789abcdef01234567",
    digest: firstDigest,
    observedAt: "2026-09-05T00:00:00.000Z",
    producer: { name: "atlas-engine", version: "0.4.2" },
    accessHint: "public",
    license: "Dify Open Source License",
    limitations: ["License terms require manual review"],
  };
}

export function moduleEvidence(): EvidenceV02 {
  return {
    id: "module-evidence",
    kind: "execution-result",
    title: "Pinned local verification receipt",
    resourceRef: "atlasrepo://evidence/dify-local-check",
    digest: secondDigest,
    observedAt: "2026-09-05T00:05:00.000Z",
    producer: { name: "atlasrepo-core-test", version: "0.2.0" },
    accessHint: "restricted",
    limitations: ["Local verification is not production proof"],
  };
}

export function validDossierV02(): TaskDossierV02 {
  return {
    schemaVersion: "atlasrepo.core/task-dossier/v0.2",
    id: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:10:00.000Z",
    title: "Evaluate Dify for a bounded pilot",
    context: {
      description: "Evaluate a pinned Dify revision against a required local verification constraint.",
      constraints: [
        {
          id: "local-verification",
          description: "The candidate must pass the documented local check.",
          required: true,
        },
      ],
    },
    evidence: [dossierEvidence()],
    claims: [
      {
        id: "source-is-pinned",
        statement: "The evaluated source revision is immutable.",
        classification: "confirmed",
        evidenceIds: ["dossier-evidence"],
        limitations: [],
      },
    ],
    hypotheses: [
      {
        id: "candidate-is-verifiable",
        statement: "Dify can be evaluated with a deterministic local workflow.",
        status: "supported",
        evidenceIds: ["dossier-evidence"],
      },
    ],
    checks: [
      {
        id: "source-pin-check",
        hypothesisId: "candidate-is-verifiable",
        description: "Confirm the source URL contains the pinned revision.",
        status: "passed",
        required: true,
        evidenceIds: ["dossier-evidence"],
      },
    ],
    decision: {
      summary: "Proceed with a bounded local pilot.",
      rationale: "The source and evaluation input are pinned.",
      hypothesisIds: ["candidate-is-verifiable"],
      evidenceIds: ["dossier-evidence"],
      decidedAt: "2026-09-05T00:10:00.000Z",
      status: "recommended",
      claimIds: ["source-is-pinned"],
      unresolvedGates: [],
      limitations: ["This decision does not authorize production activation"],
    },
    actions: [
      {
        id: "run-local-pilot",
        description: "Run the workflow locally against the pinned revision.",
        status: "pending",
        resultEvidenceIds: [],
      },
    ],
  };
}

export function validWorkflowV02(): WorkflowModuleReleaseV02 {
  return {
    schemaVersion: "atlasrepo.core/workflow-module-release/v0.2",
    moduleId: "evaluate-dify",
    version: "0.2.0",
    releasedAt: "2026-09-05T00:15:00.000Z",
    title: "Evaluate a pinned Dify revision",
    summary: "Run a bounded, evidence-backed local evaluation.",
    locale: "en",
    audiences: ["software-engineers"],
    applicability: ["A public immutable source revision is available"],
    problem: "A product decision needs reproducible evidence before adoption.",
    intendedOutcomes: ["A bounded pilot decision with explicit limitations"],
    exclusions: ["Production deployment", "License approval"],
    evidence: [moduleEvidence()],
    claims: [
      {
        id: "local-check-passed",
        statement: "The pinned input passed the local check.",
        classification: "confirmed",
        evidenceIds: ["module-evidence"],
        limitations: ["The result applies only to the pinned revision"],
      },
    ],
    prerequisites: [],
    relatedModules: [],
    inputs: [
      {
        name: "repositoryUrl",
        description: "HTTPS URL containing the immutable source revision.",
        required: true,
        valueSchema: { type: "string", format: "uri" },
      },
    ],
    outputs: [
      {
        name: "verificationReceipt",
        description: "Digest-addressed receipt for the local check.",
        required: true,
        valueSchema: { type: "object" },
      },
    ],
    steps: [
      {
        id: "verify-source",
        title: "Verify the pinned source",
        instruction: "Run the documented read-only source verification.",
        dependsOn: [],
        checkIds: ["source-check"],
        executionPolicy: {
          effect: "read-only",
          approval: "not-required",
          networkDomains: ["github.com"],
          secretNames: [],
          timeoutSeconds: 300,
          idempotency: "idempotent",
          maxAttempts: 1,
          recovery: "Discard the local receipt and leave the source unchanged.",
        },
      },
    ],
    checks: [
      {
        id: "source-check",
        description: "The exact source revision is recorded and verified.",
        evidenceRequirements: ["Pinned source digest", "Command exit status"],
      },
    ],
    readinessCriteria: [
      {
        id: "source-ready",
        description: "The pinned source check is fulfilled.",
        required: true,
        checkIds: ["source-check"],
      },
    ],
    materials: [
      {
        id: "dify-guide",
        kind: "article",
        title: "Dify local evaluation guide",
        resourceRef: "atlasrepo://material/dify-guide",
        bundlePath: "materials/dify-guide.md",
        digest: materialDigest,
        mediaType: "text/markdown",
        locale: "en",
        accessHint: "public",
        license: "Apache-2.0",
        attribution: "AtlasRepo contributors",
        evidenceIds: ["module-evidence"],
        limitations: ["Guide commands must be rechecked for future Dify revisions"],
      },
    ],
  };
}

export function validRouteV02(
  dossier = validDossierV02(),
  workflow = validWorkflowV02(),
): PinnedRouteV02 {
  return {
    schemaVersion: "atlasrepo.core/route/v0.2",
    id: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-09-05T00:20:00.000Z",
    title: "Bounded Dify evaluation route",
    goal: "Produce a decision backed by pinned local verification.",
    dossier: {
      id: dossier.id,
      revision: dossier.revision,
      digest: sha256Digest(dossier),
    },
    status: "recommended",
    unresolvedGates: [],
    constraintCoverage: [
      {
        constraintId: "local-verification",
        status: "covered",
        moduleIds: [workflow.moduleId],
      },
    ],
    modules: [
      {
        moduleId: workflow.moduleId,
        version: workflow.version,
        digest: sha256Digest(workflow),
        rationale: "This module produces the required local verification receipt.",
        dependsOn: [],
        criterionResults: [
          {
            criterionId: "source-ready",
            status: "fulfilled",
            evidenceIds: ["module-evidence"],
          },
        ],
      },
    ],
  };
}

export function validComposition(): ComposeDecisionPackInput {
  const dossier = validDossierV02();
  const workflow = validWorkflowV02();
  return {
    dossier,
    route: validRouteV02(dossier, workflow),
    modules: [workflow],
    packId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-09-05T00:25:00.000Z",
    answer: "Run the pinned workflow as a bounded local pilot.",
    limitations: ["No production deployment is authorized"],
  };
}
