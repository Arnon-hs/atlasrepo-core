# Filesystem store

`FileSystemStore` is the durable local adapter for v0.1.

## Guarantees

- Store and lock directories are created with owner-only permissions.
- Documents are written to a temporary file in the destination directory and
  replaced with an atomic rename.
- Each entity has an exclusive lock file during a write.
- Dossier updates require the next integer revision and can require an expected
  current revision.
- Every accepted dossier revision is retained under `.history/`.
- Every non-dossier document is immutable. Rewriting identical content is
  idempotent; changed content requires a new identity.

## Limits

- The store is for processes sharing one local filesystem and trust boundary.
- It has no user accounts, ACLs, encryption, remote locking, or replication.
- Atomic rename prevents partial documents but does not promise survival of a
  hardware failure without filesystem and backup guarantees.
- A process terminated while holding a lock can leave a stale lock. Confirm no
  writer is active before removing it manually.
- URLs and file references are recorded but never fetched by Core.

For hosted or multi-user deployments, implement an `ArtifactStore` adapter
with transactional writes and resource-level authorization.
