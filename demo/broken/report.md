# OutageFence by Slanta Cause: A successful fallback that leaks data

**FAIL** · 6/6 scenarios · 2026-10-21T16:27:39.797Z

Evidence: local synthetic HTTP. Only declared endpoints and marker representations are observed.

| Scenario | Result | Requests | Findings |
|---|---|---:|---:|
| baseline | PASS | 1 | 0 |
| primary-rate-limited | FAIL | 3 | 2 |
| primary-unavailable | FAIL | 3 | 2 |
| primary-disconnected | FAIL | 3 | 2 |
| primary-too-slow | FAIL | 3 | 2 |
| primary-malformed | FAIL | 3 | 2 |

## baseline: PASS

Declared local contract satisfied.

## primary-rate-limited: FAIL

- violation: Synthetic customer data reached telemetry (request 2).
- violation: Synthetic customer data reached backup (request 3).

## primary-unavailable: FAIL

- violation: Synthetic customer data reached telemetry (request 2).
- violation: Synthetic customer data reached backup (request 3).

## primary-disconnected: FAIL

- violation: Synthetic customer data reached telemetry (request 2).
- violation: Synthetic customer data reached backup (request 3).

## primary-too-slow: FAIL

- violation: Synthetic customer data reached telemetry (request 2).
- violation: Synthetic customer data reached backup (request 3).

## primary-malformed: FAIL

- violation: Synthetic customer data reached telemetry (request 2).
- violation: Synthetic customer data reached backup (request 3).

## Evidence limits

- Only requests received by declared local endpoints are observed.
- Synthetic marker matching is not general data-flow tracking.
- The child command is not network-isolated or sandboxed.
- A passing scenario establishes only its declared local contract.

Config SHA-256: 15f6c9c27fa6487688da4f830461321b1850dfb358914805595d310dfde79708

Node v22.23.3 on darwin. Raw request values and command output are not retained.
