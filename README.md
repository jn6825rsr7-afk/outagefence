# OutageFence

**By Slanta Cause · Free early-access release**

[Website and captured example reports](https://outagefence-slanta-cause.slanta-cause.chatgpt.site) · [Free downloads](https://github.com/jn6825rsr7-afk/outagefence/releases) · [Report a bug](https://github.com/jn6825rsr7-afk/outagefence/issues) · [Contribute](CONTRIBUTING.md)

**Test where sensitive data goes when your dependencies fail.**

OutageFence is a local command-line tool for testing application data boundaries under HTTP failures. It starts temporary endpoints for your services, gives your test synthetic marker values, runs a declared failure matrix, and checks which destinations receive those values.

A fallback may return a perfectly good answer while copying private input into an unapproved backup or error collector. OutageFence tests that boundary explicitly.

**Status:** 0.1.0-rc.2, free early-access release. Tested locally on macOS with Node.js 22. No customer deployment, provider trial, or commercial demand has been validated. See [the evidence limits](docs/BOUNDARIES.md).

## Run the complete demonstration

Requires Node.js 22 or later. There are no package dependencies or install scripts.

Clone and run from source:

```sh
git clone https://github.com/jn6825rsr7-afk/outagefence.git
cd outagefence
node bin/outagefence.mjs demo --out artifacts/my-demo
```

Or, if you already have the source directory:

```sh
node bin/outagefence.mjs demo --out artifacts/my-demo
```

Open `artifacts/my-demo/index.html`. The broken example passes its normal baseline and leaks its synthetic customer value in five failure scenarios. The corrected example satisfies all six declared contracts. Both versions finish their application task successfully.

Download the `.tgz` file from [GitHub Releases](https://github.com/jn6825rsr7-afk/outagefence/releases), then install the local archive:

```sh
npm install --global --ignore-scripts ./outagefence-0.1.0-rc.2.tgz
outagefence demo
```

The package is not currently on npm. Do not substitute `npx outagefence` for the local archive command.

## Use it with your own application

```sh
outagefence init my-boundary-test
outagefence run --config my-boundary-test/outagefence.json --out my-results
```

Replace `command` with a foreground test or application command, supplied as an argument array. Relative command paths resolve from the configuration file's directory. `$NODE` selects the Node executable currently running OutageFence.

1. Point your application's service clients at the environment variables declared in `services`. OutageFence sets them to temporary loopback endpoints.
2. Feed `OUTAGEFENCE_MARKER_CUSTOMER` into the tested input in place of a sensitive customer value. Add other named markers for other data classes.
3. Declare where each marker is allowed, and where it **must** be observed as a positive control. Include a baseline and the failures you want to exercise.
4. Make your command assert the intended user-facing result and exit nonzero if that fails. OutageFence independently checks the declared routing and request-count contract.

The generated `examples/outagefence.json` is a complete runnable reference. [Configuration reference](docs/CONFIGURATION.md) · [CI integration](docs/CI.md) · [Architecture and reuse decisions](docs/ARCHITECTURE.md).

## What you get

- Deterministic HTTP error, connection-drop, delay, and malformed-JSON scenarios, including faults after a specified number of calls.
- Per-marker allowed destinations, required positive controls, required service calls, and call-count budgets.
- Separate `PASS`, `FAIL`, `INCONCLUSIVE`, and `ERROR` states. Missing input or an unused fault never becomes a pass.
- A self-contained HTML report with a failure matrix, filters, and request details. It works offline and at narrow screen widths.
- JSON for automation, Markdown for review, and JUnit XML for CI. Inconclusive coverage fails the JUnit check.
- Optional fingerprints for declared source files. Changes during a matrix make otherwise passing results inconclusive.
- No raw request bodies, headers, URL paths, marker values, or child output in the reports. There is no telemetry.

## Result and exit codes

| State | Meaning | Exit |
|---|---|---:|
| PASS | Declared local contract was exercised and satisfied | 0 |
| FAIL | Forbidden marker destination or request budget violation observed | 1 |
| ERROR | Command failed, could not start, timed out, or execution failed | 2 |
| INCONCLUSIVE | Required evidence or complete capture is missing | 3 |
| Interrupted | User interrupted the run | 130 |

Violations take precedence over other states, but every finding remains in the report. `demo` returns 0 when the expected broken-versus-fixed contrast is observed.

## Boundaries that matter

OutageFence observes **only the configured local HTTP endpoints**. It does not discover hardcoded external destinations, block network egress, inspect databases or files, or sandbox the child command. Use synthetic data and a disposable test environment; use network isolation separately when required.

Matching covers exact synthetic tokens and documented standalone encodings. It is not general PII detection or taint tracking. Compressed request bodies produce an explicit coverage gap. A pass does not establish production privacy, regulatory compliance, or provider behavior.

The configured command is executable code. Review a configuration before running it. Most parent environment variables, including ordinary API-key variables, are not inherited by default. The child still has the normal filesystem and OS permissions of the user running it.

## Development

```sh
npm test
npm run demo
npm pack --ignore-scripts
```

No dependency installation is required. The automated suite exercises actual loopback HTTP, both application variants, CLI behavior, error states, capture limits, report escaping, source changes, and installation-shaped use.

## Distribution

Free and open source under the MIT license, copyright 2026 Slanta Cause. See `LICENSE`. The npm manifest retains `private: true` to prevent accidental registry publication; local archive installation works normally.

People run OutageFence on their own computer. It has no paid API integration, hosted inference, account system, subscription, or usage billing. GitHub releases provide the downloadable files. The separate demonstration website is a static presentation and does not run users' application tests.
