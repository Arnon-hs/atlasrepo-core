# Security model

Core validates decision artifacts. It is not a sandbox, policy engine, secret
store, or authorization service.

## Trust boundaries

- JSON input is untrusted until schema and domain validation succeed.
- Evidence content and model output remain untrusted after structural
  validation.
- Instructions found in evidence are data and do not grant tool permissions.
- Execution packs do not authorize commands, network access, deployment, or
  external writes.
- Hosted adapters must filter resources before retrieval and again before
  returning citations or artifacts.

## Provider integrations

The `ModelProvider` and `EvidenceProvider` interfaces do not include an
implementation in v0.1. An integration must document:

- which data may leave the local trust boundary;
- the exact provider, model, endpoint, and schema;
- timeout, retry, cost, and fallback behavior;
- how disallowed providers remain disallowed during fallback;
- retention, logging, and deletion behavior.

Never treat schema conformance as factual verification.

## Local data

Store only data that the local user is permitted to retain. Avoid credentials,
tokens, customer data, and unrestricted session transcripts. The default store
is not encrypted. Use OS-level disk encryption and appropriate backups when
data sensitivity requires them.

