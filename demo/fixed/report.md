# OutageFence by Slanta Cause: The same fallback with its data boundary preserved

**PASS** · 6/6 scenarios · 2026-10-21T16:27:41.195Z

Evidence: local synthetic HTTP. Only declared endpoints and marker representations are observed.

| Scenario | Result | Requests | Findings |
|---|---|---:|---:|
| baseline | PASS | 1 | 0 |
| primary-rate-limited | PASS | 3 | 0 |
| primary-unavailable | PASS | 3 | 0 |
| primary-disconnected | PASS | 3 | 0 |
| primary-too-slow | PASS | 3 | 0 |
| primary-malformed | PASS | 3 | 0 |

## baseline: PASS

Declared local contract satisfied.

## primary-rate-limited: PASS

Declared local contract satisfied.

## primary-unavailable: PASS

Declared local contract satisfied.

## primary-disconnected: PASS

Declared local contract satisfied.

## primary-too-slow: PASS

Declared local contract satisfied.

## primary-malformed: PASS

Declared local contract satisfied.

## Evidence limits

- Only requests received by declared local endpoints are observed.
- Synthetic marker matching is not general data-flow tracking.
- The child command is not network-isolated or sandboxed.
- A passing scenario establishes only its declared local contract.

Config SHA-256: 33a46b6348657a966f965459605bdc58606d6347f3934afb93326021a4f67d3b

Node v22.23.3 on darwin. Raw request values and command output are not retained.
