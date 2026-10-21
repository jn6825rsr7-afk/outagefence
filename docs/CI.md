# CI integration

Install the reviewed archive or use the reviewed source checkout. The package has no dependencies, so the CI command can invoke the source directly:

```sh
node path/to/outagefence/bin/outagefence.mjs run \
  --config test/privacy/outagefence.json \
  --out test-results/outagefence
```

Your CI must preserve the exit code. PASS is 0; violation is 1; usage or execution error is 2; incomplete coverage is 3. Upload the four generated report files as test artifacts even when the command fails. If your CI reads JUnit, import `test-results/outagefence/junit.xml`; inconclusive scenarios are failures, never skipped tests.

Run in a disposable environment with synthetic application input and test-only response fixtures. Bind all clients you want observed to the injected endpoints. If you need a guarantee that nothing else can be contacted, independently restrict network egress at the CI/container/OS layer. OutageFence's local listeners are not that restriction.

The child command should launch any needed test application, exercise its behavior and terminate its own work before returning. macOS/Linux cleanup terminates the ordinary process group, including surviving foreground test children; do not intentionally daemonize test processes. Stateful external test services should be reset by the application's own setup.

Use declared `inputs` for important source files and commit the configuration alongside the application. Store the tested revision in your CI artifact metadata. The configuration and declared input hashes in the report provide a local reference; they are not signed CI attestations.

Use the public source checkout or the downloadable archive from [GitHub Releases](https://github.com/jn6825rsr7-afk/outagefence/releases). The package is not on the npm registry, so a bare `npx outagefence` is not an installation route.
