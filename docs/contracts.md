# Contracts

## Versioning

Every portable document has a `schemaVersion` in the form
`atlasrepo.core/<kind>/vMAJOR.MINOR`. A consumer must reject unknown versions
rather than guess their meaning.

The source JSON schemas under `schemas/` are the wire contract. TypeScript
interfaces mirror them for SDK users. Schema validation is followed by domain
validation for identifier uniqueness, reference integrity, and timestamp rules.

Before 1.0, incompatible changes may be introduced only with a new
`schemaVersion` and migration notes. Published schema files are not silently
rewritten. The v0.1 dossier, workflow-release, route, execution-pack, and
result-pack contracts remain valid and loadable; v0.2 does not reinterpret
their fields. Core v0.2 fixes locale-dependent key ordering in the default
canonical digest function. Consumers comparing a previously recorded v0.1
digest can use `sha256DigestV01()` under the producer's original locale. See
[MIGRATING.md](../MIGRATING.md).

`getSchema(kind)` preserves the v0.1 SDK default for existing document kinds.
Use an exact version argument or `getLatestSchema(kind)` to request v0.2.

## Task dossier v0.2

A v0.2 dossier records:

1. context and constraints;
2. content-addressed evidence, stable resource references, access hints,
   producers, and known limitations;
3. classified claims and hypotheses that cite known evidence;
4. required or optional checks with explicit status;
5. an optional evidence-backed decision with `recommended`, `conditional`, or
   `abstained` status and unresolved gates;
6. planned or completed actions;
7. an optional evidence-backed outcome.

Confirmed claims, supported or rejected hypotheses, conclusive checks,
completed actions, and known outcomes require evidence references. Domain
validation checks that those references resolve inside the dossier. Schema-valid
data is still not necessarily true. A digest proves content identity, not the
truth, safety, freshness, license, or completeness of the content.

Evidence may expose a `publicUri` only when its `accessHint` is `public`.
`resourceRef` is an identifier, not an instruction to fetch. Core does not
resolve either field and rejects recognized credential schemes, whitespace-bearing
references, embedded URL credentials, and known signed-URL parameters. Hosts
remain responsible for general secret detection and redaction.

## Portable workflow module release v0.2

A workflow release is the open, immutable transport unit for a reusable
workflow. It is identified by `moduleId@version` and records locale, audience,
applicability, intended outcomes, exclusions, evidence-backed claims, exact
prerequisites, typed inputs and outputs, steps, checks, readiness criteria, and
content-addressed materials. A correction requires a new semantic version.
Routes pin both the exact version and document digest, so a later release cannot
change an earlier decision.

Materials use stable `resourceRef` identifiers and may include a relative
`bundlePath` for locally available bytes. License, attribution, provenance,
access hints, and limitations travel with each material. Restricted material
must not expose a public URI. Core validates references, step dependencies,
readiness links, approval declarations, and portable path safety. It does not
download or execute the material.

`verifyWorkflowMaterials()` may be called explicitly by a local host to hash
bundled material bytes and compare them with declared digests. It resolves real
paths and rejects files outside the supplied bundle root. External resources
remain unverified until a host retrieves them under its own network and access
policy.

Step `executionPolicy` is descriptive data. External-write and destructive
effects require an explicit approval declaration, but that declaration does not
grant approval. It also records network domains, secret names without values,
time and cost bounds, idempotency, attempt limits, and a recovery instruction.
Non-idempotent and destructive steps are limited to one declared attempt. An
executor must perform its own authorization and policy checks.

## Pinned route v0.2

A route binds one exact dossier revision and digest to an ordered set of exact
workflow releases. It records rationale, dependency pins, constraint coverage,
criterion results, evidence references, unresolved gates, and one of three
statuses:

- `recommended`: every required constraint and readiness criterion is
  fulfilled;
- `conditional`: required evidence or a required decision gate is unresolved;
- `abstained`: a required constraint or readiness criterion failed, or the
  dossier does not support a decision.

The composer rejects missing or extra releases, digest mismatches, dependency
cycles or incorrect order, unknown criteria, and incomplete required constraint
coverage.

## Decision pack v0.1

`composeDecisionPack()` is a pure composition boundary for plugin, MCP, CLI, or
other hosts. The caller supplies the v0.2 dossier, v0.2 route, exact v0.2 module
releases, pack identity, timestamp, answer, and limitations. Composition makes
no LLM call, network request, filesystem read, clock read, or generated-ID call.
The same explicit inputs produce the same canonical content.

The output contains exact dossier, route, and module digests; status; answer;
deduplicated citations; unresolved gates; and limitations. A citation includes
a `publicUri` only for public evidence. The pack is a reviewable decision
artifact, not permission to execute the route.

## Ownership boundaries

- Scout discovers candidates, collects evidence, and supplies provenance.
- Core validates portable documents and deterministically composes decision
  packs.
- Platform owns mutable drafts, publication moderation, authentication, ACLs,
  entitlements, UTM tracking, private material delivery, hosted workspaces,
  billing, course progress, and Course Bot.
- An external executor owns action authorization, sandboxing, side effects,
  rollback, and runtime evidence.

Core never autonomously calls an LLM, fetches evidence, selects a model, or
executes a workflow step.

## Execution and result packs

An execution pack describes scope, constraints, steps, and expected artifacts.
It is data, not authorization. An executor must apply its own policy and request
confirmation where required.

A result pack reports status and content-addressed evidence. A successful status
does not make the result trusted until the relevant checks accept that evidence.

Workflow releases, pinned routes, execution packs, and result packs are
immutable after storage. Rewriting identical content is idempotent; a changed
document requires a new identity.

## Extensions

Task dossiers and workflow releases allow an `extensions` object for
namespaced experimental metadata. Extensions must not override required fields
or weaken authorization, provenance, validation, or immutability rules.
