# Security Policy

## Supported Versions

This repository is actively maintained on the `main` branch.

## Reporting a Vulnerability

Do not open a public issue for security problems.

If private vulnerability reporting is enabled for this repository, use GitHub's `Report a vulnerability` flow in the repository `Security` tab.

If that option is not available, contact the maintainer privately through GitHub and include:

- a short description of the issue
- affected routes, files, or features
- clear reproduction steps
- impact assessment
- any proof-of-concept details needed to verify the report

Please avoid public disclosure until a fix has been shipped.

## Secrets and Infrastructure

This repository must never contain:

- real `.env` or `.dev.vars` files
- Cloudflare or GitHub API tokens
- mobile signing keys, provisioning profiles, or certificates
- exported production database dumps

Runtime secrets belong in GitHub Actions secrets, Cloudflare secrets, or local untracked development files.
