# Security policy

This is the **satwareAG fork** of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
Upstream publishes no security policy and has private vulnerability reporting
disabled, so this file covers this fork only. It is not a DeepSeek security
contact and carries no DeepSeek endorsement.

## Reporting a vulnerability

Email **security@satware.com** with:

- affected version (`satware-v*` tag) and platform,
- a reproduction or proof of concept,
- whether the issue is inherited from upstream or introduced by this fork.

Please do not open a public issue for an unpatched vulnerability. We aim to
acknowledge within 3 business days and to publish a fix or a mitigation note
within 30 days, whichever is faster.

**Upstream issues:** if the defect exists in unmodified upstream code, we will
tell you so and pass it on to DeepSeek through their published channels
(their organisation contact or GitHub Discussions, both of which are the only
paths upstream currently offers). We will not open a public issue with exploit
detail on their tracker, and upstream has pull requests disabled, so a fix
cannot be sent as a patch there.

## What this fork guarantees

| Control | Where it lives | Verified by |
|---|---|---|
| Dependency advisories closed | `overrides` in `pnpm-workspace.yaml` | `pnpm audit --audit-level high` in `.github/workflows/security.yml` |
| The one unpatched advisory is compensated | `patches/extract-zip@2.0.1.patch` + `auditConfig.ignoreGhsas` | `scripts/extract-zip-symlink-guard.spec.ts` (4 cases, includes a negative control) |
| No secrets committed | `.github/workflows/security.yml` | `betterleaks detect --no-git` on every PR |
| Workflows audited | `.github/workflows/security.yml` | `zizmor` |
| No internal paths or hosts in a public repo | `scripts/satware/check-privacy-leaks.mjs` | privacy job on every PR |
| Build provenance | `.github/workflows/release-cli.yml` | `gh attestation verify <binary> -R satwareAG/deepseek-harness` |
| Telemetry off | `DSH_TELEMETRY_DISABLED=1` in every workflow | egress test (see `docs/fork.md`) |

## Suppression policy

A suppression is only acceptable when it is tied to code we own and a test
that fails without it. There is exactly one today: the two `extract-zip`
GitHub advisories (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3) have no fixed
release, so `pnpm-workspace.yaml` carries a local patch and the matching
`ignoreGhsas` entries. `scripts/extract-zip-symlink-guard.spec.ts` fails if the
patch stops applying. Anything else must be fixed, not suppressed.

## Scope

In scope: the `satware-v*` release binaries and the `satware/main` branch.
Out of scope: unmodified upstream code that we have not shipped, and the
upstream repository itself (report to DeepSeek).
