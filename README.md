# AtlasRepo Core

[![CI](https://github.com/Arnon-hs/atlasrepo-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Arnon-hs/atlasrepo-core/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](package.json)

AtlasRepo Core is an open, local-first TypeScript SDK and CLI for evidence-backed
technical decisions.

> **Status:** alpha. Core supports the published v0.1 contracts and introduces
> additive v0.2 dossier, workflow-release, and route contracts. Contracts may
> evolve through new schema versions before 1.0; published schema files are not
> silently changed.

When upgrading from v0.1, read [MIGRATING.md](MIGRATING.md) for the canonical
digest correction.

Core records the path from a task to a reviewable outcome:

```text
context -> evidence -> hypotheses -> checks -> decision -> actions -> outcome
```

It keeps claims separate from evidence, pins reusable workflow releases, and
composes a compact decision pack that another tool or human can review. Core
does not execute repository code, call an LLM, access the network, deploy a
service, or grant an agent permissions.

## Why Core

LLM output alone is difficult to audit and reproduce. Core supplies:

- strict, portable JSON Schema contracts;
- domain validation for references that JSON Schema cannot prove;
- a durable local filesystem store with atomic replacement and dossier history;
- optimistic dossier revisions and immutable workflow releases;
- deterministic JSON canonicalization, digests, and event replay;
- pure decision-pack composition from an exact dossier, route, and module set;
- provider-neutral interfaces without a runtime model dependency.

AtlasRepo Platform owns mutable drafts, hosted workspaces, authentication, ACLs,
entitlements, UTM tracking, private material delivery, billing, and Course Bot.
AtlasRepo Scout selects candidates and collects evidence. Core only validates
portable artifacts and derives a decision pack from explicit inputs, so it stays
useful without an AtlasRepo account.

## Quickstart

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer

```bash
git clone https://github.com/Arnon-hs/atlasrepo-core.git
cd atlasrepo-core
npm install
npm run build
node dist/cli.js validate task-dossier fixtures/task-dossier.valid.json
```

Create and inspect a local dossier:

```bash
node dist/cli.js store init --dir .atlasrepo
node dist/cli.js dossier create \
  --title "Choose a self-hosted platform" \
  --description "Compare candidates against explicit constraints" \
  --store .atlasrepo
```

The create command prints the new dossier, including its UUID. Use that UUID
with `dossier get` or `dossier history`.

## Dify proof case

The repository includes a source-pinned, non-runtime evaluation of
[Dify](https://github.com/langgenius/dify). It proves validation and citation
integrity without executing Dify or claiming production readiness:

```bash
npm run benchmark:dify
```

Its result is `conditional-pilot`, not a production recommendation. A human
must review Dify's modified license against the intended use, tenancy,
distribution, and branding model. See [the example](examples/dify/README.md)
for the evidence boundary and unresolved runtime, security, operations, and
license gates.

## SDK

```ts
import {
  FileSystemStore,
  assertValidDocument,
  sha256Digest,
  type AnyTaskDossier,
} from "@atlasrepo/core";

const candidate: unknown = JSON.parse(input);
assertValidDocument("task-dossier", candidate);

const dossier: AnyTaskDossier = candidate;
const store = new FileSystemStore(".atlasrepo");
await store.put("task-dossier", dossier, 0);

console.log(sha256Digest(dossier));
```

Main exports:

- `validateDocument`, `assertValidDocument`, `inferDocumentKind`,
  `getSchema`, and `getLatestSchema`
- `canonicalJson` and `sha256Digest`
- `composeDecisionPack`
- `verifyWorkflowMaterials` for local raw-byte digest verification
- `FileSystemStore`, `replay`, and `readReplayFile`
- portable document and provider interface types

## CLI

```text
atlasrepo-core validate <kind> <file>
atlasrepo-core store init --dir <path>
atlasrepo-core dossier create --title <title> [--description <text>] --store <path>
atlasrepo-core dossier put <file> --store <path> [--expected-revision <number>]
atlasrepo-core dossier get <id> --store <path>
atlasrepo-core dossier history <id> --store <path>
atlasrepo-core import <kind> <file> --store <path>
atlasrepo-core export <kind> <id> --store <path> --out <file>
atlasrepo-core replay <events.jsonl> --store <path>
atlasrepo-core compose decision-pack <input.json> --out <file>
```

Supported document kinds:

- `task-dossier`
- `workflow-module-release`
- `route`
- `decision-pack`
- `execution-pack`
- `result-pack`

The canonical schemas live in [schemas](schemas/). Details and compatibility
rules are in [docs/contracts.md](docs/contracts.md).

## Local storage and security

The default store writes owner-only files and uses lock files plus atomic rename.
It is intended for one local trust boundary. It does not provide encryption,
multi-user authorization, remote coordination, or a sandbox.

Read [docs/storage.md](docs/storage.md) before putting sensitive material in a
store, and [docs/security-model.md](docs/security-model.md) before integrating an
executor or model provider.

## Development

```bash
npm install
npm run check
npm test
npm run build
npm pack --dry-run
npm run package:verify
```

CI runs type checking, tests, build, package inspection, and a production
dependency audit on Node.js 22. The package verifier proves that the exact
runtime dependency closure and its license texts are inside the tarball, then
installs from an empty npm cache in offline mode and exercises library, schema,
and CLI imports. It also requires direct packs and an installed-package repack
to be byte-identical.

## Project scope

Core owns the open decision lifecycle, portable contracts, validation, content
identity, and pure decision-pack composition. It does not own:

- drafts, hosted tenancy, authentication, ACLs, billing, or entitlements;
- UTM tracking, private delivery, course progress, or Course Bot;
- web crawling, source acquisition, candidate selection, or search indexing;
- deterministic repository analysis;
- model calls, model hosting, or model selection policy;
- network access or material retrieval;
- arbitrary code execution, CI runners, deployment, or rollback.

Scout and other producers pass content-addressed evidence into Core. Platform
applies identity, authorization, content, and commercial policy outside Core.
Executors remain separate and must treat every Core artifact as data, not
authority.

## Community

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Governance](GOVERNANCE.md)
- [Maintainers](MAINTAINERS.md)
- [Roadmap](ROADMAP.md)

Use [GitHub Issues](https://github.com/Arnon-hs/atlasrepo-core/issues) for bugs
and focused proposals. Please do not use public issues for vulnerabilities.

## License

Licensed under the [Apache License 2.0](LICENSE). Core's license metadata and
checks provide technical signals, not legal advice or a license-compatibility
determination. Evidence recorded by Core still needs human review appropriate
to the decision.
