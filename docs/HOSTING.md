# Website hosting

OutageFence by Slanta Cause is free and open source under the MIT license.

The public website is https://jn6825rsr7-afk.github.io/outagefence/ .
Its static source is the `gh-pages` branch of this same public repository.
GitHub Pages publishes the branch root, with HTTPS enforced and no custom domain.
`.nojekyll` keeps the HTML, JavaScript, styles, documentation, and captured reports buildless.
Downloads come from GitHub Releases. Website visitors do not run a hosted backend,
database, model API, or billing-connected service on behalf of Slanta Cause.

## Update the website

Use a separate checkout so website files remain separate from the CLI source:

```sh
git clone --branch gh-pages --single-branch https://github.com/jn6825rsr7-afk/outagefence.git outagefence-website
cd outagefence-website
# Edit the static files, verify links and browser behavior, then commit and push.
```

Keep links relative to the website directory. The project lives under
`/outagefence/`, so a root-relative link such as `/docs.html` points outside it.
Keep the Slanta Cause credit, MIT license, evidence limits, and release links intact.
Do not add paid hosting, API calls, analytics, or custom-domain services without
explicit owner approval.

The site uses GitHub Pages for a public repository, which is available with GitHub
Free. GitHub documents usage limits and may limit serving if those are exceeded:
https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits .

The previous ChatGPT Sites address is retired from public use. Do not republish it
or restore public access as part of routine website updates.
