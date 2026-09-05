# Dify evidence-first decision example

This fixture demonstrates how AtlasRepo Core can assess a public repository
without cloning or executing its code. It is deliberately a conditional
decision, not a recommendation to deploy Dify.

## Question

Should a small engineering team run a bounded local pilot of Dify as a
self-hosted platform for LLM workflows and retrieval applications?

The example distinguishes source claims from runtime proof. The inspected Dify
revision documents workflows, RAG, model integrations, APIs, and a Docker
Compose installation path. Those statements establish candidate relevance,
but they do not establish security, production suitability, performance, or
license compatibility for a particular business.

## Reproduce the source inspection

The source revision is fixed to:

```text
langgenius/dify@ad90cb911138f6b27af996c87afe34fbb5a4ed16
```

Inspect the revision and metadata without running repository code:

```bash
git ls-remote https://github.com/langgenius/dify.git refs/heads/main
gh repo view langgenius/dify \
  --json nameWithOwner,url,visibility,isArchived,defaultBranchRef,licenseInfo,description
gh api repos/langgenius/dify/commits/ad90cb911138f6b27af996c87afe34fbb5a4ed16
```

Recompute a pinned file digest without saving or executing the file:

```bash
gh api \
  'repos/langgenius/dify/contents/LICENSE?ref=ad90cb911138f6b27af996c87afe34fbb5a4ed16' \
  --jq .content | base64 --decode | shasum -a 256
```

The expected sources and digests are in `evidence-manifest.json`. A changed
digest means the downloaded bytes do not match this fixture, even if the path
or branch name still looks correct.

## Expected outcome

The dossier should produce `conditional-pilot`, with these unresolved gates:

1. A human review must determine whether the modified license fits the intended
   tenancy, branding, and distribution model.
2. A sandboxed local pilot must validate startup, resource use, required
   integrations, backup and restore, and teardown on the target environment.
3. Security and operations must be assessed independently. A security policy
   and an HTTP health response are not proof of security or production fitness.

No Dify application code, container, migration, plugin, or network-facing
service is run by this example.

## v0.2 end-to-end decision pack

The v0.2 example connects four immutable Core documents:

- `task-dossier.v0.2.json` records constraints, evidence-backed claims, checks,
  and the conditional decision;
- `workflow-module-release.v0.2.json` defines the reusable assessment workflow,
  step effects, approval boundaries, readiness criteria, and materials;
- `route.v0.2.json` pins the exact dossier and module digests and leaves license,
  runtime, operations, and security criteria unresolved;
- `decision-pack.v0.1.json` is the deterministic, user-facing composition result.

Build Core, validate every document, and reproduce the checked-in decision pack:

```bash
npm run build --silent
node dist/cli.js validate task-dossier examples/dify/task-dossier.v0.2.json
node dist/cli.js validate workflow-module-release examples/dify/workflow-module-release.v0.2.json
node dist/cli.js validate route examples/dify/route.v0.2.json
node dist/cli.js validate decision-pack examples/dify/decision-pack.v0.1.json
node examples/dify/compose-decision-pack.mjs
node --test tests/benchmark-dify-v02.test.mjs
```

The generator uses fixed identifiers, timestamps, source revisions, and content
digests. Repeated runs therefore produce the same canonical digest. Bundled
material digests cover raw file bytes; dossier, module, and route pins use
Core's canonical JSON SHA-256 function.
