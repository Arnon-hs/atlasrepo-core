# Contributing

Thanks for helping make evidence-backed decisions more reproducible.

## Before opening a pull request

For bugs, open a focused issue with a minimal reproduction. For new contracts,
provider interfaces, or breaking behavior, start with an issue or short RFC so
the boundary can be reviewed before implementation.

Do not include secrets, private customer data, proprietary prompts, or examples
that you do not have permission to redistribute.

## Local setup

Prerequisites: Node.js 22 or newer and npm 10 or newer.

```bash
git clone https://github.com/Arnon-hs/atlasrepo-core.git
cd atlasrepo-core
npm install
npm run check
npm test
npm run build
```

## Change guidelines

- Keep Core local-first and useful without AtlasRepo Platform.
- Prefer small interfaces and explicit contracts over framework abstractions.
- Add tests for invalid input and failure behavior.
- Update JSON Schema, TypeScript types, fixtures, and contract docs together.
- Never weaken validation for one provider or example.
- Do not add runtime network calls or arbitrary execution to Core.
- Use clear imperative commit subjects. Conventional Commits are welcome but
  not required.

Before submitting:

```bash
npm run check
npm test
npm run build
npm pack --dry-run
npm audit --omit=dev
```

Maintainers review correctness, evidence boundaries, compatibility, tests, and
documentation. There is no guaranteed review SLA; the project is currently
maintained on a best-effort basis.

Contributions intentionally submitted for inclusion are accepted under the
Apache License 2.0, as described in section 5 of the license.

