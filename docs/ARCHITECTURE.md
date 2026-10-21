# Architecture and reuse decisions

OutageFence separates configuration validation, local HTTP capture, marker matching, process execution, contract evaluation and report rendering. Each scenario gets new endpoint ports, fresh markers and a fresh application process. No state is carried between application runs. The application may still read external files or state unless its test setup isolates them.

`src/config.mjs` rejects unknown fields and inconsistent contracts. `src/endpoints.mjs` uses Node's HTTP server for bounded request capture and deterministic fixtures. `src/markers.mjs` creates synthetic values and matches documented representations. `src/runner.mjs` invokes a command without a shell, applies deadlines, evaluates observed contracts and fingerprints declared inputs. `src/report.mjs` writes four formats from the same result object. `src/demo.mjs` exercises a deliberately broken and corrected fictional application. `bin/outagefence.mjs` supplies the CLI and stable exit codes.

## Reuse before reinvention

The commodity transport, process management, cryptography, test framework and file operations come from the maintained Node.js standard library. No custom HTTP parser, encryption, shell, test runner or template framework was written. Node is the only runtime dependency; no third-party package code is vendored.

The product-specific work is the cross-destination marker contract, positive-control requirements, exercised-fault gate, result semantics and compact failure report.

Existing tools were evaluated before implementation:

| Tool | Existing capability | Decision |
|---|---|---|
| [WireMock](https://wiremock.org/docs/simulating-faults/) | Mature HTTP fixtures, failures and request verification | Prefer it for sophisticated mock behavior. A JVM/runtime dependency is unnecessary for this narrowly bounded local contract runner. |
| [MockServer](https://www.mock-server.com/mock_server/chaos_testing.html) | Rich HTTP/proxy/LLM chaos features | Do not recreate its protocol or chaos catalog. This release implements only four simple fixture behaviors. |
| [LLMock](https://pypi.org/project/llmock/) | Provider-aware LLM faults and client resilience verdicts | Prefer it for SDK fidelity, retry/backoff and streaming. OutageFence's current generic fixtures do not replace it. |
| [AIMock](https://github.com/CopilotKit/aimock) | Broad AI-stack service mocking | Adjacent infrastructure; a future integration could reuse it when multi-protocol support is justified. |
| [AgentLeak](https://github.com/yagobski/agentleak) | Privacy leakage testing and channel inspection | Adjacent privacy tool; this product focuses on application destination contracts under explicit dependency failures. |
| [chaosbringer](https://github.com/mizchi/chaosbringer) | Browser-driven chaos and invariants | Prefer it for browser exploration. No browser crawler is included here. |

These comparisons concern documented capabilities reviewed on October 21, 2026. They are not exhaustive competitive audits. Existing mock frameworks can be scripted to reproduce this workflow. The opportunity is reducing that integration and interpretation work, not inventing fault injection or proving a technical monopoly.

No external tool is a runtime dependency. Therefore its license does not attach to this source. Licenses and package versions must be re-reviewed before any later embedding or distribution of third-party code.

## Scope choices

No cloud service, AI model, telemetry, account system, license server or payment integration was added. These would increase operation and privacy obligations without helping the initial job. There is no data residency inference: destinations are developer-defined names representing their intended roles.

The v1 configuration deliberately has no executable hooks, remote fixture download, automatic dependency installation or shell-string command. It still launches the declared application command, so configurations must be trusted.

## Extension criteria

Add a provider-aware mock adapter only after a real pilot needs SDK fidelity. Add a browser integration only when an existing application journey demonstrates the need. Add an egress-isolated runner before claiming whole-process network coverage. Never silently broaden PASS as new functionality is added.
