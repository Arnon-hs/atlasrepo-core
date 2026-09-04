# Source observations

All links below are pinned to Dify commit
`ad90cb911138f6b27af996c87afe34fbb5a4ed16`.

| Observation | Evidence | What it does not prove |
|---|---|---|
| Dify describes itself as an LLM application platform with workflows, RAG, agents, model management, observability, and APIs. | [README lines 63-114](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/README.md#L63-L114) | Feature completeness, compatibility, performance, or suitability for a specific team. |
| The quick start states a minimum of 2 CPU cores, 4 GiB RAM, and Docker Compose 2.24 or later. | [README lines 65-83](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/README.md#L65-L83) | Actual resource consumption or successful startup in the target environment. |
| The license is a modified Apache 2.0 text with additional multi-tenant and frontend conditions. | [LICENSE lines 3-18](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/LICENSE#L3-L18) | Compatibility with the intended use. That requires qualified human review. |
| The project provides a private vulnerability-reporting process. | [SECURITY lines 3-27](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/SECURITY.md#L3-L27) | Absence of vulnerabilities, security of a release, or security of a deployment. |
| The Compose manifest includes application, worker, state, sandbox, proxy, and optional vector-store components. | [Compose services](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/docker/docker-compose.yaml#L206-L1298) | Which optional services run in a chosen configuration or whether operations are production-ready. |
| The Docker guide documents environment, data-service, and upgrade concerns. | [Docker deployment guide](https://github.com/langgenius/dify/blob/ad90cb911138f6b27af996c87afe34fbb5a4ed16/docker/README.md) | Successful backup, restore, upgrade, rollback, or incident recovery. |

The evidence supports candidate relevance and the need for a bounded pilot. It
does not support an adoption, deployment, security, or license conclusion.

