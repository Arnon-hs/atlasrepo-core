# Dify benchmark

This benchmark checks whether AtlasRepo Core preserves an evidence-first,
appropriately uncertain decision about a real public repository.

The expected decision is a bounded local pilot, not adoption. The benchmark is
successful only when:

- every material claim cites evidence from the pinned bundle;
- file evidence has a SHA-256 digest and a revision-pinned source URL;
- upstream documentation is not presented as runtime proof;
- modified-license conditions cause a manual review gate;
- a security policy is not treated as proof that the software is secure;
- no result says that a local pilot ran;
- the final state stays conditional while mandatory gates are unresolved.

The local benchmark also stores and reads the complete dossier through the
public CLI, proving that the evidence and decision survive a local round trip.

The case intentionally supports abstention. A system that confidently approves
or rejects Dify from this source-only bundle should fail the benchmark.

To re-fetch the pinned public sources and recompute their digests without
cloning or executing Dify, run:

```bash
node benchmarks/dify/verify-sources.mjs
```

The verifier reports when `main` or mutable repository metadata has moved, but
validates file bytes only through immutable revision-pinned URLs.
