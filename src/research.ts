import { canonicalJson, sha256Digest } from "./canonical.js";
import type { Evidence, EvidenceV02 } from "./types.js";

const adapterIdentity = {
  name: "@atlasrepo/core/research-evidence-adapter",
  version: "0.1.0",
  canonicalization: "atlasrepo.core/canonical-json/v0.2",
} as const;

const digestPattern = /^(?:sha256:)?[a-f0-9]{64}$/;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const evidenceKinds = new Set<Evidence["kind"]>([
  "document",
  "repository-analysis",
  "user-input",
  "execution-result",
  "dataset",
  "other",
]);
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

export interface CanonicalResearchValue {
  digest: string;
  content: Record<string, unknown>;
}

export interface ResearchEvaluatorValue extends CanonicalResearchValue {
  name: string;
  version: string;
}

export interface ResearchEvaluationAdapterRequest {
  evaluationId: string;
  title: string;
  observedAt: string;
  evidenceKind: Evidence["kind"];
  sourceSchema: { id: string; version: string };
  access: {
    resourceRef: string;
    accessHint: "public" | "restricted";
    publicUri?: string;
  };
  evaluator: ResearchEvaluatorValue;
  input: CanonicalResearchValue;
  output: CanonicalResearchValue;
  license?: string;
  limitations: string[];
}

export interface ResearchEvidenceReceiptV01 {
  schemaVersion: "atlasrepo.core/research-evidence-receipt/v0.1";
  evaluationId: string;
  adapter: typeof adapterIdentity;
  sourceSchema: { id: string; version: string };
  evaluator: { name: string; version: string; digest: string };
  inputDigest: string;
  outputDigest: string;
  adapterInputDigest: string;
  evidenceDigest: string;
  accessHint: "public" | "restricted";
}

export interface ResearchEvidenceAdapterResult {
  evidence: EvidenceV02;
  receipt: ResearchEvidenceReceiptV01;
  receiptDigest: string;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be a JSON object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${field} must be a plain JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  field: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${field} has unknown property: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${field}.${key} is required`);
  }
}

function nonEmptyString(value: unknown, field: string, maximum = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${field} must be a non-empty string of at most ${maximum} characters`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${field} must not contain control characters`);
  }
  return value;
}

function normalizedDigest(value: unknown, field: string): string {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest`);
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function canonicalValue(value: unknown, field: string): CanonicalResearchValue {
  const item = record(value, field);
  exactKeys(item, field, ["digest", "content"]);
  const content = record(item.content, `${field}.content`);
  const digest = normalizedDigest(item.digest, `${field}.digest`);
  let actual: string;
  try {
    actual = sha256Digest(content);
  } catch (error) {
    throw new TypeError(`${field}.content is not canonical JSON`, { cause: error });
  }
  if (digest !== actual) throw new TypeError(`${field}.digest does not match canonical content`);
  return { digest, content };
}

function evaluatorValue(value: unknown): ResearchEvaluatorValue {
  const item = record(value, "request.evaluator");
  exactKeys(item, "request.evaluator", ["name", "version", "digest", "content"]);
  const canonical = canonicalValue(
    { digest: item.digest, content: item.content },
    "request.evaluator",
  );
  return {
    name: nonEmptyString(item.name, "request.evaluator.name", 128),
    version: nonEmptyString(item.version, "request.evaluator.version", 128),
    ...canonical,
  };
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const items = value.map((item, index) => nonEmptyString(item, `${field}[${index}]`, 2_000));
  if (new Set(items).size !== items.length) throw new TypeError(`${field} must be unique`);
  return items;
}

function sensitiveParameter(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    sensitiveParameterNames.has(normalized) ||
    normalized.startsWith("x-amz-") ||
    normalized.startsWith("x-goog-") ||
    normalized.startsWith("x-ms-")
  );
}

