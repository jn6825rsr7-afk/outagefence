# Evidence boundaries and threat model

OutageFence answers: **under these synthetic inputs and injected HTTP failures, did a declared local endpoint receive a marker it was not allowed to receive?**

It also checks that positive controls, required calls, requested faults, capture completeness and command execution support the result.

It is intended for developers testing their own code in a disposable environment. It is not designed to safely execute a malicious repository or prevent a hostile application from evading observation. Any local process able to reach the ephemeral ports can also send requests; run the harness on a trusted or isolated test host.

## What PASS means

The command exited zero. All configured positive controls and required services were observed. Every declared fault was injected. No configured call budget was exceeded. No supported representation of a marker was observed at a forbidden configured endpoint. No capture gap or declared source change was detected.

This result concerns a specific configuration, input set, application invocation and local endpoint set. It is not a statement about every input, every failure, all data flows, real providers, or production.

## Coverage gaps

- Unconfigured or hardcoded network destinations are invisible. A green result cannot establish that no other network request occurred.
- No inspection of databases, filesystem writes, terminal output, shared memory, provider retention or remote logs.
- No interception of TLS traffic, DNS, HTTP/2, WebSockets or non-HTTP protocols. Clients must use the injected local HTTP URLs.
- No partial SSE-stream fault simulation or token-by-token truncation. Use a mature provider mock when protocol fidelity is the question.
- Marker matching is exact and synthetic. Transformed, encrypted, hashed, fragmented or arbitrarily encoded values may evade detection. Declared compressed bodies are explicitly inconclusive.
- An application can mishandle data while omitting the synthetic marker. Required positive controls reduce vacuous tests but do not prove that every data field follows the same path.
- Only faults and code paths present in the declared matrix are exercised. No exhaustive failure enumeration.
- The test command owns functional assertions. Exit zero without a functional assertion does not establish that a summary, payment, workflow or user journey was correct.

## Report privacy

Captured request content exists temporarily in process memory. Reports contain labels, method, timing, size, action, body digest and matched marker names. Values, paths, headers and child output are discarded. Body hashes are metadata and can still reveal equality or permit guessing of low-entropy inputs. Configuration names, declared filenames and service labels are also metadata. Use synthetic data, including synthetic response fixtures; inspect reports before sharing them.

Report files are written with mode 0600 on POSIX. Temporary local endpoints bind only to 127.0.0.1. There are no outgoing requests or analytics in the runner itself. The child command retains ordinary user permissions and may make its own outgoing requests. Third-party SDK telemetry is outside this tool's control.

## Interpreting failure

A violation is a concrete observation at a configured endpoint. It is not a conclusion that a production breach occurred. An inconclusive result states a missing or incomplete observation. An execution error records a failed test invocation. All three require different remediation, and all remain non-green in automation.

No legal or compliance certification is provided.
