# Security and responsible use

Treat configurations as executable code: they declare a child command. Review them before running them. Use synthetic inputs and disposable test environments. The runner is not a sandbox or an egress firewall. See `docs/BOUNDARIES.md` for the complete threat model.

This release binds mock endpoints only to loopback, does not proxy to live services, avoids shell interpolation, bounds capture, omits raw values and application output from reports, and does not inherit arbitrary environment variables by default.

For a suspected vulnerability, use [GitHub private vulnerability reporting](https://github.com/jn6825rsr7-afk/outagefence/security/advisories/new). For ordinary bugs, open a [GitHub issue](https://github.com/jn6825rsr7-afk/outagefence/issues). Include the tool version, operating system, Node version and a synthetic reproduction. Do not include real prompts, credentials, customer information, private project filenames, or live request bodies.

There is no managed security support service or external audit for this early-access release. Use a synthetic reproduction when discussing a suspected defect publicly.
