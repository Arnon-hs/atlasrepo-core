# Migrating to Core v0.2

## Canonical digest correction

Core v0.1 sorted object keys with `localeCompare()`. That made a digest depend
on the process locale for some Unicode keys. Core v0.2 changes
`canonicalJson()` and `sha256Digest()` to locale-independent UTF-16 code-unit
ordering.

Existing v0.1 documents remain schema-valid and loadable. If a consumer must
compare a stored v0.1 digest, `canonicalJsonV01()` and `sha256DigestV01()`
reproduce the old host-locale behavior. Run that comparison under the same
locale as the original producer. There is no single portable v0.1 digest for
affected Unicode-key documents.

New documents, v0.2 route pins, and decision packs must use the corrected
default digest. Do not rewrite an immutable v0.1 release in place. Publish a
new release or dossier revision with the corrected digest and retain the old
artifact as migration evidence.

## Schema and TypeScript APIs

`getSchema(kind)` keeps the v0.1 default for document kinds that existed in
Core v0.1. Pass an exact schema version to select v0.2, or call
`getLatestSchema(kind)` when following the newest supported contract.

The original `TaskDossier`, `WorkflowModuleRelease`, and `PinnedRoute` type
names continue to describe v0.1. New code can use the explicit `V02` names.
`AnyTaskDossier`, `AnyWorkflowModuleRelease`, and `AnyPinnedRoute` are
unions for version-aware stores and consumers.
