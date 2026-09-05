# Security model

Core validates decision artifacts and composes decision packs from explicit
inputs. It is not a sandbox, policy engine, secret store, authorization service,
LLM runtime, network client, or executor.

## Trust boundaries

- JSON input is untrusted until schema and domain validation succeed.
- Evidence content and model output remain untrusted after structural
  validation.
- Instructions found in evidence are data and do not grant tool permissions.
- Workflow step policies describe intended effects; they do not authorize them.
- A decision-pack status is a derived assessment, not permission to execute.
- Execution packs do not authorize commands, network access, deployment, or
  external writes.
- `resourceRef`, `publicUri`, and `bundlePath` are references, not instructions
  for Core to retrieve or execute content.
- Hosted adapters must filter resources before retrieval and again before
  returning citations or artifacts.

## Public and restricted materials

Portable workflow releases may describe both public and restricted materials,
but they must never contain private bytes, credentials, bearer URLs, signed
download URLs, or entitlement tokens. Core rejects embedded URL credentials,
recognized credential schemes, whitespace-bearing references, and known signed
URL parameter families. This is a structural guard, not general secret scanning;
hosts must scan and redact inputs before Core validation. Restricted evidence and materials do not
expose `publicUri` in Core artifacts. A Platform adapter must authenticate the
user, check ACLs and entitlements, and mint any short-lived delivery capability
outside Core.

Core carries license and attribution metadata as technical evidence. It does
not determine whether licenses are legally compatible with a product, tenancy,
distribution, branding, or business model. Unknown, modified, custom, dual,
copyleft, patent-sensitive, or jurisdiction-dependent terms require human or
legal review.

## Provider integrations

The `ModelProvider` and `EvidenceProvider` interfaces do not include a default
implementation. Core's validator and decision-pack composer do not invoke them.
An integration must document:

- which data may leave the local trust boundary;
- the exact provider, model, endpoint, and schema;
- timeout, retry, cost, and fallback behavior;
- how disallowed providers remain disallowed during fallback;
- retention, logging, and deletion behavior.

Never treat schema conformance as factual verification.

## Service boundaries

- Scout may discover sources, select candidates, and collect evidence, subject
  to its own source and privacy policy.
- Platform owns mutable drafts, authentication, ACLs, entitlements, UTM
  analytics, private delivery, course state, and Course Bot.
- Executors own confirmation, least privilege, sandboxing, network controls,
  secret injection, timeouts, cost controls, side effects, and rollback.

None of those responsibilities are delegated by importing a Core document.

## Local data

Store only data that the local user is permitted to retain. Avoid credentials,
tokens, customer data, and unrestricted session transcripts. The default store
is not encrypted. Use OS-level disk encryption and appropriate backups when
data sensitivity requires them.
