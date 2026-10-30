# Fork maintenance contract

Everything a maintainer needs to rebase this fork onto a new upstream release.
Read [FORK.md](../FORK.md) first for what the fork is and why it exists.

## Upstream model (why this fork owns its own CI)

`deepseek-ai/deepseek-harness` is published from a private pipeline:

- pull requests are disabled (`GET /repos/deepseek-ai/deepseek-harness/pulls` → 404),
  so there is no contribution path and no fork-network benefit;
- the public CI is effectively dormant: `ci.yml` ran once, on launch day, and
  failed; repo-wide there are ~58 workflow runs, mostly Dependabot;
- releases are cut from private CI (`dsh-v*` tags, 36 of them, published daily);
- the merge-policy workflows referenced `deepseek-harness/deepseek-harness-check@master`,
  a private repository in a different organisation. GitHub only shares private
  actions inside the owning organisation, so that reference could never resolve
  in `satwareAG/deepseek-harness` — it was removed with the rest of the
  upstream workflow set.

Consequence: this fork inherits no working CI, no PR review, and no release
tooling. All three are ours.

## Workflow disposition

All 25 upstream workflows were removed at `satware-v0.2.1-rc.5+1`; three owned
workflows replace them.

| Removed | Why |
|---|---|
| `pr-check-*`, `weighted-approval*`, `issue-*` | Depend on the private cross-org action, GitHub App keys and repo variables we do not have |
| `release*`, `python-release`, `publish-ssh-helper`, `node-addon-system-release` | Publish to the `@deepseek-ai` npm scope and the public PyPI project — this fork must never publish there |
| `macos-*`, `windows-package`, `desktop-publish`, `cua-helper-package` | Desktop packaging lanes; the deliverable is a CLI binary |
| `e2e`, `pi-ai-provider-e2e` | Require `DEEPSEEK_API_KEY_EXTERNAL` / `ANTHROPIC_API_KEY_EXTERNAL` / `AZURE_OPENAI_API_KEY_EXTERNAL` and send traffic to external providers |
| `docs-pages`, `build-preview-cloudflare` | Cloudflare deploy tokens; this fork publishes no site |
| `ci.yml`, `ci-master.yml`, `ci-python.yml`, `ci-windows.yml`, `sandbox`, `expected-filenames` | Replaced by the owned `ci.yml` |

Tests that only asserted the shape of the removed workflows were deleted with
them: `scripts/ci-workflow.spec.ts`, `scripts/ci-compatible-selfhosted.spec.ts`,
`scripts/tests/ci-master-platforms.spec.ts`, `scripts/windows-package-workflow.spec.ts`,
`scripts/macos-package-workflow.spec.ts`, `scripts/desktop-publish-workflow.spec.ts`,
`scripts/preview-workflow.spec.ts`, `apps/desktop/tests/desktop-publish-route.spec.ts`,
`apps/desktop/tests/desktop-package-selection.spec.ts`.

## Rebase cost (measured, not asserted)

`scripts/satware/sync-upstream.sh --check <ref>` performs a throwaway merge and
reports the conflict surface. Measured 2026-10-30 against `upstream/master`
(2508 commits and 7975 files ahead of the `dsh-v0.2.1-rc.5` base):

```
$ scripts/satware/sync-upstream.sh --check upstream/master
26 conflict(s): 19 modify/delete (take the deletion), 7 content
  CONFLICT (content): .github/workflows/ci.yml
  CONFLICT (content): THIRD_PARTY_NOTICES.md
  CONFLICT (content): apps/desktop/scripts/runtime-patch-policy.ts
  CONFLICT (content): apps/desktop/tests/prepare-runtime-patches.spec.ts
  CONFLICT (content): pnpm-lock.yaml
  CONFLICT (content): pnpm-workspace.yaml
  CONFLICT (content): scripts/client-build-environment.client.spec.ts
```

That is the whole weekly cost: 19 deletions to re-assert and 7 content
resolutions, every one of them inside the five areas above. No conflict ever
lands in upstream product code, which is what keeps the rebase cheap.

## Sync procedure (weekly, or on a security trigger)

Base choice note: upstream marks every release `prerelease: true`, so GitHub
exposes no "latest" release (`/releases/latest` is 404). The base is therefore
the newest release **by publish date**, `dsh-v0.2.1-rc.5` (2026-10-30), not the
semver-higher `dsh-v0.2.2-alpha.2` (2026-10-28). Re-check both signals before
every sync: a newer publish date wins over a higher prerelease number.

```bash
git fetch upstream --tags
git tag --list 'dsh-v*' --sort=-v:refname | head -5   # newest upstream release
git switch -c sync/upstream-dsh-v<X> satware/main
git merge upstream/dsh-v<X>
# resolve: the delta below is the only expected conflict surface
pnpm install --no-frozen-lockfile
pnpm audit --audit-level high          # must stay clean
pnpm test                              # at minimum scripts/extract-zip-symlink-guard.spec.ts
node scripts/satware/check-privacy-leaks.mjs
git switch satware/main && git merge --ff-only sync/upstream-dsh-v<X>
git tag satware-v<X>+<n> && git push origin satware/main --tags
```

