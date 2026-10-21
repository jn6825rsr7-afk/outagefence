# Configuration reference

The version 1 JSON format is validated before the child command starts. Unknown keys, unknown services, invalid fault fields, colliding endpoint variables, and missing positive controls are rejected. The executable validator in `src/config.mjs` is authoritative.

| Top-level field | Meaning | Default |
|---|---|---|
| `version` | Must be `1` | Required |
| `name` | Human-readable report name | Required |
| `command` | Executable and arguments, without shell interpolation | Required |
| `services` | Named HTTP destinations and endpoint environment variables | Required |
| `markers` | Synthetic data classes and destination contracts | Required |
| `scenarios` | Ordered matrix, including a no-fault baseline | Required |
| `env` | Explicit string environment values for the child | `{}` |
| `inheritEnv` | Explicit parent environment names to inherit | `[]` |
| `inputs` | Relative regular files to fingerprint before and after the matrix | `[]` |
| `timeoutMs` | Per-command deadline, 100–300000 ms | `10000` |
| `settleMs` | Observation grace after command completion, 0–5000 ms | `100` |
| `maxBodyBytes` | Per-request capture cap, 1 KiB–16 MiB | `1048576` |
| `maxRequests` | Per-scenario record cap, 1–10000 | `1000` |

At most 16 services, 16 marker classes, and 64 scenarios are accepted. Service and marker names begin with a lowercase letter and contain lowercase letters, numbers, underscores, or hyphens. Marker names that collapse into the same environment variable are rejected.

## Services

```json
{
  "primary": {
    "env": "PRIMARY_URL",
    "maxCalls": 3,
    "response": {
      "status": 200,
      "json": { "summary": "Synthetic result" },
      "headers": { "x-test-fixture": "yes" }
    }
  }
}
```

Every service gets its own ephemeral `http://127.0.0.1:PORT` endpoint. All paths at that endpoint share the response and contract. Supply `response.text` instead of `response.json` for text. The response defaults to HTTP 200 and `{"ok":true}`; `maxCalls` defaults to 10. This is a small HTTP fixture surface, not a provider protocol emulator. Responses for an SDK must match what that SDK expects.

Methods, timestamps, body byte counts, matched marker labels, action, status, and body SHA-256 are retained. Headers, URL paths, query strings and body bytes are inspected in memory and discarded. An oversized or incomplete request cannot support an absence-of-leak claim.

## Markers

```json
{
  "customer": {
    "allowedServices": ["primary"],
    "requiredIn": ["primary"]
  }
}
```

Each scenario generates fresh cryptographically random synthetic tokens. The example above exposes its value in `OUTAGEFENCE_MARKER_CUSTOMER`. A marker named `case-note` is exposed as `OUTAGEFENCE_MARKER_CASE_NOTE`.

Put the token into the actual tested input. Sending it directly to a positive-control endpoint from a separate helper would weaken the test: the positive control should represent the real application path.

Every marker must have at least one positive-control destination in `requiredIn`, and each required destination must also be allowed. This design prevents a vacuous no-input pass. `requiredIn` applies independently in **every scenario**. If a scenario intentionally avoids reading or sending that data entirely, give that behavior a separate configuration with a different appropriate positive control.

Supported detection: plaintext token, base64 or base64url of the standalone token, lowercase hex of the standalone token, and lowercase hexadecimal JSON Unicode escaping of every character. Arbitrary transformed values, hashes, encryption, compressed payloads, chunked semantic fragments, and base64 of a larger enclosing document are not covered. HTTP transfer chunking is reassembled normally; splitting the token across semantic fields is not.

## Scenarios

```json
{
  "id": "primary-rate-limited",
  "faults": { "primary": { "type": "http", "status": 429, "afterCalls": 0 } },
  "requiredServices": ["backup"],
  "maxCalls": { "primary": 2, "backup": 1 }
}
```

| Fault type | Extra fields | Behavior |
|---|---|---|
| `http` | `status`: 400–599 | Respond with the status, generic JSON error and Retry-After 0 |
| `drop` | None | Close the connection after receiving the request body |
| `delay` | `delayMs`: 1–300000 | Wait before sending the normal response |
| `malformed` | None | Respond 200 with invalid JSON |

Every fault optionally accepts `afterCalls` (default 0). The first N requests are normal; all later requests receive the fault. Requests are numbered when received. A fault that never reaches its trigger makes the scenario inconclusive.

`requiredServices` requires at least one request to those services. `maxCalls` overrides the service-level request budget for this scenario. Use a zero-call budget to forbid all traffic to a destination, including traffic without markers. Baselines use an empty or omitted `faults` object. Multiple simultaneous failures are supported when explicitly declared; they are not automatically expanded into a combinatorial matrix.

## Process behavior

The child runs in the configuration directory with no interactive stdin and no shell. It must stay in the foreground and return only after its work completes. On macOS/Linux its process group is terminated after exit or deadline to clean up surviving test children. Children that deliberately detach into a new session are outside this cleanup guarantee. Windows process-tree cleanup has not been validated.

Basic runtime variables (PATH, HOME or USERPROFILE, system and temporary-directory variables, LANG and LC_ALL) are retained. `CI=true`, synthetic markers, scenario ID, and local endpoint variables are then injected. Other variables require `inheritEnv` or `env`. Endpoint collisions and loader variables such as NODE_OPTIONS, NODE_PATH and LD_PRELOAD are rejected in custom environment configuration. HOME access still permits a process to read user files; this is not a credential or filesystem sandbox.

Child output is drained but never saved or displayed. Use your own test runner directly while debugging failures. OutageFence records byte counts and exit status without assuming it can safely redact arbitrary application logs.

Declared input fingerprints cover only named files, not transitive imports, dependencies, runtime state or the full environment. No signature or remote attestation is generated.
