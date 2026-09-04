# Security policy

## Supported versions

AtlasRepo Core is pre-1.0. Security fixes are applied to the latest release and
the default development branch. Older alpha versions may not receive fixes.

## Reporting a vulnerability

Do not open a public issue.

Use GitHub's private vulnerability reporting or open a private draft security
advisory at:

<https://github.com/Arnon-hs/atlasrepo-core/security/advisories/new>

Include the affected version, impact, minimal reproduction, and any suggested
mitigation. Do not include real credentials or third-party personal data.

The maintainers will acknowledge reports on a best-effort basis, coordinate a
fix privately when confirmed, and credit reporters who want attribution.

## Relevant boundaries

Core does not execute code or make network requests. Reports involving a
specific hosted AtlasRepo deployment, an LLM provider, or another repository
should be filed with the owner of that system unless the defect originates in a
Core contract or implementation.

