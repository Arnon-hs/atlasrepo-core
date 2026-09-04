# Contracts

## Versioning

Every portable document has a `schemaVersion` in the form
`atlasrepo.core/<kind>/v0.1`. A consumer must reject unknown versions rather
than guess their meaning.

The source JSON schemas under `schemas/` are the wire contract. TypeScript
interfaces mirror them for SDK users. Schema validation is followed by domain
validation for identifier uniqueness, reference integrity, and timestamp rules.

Before 1.0, incompatible changes may be introduced only with a new
`schemaVersion` and migration notes. Published schema files are not silently
rewritten.

## Task dossier

A dossier records:

1. context and constraints;
2. content-addressed evidence and its producer;
3. hypotheses that cite known evidence;
4. checks with explicit status;
5. an optional evidence-backed decision;
6. planned or completed actions;
7. an optional evidence-backed outcome.

Schema-valid data is not necessarily true. The digest proves content identity,
not the truth, safety, freshness, license, or completeness of the content.

## Workflow module release

A workflow release is identified by `moduleId@version`. Once stored, the
document is immutable. A correction requires a new semantic version. Routes pin
exact versions so a later release cannot change an earlier decision.

Validation checks step and check references. Resolving whether the referenced
module releases exist is the responsibility of the route builder or host.

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
