# Atlas Research evidence adapter

`adaptResearchEvaluation` converts one already-produced Atlas Research JSON
evaluation into a Core `EvidenceV02` entry and a deterministic provenance
receipt. It is a pure local transform. It does not fetch an artifact, call a
model, execute evaluator code, authorize access, or promote a research result.

The request pins three canonical JSON objects independently:

- `evaluator.content` describes the exact evaluator identity and is bound to
  its name, version, and canonical SHA-256 digest; the Dify fixture also pins
  the evaluator source file's raw-byte SHA-256 inside that descriptor;
- `input.content` is the exact evaluation input;
- `output.content` is the exact evaluation result and becomes the digest of the
  Core evidence entry.

Every declared digest is recomputed before any evidence is returned. Unknown
adapter properties, a missing access classification, digest mismatch, unsafe
reference, a public item without a public HTTP(S) URL, or a restricted item
with a public URL fails closed. The output's `schema_version` must also match
the declared Atlas Research schema ID or version.

The receipt records the source schema, evaluator identity, all three digests,
the normalized adapter-input digest, the generated evidence digest, and the
adapter version. Callers can retain it in the existing dossier `extensions`
object, so this integration does not add or change a Core JSON Schema.

```ts
import { adaptResearchEvaluation } from "@atlasrepo/core";

const { evidence, receipt, receiptDigest } = adaptResearchEvaluation(request);

dossier.evidence.push(evidence);
dossier.extensions = {
  ...dossier.extensions,
  researchEvaluationReceipts: [receipt],
};
```

`accessHint` is an explicit caller classification. The adapter enforces safe
representation of that classification but does not inspect the content for
confidential data or grant permission to disclose it. Keep uncertain material
`restricted` and let the owning platform apply identity and ACL policy before
delivery.

## Dify conformance fixture

The Dify fixture wraps the pinned public Atlas Research Core golden evaluation
for `atlasrepo-core` v0.2.1. It preserves the evaluator version, exact evaluator
descriptor digest, exact case digest, exact result digest, the conditional
decision, and all unresolved gates.

```bash
npm run build --silent
node examples/dify/adapt-research-evaluation.mjs
node --test tests/benchmark-dify-research-adapter.test.mjs
```

This fixture is one conformance case, not a statistical benchmark or evidence
that Dify is secure, license-compatible, operationally ready, or suitable for
production.
