# satwareAG fork notice

This repository is a **fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**,
maintained by [satware AG](https://satware.com) for internal use and published
in the open because the hardening work is useful to anyone running `dsh`.

- **Not affiliated with, endorsed by, or supported by DeepSeek.** "DeepSeek",
  "DeepSeek Harness" and "DSH" are trademarks of DeepSeek. They are used here
  only to describe what this fork is derived from, per DeepSeek's
  [brand guidelines](BRAND_GUIDELINES.md). No DeepSeek logo, wordmark or brand
  asset is redistributed by this fork, and nothing here should be read as an
  official distribution.
- **Licence unchanged.** The upstream MIT licence and `THIRD_PARTY_NOTICES.md`
  are kept byte-identical. Every file we add is MIT, same terms.
- **Upstream first.** If a fix in this fork belongs upstream, it is written so
  it can be adopted there. Upstream currently has pull requests and issues
  disabled, so we publish the change here and say so in
  [docs/security/advisories.md](docs/security/advisories.md).

## What this fork changes

Only what is needed to ship a hardened `dsh` CLI internally. The delta is kept
to five areas so a weekly upstream rebase stays cheap:

| Area | What lives there |
|---|---|
| **Dependency** | `pnpm-workspace.yaml` (`overrides`, `auditConfig.ignoreGhsas`), `patches/extract-zip@2.0.1.patch` |
| **CI** | `.github/workflows/` - three owned workflows: `ci.yml`, `security.yml`, `release-cli.yml`; `.github/dependabot.yml` (github-actions lane only); three repo-level rulesets (no force pushes, no deletion, required checks on `satware/main` - see `docs/fork.md` "Protection") |
| **Gates** | `scripts/satware/` (privacy, secret canary, telemetry egress, sync, pre-pr), `scripts/extract-zip-symlink-guard.spec.ts`, `.privacy-whitelist`, `.betterleaks.toml`, `.gitattributes` (patch-file whitespace) |
| **Docs** | `FORK.md`, `SECURITY.md`, `docs/fork.md`, `docs/security/` |
| **Upstream** | 25 workflow files and 9 specs that only asserted the removed workflows are deleted, not rewritten |

Everything else is upstream, unmodified.

## Branching

| Branch | Purpose |
|---|---|
| `satware/main` | default; upstream release tag + our delta |
| `sync/upstream-dsh-v<X>` | one branch per upstream release tag, merged into `satware/main` after the gates pass |
| `master` | untouched mirror of upstream `master`, reference only |

Tags: `satware-v<upstream-version>+<n>` (for example `satware-v0.2.1-rc.5+1`).
Upstream `dsh-v*` tags are kept so the base of every build is traceable.
