# Governance

AtlasRepo Core uses a maintainer-led, public decision process.

## Decisions

- Documentation and small fixes may be approved by one maintainer.
- New contracts and backward-compatible features require a public issue or RFC
  and maintainer approval.
- Breaking schemas, security boundaries, licensing, and governance changes
  require an RFC and explicit approval from the project lead.
- Technical decisions should be recorded in the repository, not only in private
  chat.

Maintainers decide by evidence, user value, compatibility, security, and
maintenance cost. The project may decline changes that move hosted product
logic, arbitrary execution, or vendor-specific policy into the open Core.

## Roles

Maintainers review and merge changes, triage security reports, and publish
releases. Contributors propose and implement changes. Becoming a maintainer
requires sustained useful contributions, sound judgment, and invitation by the
existing maintainers.

Current maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

## Releases

Releases use semantic versioning. Before 1.0, a new minor version may contain
breaking changes, but wire-contract changes still require a new schema version
and migration notes. Release publication and branch protection are GitHub
administration actions outside this repository's code.