function safeReference(value: unknown, field: string, publicOnly = false): string {
  const reference = nonEmptyString(value, field, 2_048);
  if (/\s/u.test(reference)) throw new TypeError(`${field} must not contain whitespace`);
  let parsed: URL;
  try {
    parsed = new URL(reference);
  } catch {
    if (publicOnly || /^https?:/iu.test(reference)) {
      throw new TypeError(`${field} must be a valid URL`);
    }
    return reference;
  }
  if (publicOnly && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError(`${field} must use the http or https scheme`);
  }
  if (
    [
      "apikey:",
      "api-key:",
      "authorization:",
      "basic:",
      "bearer:",
      "blob:",
      "data:",
      "file:",
      "javascript:",
      "token:",
    ].includes(parsed.protocol)
  ) {
    throw new TypeError(`${field} must not use the ${parsed.protocol} scheme`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError(`${field} must not contain embedded credentials`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (sensitiveParameter(key)) {
      throw new TypeError(`${field} must not contain secret query parameter: ${key}`);
    }
  }
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  for (const key of fragment.keys()) {
    if (sensitiveParameter(key)) {
      throw new TypeError(`${field} must not contain secret fragment parameter: ${key}`);
    }
  }
  return reference;
}

function timestamp(value: unknown): string {
  const observedAt = nonEmptyString(value, "request.observedAt", 64);
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(observedAt)) {
    throw new TypeError("request.observedAt must be an RFC 3339 date-time");
  }
  if (Number.isNaN(Date.parse(observedAt))) {
    throw new TypeError("request.observedAt must be a valid date-time");
  }
  return observedAt;
}

export function adaptResearchEvaluation(value: unknown): ResearchEvidenceAdapterResult {
  const request = record(value, "request");
  exactKeys(
    request,
    "request",
    [
      "evaluationId",
      "title",
      "observedAt",
      "evidenceKind",
      "sourceSchema",
      "access",
      "evaluator",
      "input",
      "output",
      "limitations",
    ],
    ["license"],
  );

  const evaluationId = nonEmptyString(request.evaluationId, "request.evaluationId", 128);
  if (!idPattern.test(evaluationId)) throw new TypeError("request.evaluationId is not a Core id");
  const title = nonEmptyString(request.title, "request.title", 512);
  const observedAt = timestamp(request.observedAt);
  if (
    typeof request.evidenceKind !== "string" ||
    !evidenceKinds.has(request.evidenceKind as Evidence["kind"])
  ) {
    throw new TypeError("request.evidenceKind is not a supported Core evidence kind");
  }
  const evidenceKind = request.evidenceKind as Evidence["kind"];

  const sourceSchemaValue = record(request.sourceSchema, "request.sourceSchema");
  exactKeys(sourceSchemaValue, "request.sourceSchema", ["id", "version"]);
  const sourceSchema = {
    id: nonEmptyString(sourceSchemaValue.id, "request.sourceSchema.id", 256),
    version: nonEmptyString(sourceSchemaValue.version, "request.sourceSchema.version", 64),
  };
  if (
    !sourceSchema.id.startsWith("atlasrepo.research/") &&
    !sourceSchema.id.startsWith("urn:atlasrepo:atlas-research:")
  ) {
    throw new TypeError("request.sourceSchema.id is not an Atlas Research schema");
  }

  const accessValue = record(request.access, "request.access");
  exactKeys(accessValue, "request.access", ["resourceRef", "accessHint"], ["publicUri"]);
  if (accessValue.accessHint !== "public" && accessValue.accessHint !== "restricted") {
    throw new TypeError("request.access.accessHint must be public or restricted");
  }
  const accessHint = accessValue.accessHint;
  const resourceRef = safeReference(accessValue.resourceRef, "request.access.resourceRef");
  let publicUri: string | undefined;
  if (accessHint === "public") {
    publicUri = safeReference(accessValue.publicUri, "request.access.publicUri", true);
  } else if (Object.hasOwn(accessValue, "publicUri")) {
    throw new TypeError("restricted research evidence must not expose a public URI");
  }

  const evaluator = evaluatorValue(request.evaluator);
  const input = canonicalValue(request.input, "request.input");
  const output = canonicalValue(request.output, "request.output");
  const declaredOutputSchema = output.content.schema_version;
  if (declaredOutputSchema !== sourceSchema.id && declaredOutputSchema !== sourceSchema.version) {
    throw new TypeError("request.output.content.schema_version does not match sourceSchema");
  }
  const limitations = stringList(request.limitations, "request.limitations");
  const license = request.license === undefined
    ? undefined
    : nonEmptyString(request.license, "request.license", 256);

  const normalizedRequest = {
    evaluationId,
    title,
    observedAt,
    evidenceKind,
    sourceSchema,
    access: {
      resourceRef,
      accessHint,
      ...(publicUri === undefined ? {} : { publicUri }),
    },
    evaluator,
    input,
    output,
    ...(license === undefined ? {} : { license }),
    limitations,
  };

  const evidence: EvidenceV02 = {
    id: evaluationId,
    kind: evidenceKind,
    title,
    resourceRef,
    ...(publicUri === undefined ? {} : { publicUri }),
    digest: output.digest,
    observedAt,
    producer: { name: evaluator.name, version: evaluator.version },
    accessHint,
    ...(license === undefined ? {} : { license }),
    limitations,
  };
  const receipt: ResearchEvidenceReceiptV01 = {
    schemaVersion: "atlasrepo.core/research-evidence-receipt/v0.1",
    evaluationId,
    adapter: adapterIdentity,
    sourceSchema,
    evaluator: {
      name: evaluator.name,
      version: evaluator.version,
      digest: evaluator.digest,
    },
    inputDigest: input.digest,
    outputDigest: output.digest,
    adapterInputDigest: sha256Digest(normalizedRequest),
    evidenceDigest: sha256Digest(evidence),
    accessHint,
  };
  return { evidence, receipt, receiptDigest: sha256Digest(receipt) };
}

export function canonicalResearchEvidenceReceipt(receipt: ResearchEvidenceReceiptV01): string {
  return canonicalJson(receipt);
}
