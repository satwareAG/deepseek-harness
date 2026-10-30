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
to five touch points so a weekly upstream rebase stays cheap:

| Touch point | What lives there |
|---|---|
| `pnpm-workspace.yaml` | `overrides` for the advisory set, `auditConfig.ignoreGhsas` for the one package we patch locally |
| `patches/extract-zip@2.0.1.patch` | symlink-escape fix (no upstream release exists) |
| `.github/workflows/` | three owned workflows: `ci.yml`, `security.yml`, `release-cli.yml` |
| `scripts/satware/`, `scripts/extract-zip-symlink-guard.spec.ts`, `.privacy-whitelist` | privacy gate, release preflight, patch regression test |
| `FORK.md`, `SECURITY.md`, `docs/fork.md`, `docs/security/` | this notice, disclosure policy, maintenance contract, advisory record |

Everything else is upstream, unmodified.

## Branching

| Branch | Purpose |
|---|---|
| `satware/main` | default; upstream release tag + our delta |
| `sync/upstream-dsh-v<X>` | one branch per upstream release tag, merged into `satware/main` after the gates pass |
| `master` | untouched mirror of upstream `master`, reference only |

Tags: `satware-v<upstream-version>+<n>` (for example `satware-v0.2.1-rc.5+1`).
Upstream `dsh-v*` tags are kept so the base of every build is traceable.
