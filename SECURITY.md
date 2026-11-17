# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please report security issues privately through GitHub's
[Security Advisories](https://github.com/M0-AR/embedded-claims-audit/security/advisories/new)
for this repository. Do not open a public issue, and do not include exploit
details in a pull request.

Include:

- The affected version or commit.
- A description of the issue and its impact.
- A minimal reproduction, if one exists.
- Any suggested fix or mitigation.

You can expect an acknowledgement within seven days. If the report is valid,
the maintainers will coordinate a fix and a disclosure date with you. Credit is
given unless you prefer to remain anonymous.

## Scope

This project is a static site and a Python analysis pipeline. Areas of interest
include:

- The GitHub Pages deployment and the static console.
- The Python package, scripts, and Docker image.
- Supply-chain issues in pinned dependencies or release artifacts.

The audit's numerical results are not security vulnerabilities. If you believe
a claim is wrong, open a claim-challenge issue with the evidence; that is a
correctness discussion, not a security report.

## Practices

- No credentials, tokens, or dataset files belong in the repository.
- Releases are built from tagged commits by CI, not from a maintainer laptop.
- `SHA256SUMS` is published with each release for the wheel and sdist.
- Dependencies are pinned by range in `pyproject.toml` and updated through
  Dependabot.
