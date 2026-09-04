# AtlasRepo Core

[![CI](https://github.com/Arnon-hs/atlasrepo-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Arnon-hs/atlasrepo-core/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](package.json)

AtlasRepo Core is an open, local-first TypeScript SDK and CLI for evidence-backed
technical decisions.

> **Status:** alpha. The v0.1 contracts are usable for local experiments, but may
> change before 1.0.

Core records the path from a task to a reviewable outcome:

```text
context -> evidence -> hypotheses -> checks -> decision -> actions -> outcome
```

It keeps model claims separate from evidence, pins reusable workflow releases,
and produces execution and result packs that another tool or human can act on.
Core does not execute repository code, call an LLM, fetch URLs, deploy services,
or grant an agent permissions.

## Why Core

LLM output alone is difficult to audit and reproduce. Core supplies:

- strict, portable JSON Schema contracts;
- domain validation for references that JSON Schema cannot prove;
- a durable local filesystem store with atomic replacement and dossier history;
- optimistic dossier revisions and immutable workflow releases;
- deterministic JSON canonicalization, digests, and event replay;
- provider-neutral interfaces without a runtime model dependency.

Hosted collaboration, billing, access control, and private content belong to the
AtlasRepo Platform. Core stays useful without an AtlasRepo account.

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

See [the example](examples/dify/README.md) for its evidence boundary and
unresolved gates.

## SDK

```ts
import {
  FileSystemStore,
  assertValidDocument,
  sha256Digest,
  type TaskDossier,
} from "@atlasrepo/core";

const candidate: unknown = JSON.parse(input);
assertValidDocument("task-dossier", candidate);

const dossier: TaskDossier = candidate;
const store = new FileSystemStore(".atlasrepo");
await store.put("task-dossier", dossier, 0);

console.log(sha256Digest(dossier));
```

Main exports:

- `validateDocument`, `assertValidDocument`, and `inferDocumentKind`
- `canonicalJson` and `sha256Digest`
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
```

Supported document kinds:

- `task-dossier`
- `workflow-module-release`
- `route`
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
```

CI runs type checking, tests, build, package inspection, and a production
dependency audit on Node.js 22.

## Project scope

Core owns the open decision lifecycle and portable contracts. It does not own:

- hosted tenancy, authentication, billing, or entitlement checks;
- web crawling, source acquisition, or search indexing;
- deterministic repository analysis;
- model hosting or model selection policy;
- arbitrary code execution, CI runners, deployment, or rollback.

Those capabilities integrate through explicit evidence, provider, execution,
and result contracts.

## Community

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Governance](GOVERNANCE.md)
- [Maintainers](MAINTAINERS.md)
- [Roadmap](ROADMAP.md)

Use [GitHub Issues](https://github.com/Arnon-hs/atlasrepo-core/issues) for bugs
and focused proposals. Please do not use public issues for vulnerabilities.

## License

Licensed under the [Apache License 2.0](LICENSE). This is technical tooling, not
legal, security, or procurement advice. Evidence recorded by Core still needs
human review appropriate to the decision.