A security-triggered sync (new advisory against a pinned dependency) follows
the same path but merges `upstream/master` instead of a tag, and only carries
the advisory fix.

## The delta (five areas)

1. **Dependency layer** — `pnpm-workspace.yaml` (`overrides`,
   `auditConfig.ignoreGhsas`, `patchedDependencies`) and
   `patches/extract-zip@2.0.1.patch`. Upstream also keeps overrides and patches
   there, so conflicts are line-level and expected.
2. **CI layer** — `.github/workflows/` (ours replace theirs wholesale). Upstream
   edits to deleted workflow files surface as modify/delete conflicts: take the
   deletion.
3. **Gate layer** — `scripts/satware/` (`check-privacy-leaks.mjs`,
   `betterleaks-canary.sh`, `check-telemetry-egress.sh`, `sync-upstream.sh`,
   `pre-pr.sh`), `scripts/extract-zip-symlink-guard.spec.ts`,
   `.privacy-whitelist`, `.betterleaks.toml`, and the `.gitattributes`
   patch-file whitespace exemption. New paths, no upstream counterpart.
4. **Docs layer** — `FORK.md`, `SECURITY.md`, `docs/fork.md`, `docs/security/`.
   New paths.
5. **Removals** — 25 upstream workflows and 9 specs that only asserted their
   shape. Not rewritten, deleted: re-adding them would re-introduce the
   unresolvable cross-org action and the publish/E2E lanes.

## Advisory remediation

Every override is listed with its advisory range and rationale in
[security/advisories.md](security/advisories.md). When a new upstream release
lands, re-run `pnpm audit` before merging: an override that upstream has since
fixed should be removed rather than carried.

## Verification evidence

Every gate in this fork has a negative control, so a green run means the gate
can fail:

| Gate | Control | Result |
|---|---|---|
| `pnpm audit` | 72 advisories on the untouched lock | 0 after the overrides |
| extract-zip patch | patch reverted in `node_modules`, spec re-run | 2 of 4 cases fail (the two escape cases) |
| privacy gate | planted a tracked file containing an operator home path | 1 finding, exit 1; clean after removal |
| betterleaks allowlist | `scripts/satware/betterleaks-canary.sh` plants a runtime-generated credential outside the allowlisted paths | reported; the canary script itself is not |
| telemetry egress | listener sanity request before the count resets; endpoint string must exist in the binary | 0 requests from a boot with `DSH_TELEMETRY_DISABLED=1` |

## Telemetry

`dsh` ships an OTLP/HTTP exporter (`packages/host/product-telemetry-otel`,
endpoint `dsh-otel-collector.deepseeksvc.com`) plus a Desktop analytics
consumer. Two independent facts keep it off for us:

1. **Design.** The only session-export mode is `FEEDBACK_ONLY`: a Session-log
   prefix is released only after explicit user feedback. `DSH_TELEMETRY_MODE`
   has exactly two values (`FEEDBACK_ONLY`, `DISABLED`) - there is no
   "always export" mode.
2. **Runtime proof.** `scripts/satware/check-telemetry-egress.sh` boots the
   built binary with `DSH_TELEMETRY_DISABLED=1` against a local OTLP listener
   and requires zero requests. It is not vacuous: the script first asserts the
   production endpoint string is compiled into the binary, then sanity-checks
   the listener with a direct request before resetting the counter.

Every workflow sets `DSH_TELEMETRY_DISABLED=1`, and the release lane runs the
egress proof before it attests the artifact.

## Release verification

First release: `satware-v0.2.1-rc.5+1` at commit `28631c1`, built, gated and
signed by `.github/workflows/release-cli.yml` (run `41013478407`). The job ran
build → telemetry egress proof → checksums → attestation → upload → release
attachment, all green.

```
$ gh release download satware-v0.2.1-rc.5+1 -R satwareAG/deepseek-harness
$ sha256sum -c SHA256SUMS
./deepseek-harness-sdk-runtime-linux-x64-rg: OK
./deepseek-harness-sdk-runtime-linux-x64: OK

$ gh attestation verify deepseek-harness-sdk-runtime-linux-x64 -R satwareAG/deepseek-harness
commit=28631c1 ref=refs/tags/satware-v0.2.1-rc.5+1 run=41013478407
issuer: https://token.actions.githubusercontent.com
san:    https://github.com/satwareAG/deepseek-harness/.github/workflows/release-cli.yml@refs/tags/satware-v0.2.1-rc.5+1
tlog:   rekor.sigstore.dev (public transparency log)

$ ./deepseek-harness-sdk-runtime-linux-x64 --version
0.2.1-rc.5
```

The attested subject set is `SHA256SUMS` plus both executables, and the
provenance predicate is SLSA v1 (`https://slsa.dev/provenance/v1`) with
`sourceRepositoryVisibilityAtSigning: public` - so the artifact is verifiable
by anyone, not only inside the org.

## Versioning

`satware-v<upstream-version>+<n>`, where `<n>` increments per fork release on
the same upstream base (for example `satware-v0.2.1-rc.5+1`). Upstream `dsh-v*`
tags are never moved or deleted; they are the provenance anchor for
`gh attestation verify`.
