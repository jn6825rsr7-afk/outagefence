# Contributing to OutageFence

OutageFence is a free, MIT-licensed project by Slanta Cause. Small, focused fixes and synthetic reproductions are welcome.

Run with Node.js 22 or later:

```sh
git clone https://github.com/jn6825rsr7-afk/outagefence.git
cd outagefence
npm test
npm run demo
```

No dependency installation is needed. Use an issue to explain a reproducible defect or a missing capability before making a substantial change. Include the operating system, Node.js version, command exit status, and a minimal fictional reproduction.

Keep reports and test fixtures free of real prompts, customer information, credentials, private URLs and local personal paths. Never upload an unreviewed application transcript or raw production request. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

Changes to result semantics need particular care. Preserve explicit positive controls and exercised-fault checks. Unsupported protocols, incomplete capture or missing observations must never become a passing result. A local test does not establish whole-process privacy or real-provider behavior.

Add a regression test for a behavioral fix; tests should exercise the defect rather than merely repeat the implementation. Keep pull requests small enough to review. Contributions are licensed under the project's MIT license, retaining Slanta Cause's copyright notice.
