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

## Known flaky tests

The suite is upstream's and is not fully deterministic on hosted runners. Two
integration tests flake at roughly 1 run in 3, both timing-sensitive and both
unrelated to the fork delta:

| Test | Symptom |
|---|---|
| `packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts` | PTY output exceeds the terminal scrollback budget, so the first line of a response is dropped |
| `packages/experimental/tool-ralph/tests/integration.spec.ts` ("reports the failed round and last good handoff when a child fails") | real-spawn + sandboxed PTC stack race |
| `packages/test-support/client-runtime/tests/assembly-vitest.client.spec.ts` | counts assembled test clients and sees 3 instead of 2 on the runner; passes locally after a full build, so it depends on build state rather than on the fork delta |

`ci.yml` runs `vitest run --retry=1` for that reason: a single retry separates
flake from regression, and a real failure fails twice. Do not add these to a
skip list - they exercise the persistent-shell and sandbox paths that matter.

Because roughly one run in two ends red on a *different* test each time, the
suite is a separate **advisory** job: `ci.yml` blocks on the deterministic
gate (install, typecheck, lint, build, the fork's own specs) and reports the
full suite without blocking. Upstream never ran this suite in its own public
CI, so there is no upstream baseline to compare against; a red advisory run
needs a human look at which test failed, not a blocked merge.

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

## Protection

`satware/main` is protected by a repository-level ruleset (the GitHub Rules
API, managed via API/UI, not a file in the repo). Two more rulesets cover
`master` and the sync branches.

| Ruleset | Target | Rules |
|---|---|---|
| `satware-main` | `refs/heads/satware/main` | no force pushes; no deletion; required status checks (CI `Gate (typecheck, lint, build, fork specs)` plus the four Security jobs `Dependency advisories`, `Secret scan (betterleaks)`, `Workflow audit (zizmor)`, `Privacy gate`) with the strict up-to-date policy; 0 required reviews; no bypass actors |
| `master-mirror` | `refs/heads/master` | no force pushes; no deletion; both bypassable by organization admins (restoring the mirror may require it) |
| `sync-branches` | `refs/heads/sync/*` | no force pushes |

Consequences: `satware/main` is **PR-only**. Required status checks apply on
every ref update, so a direct push of a new commit is rejected and the checks
must pass on the PR head instead (this is why the sync procedure opens a PR).
The advisory `Full suite (advisory)` job is deliberately not required: it is
`continue-on-error` and would never block. `satware-main` has no bypass
actors, so even a repo admin cannot force-push or delete the default branch.

Negative test (2026-10-30, scratch branch `rs-test` under a scratch ruleset,
run as an admin to prove the hard-block semantics):

| Attempt | Result |
|---|---|
| force-push a rewritten commit | rejected: `GH013 ... Cannot force-push to this branch` |
| delete the branch | rejected: `push declined due to repository rule violations` |
| merge a PR whose checks are missing | rejected: `5 of 5 required status checks are expected` |

Inspect: `gh api /repos/satwareAG/deepseek-harness/rulesets`.

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
git commit -am "sync: upstream dsh-v<X>"
git push origin sync/upstream-dsh-v<X>
gh pr create --base satware/main --head sync/upstream-dsh-v<X>
# the satware-main ruleset requires the five status checks on every ref
# update of the default branch, so the sync lands as a PR: wait for the
# gate and security jobs to turn green on the PR head, then
gh pr merge   # merge commit; this gh has no --ff-only flag
git tag satware-v<X>+<n> && git push origin --tags
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

Every `satware-v*` tag runs `.github/workflows/release-cli.yml`, which does
build → telemetry egress proof → checksums → Sigstore attestation → upload →
release attachment. All steps are required; the release object is created only
after the artifact is attested.

| Tag | Commit | Run | Result |
|---|---|---|---|
| `satware-v0.2.1-rc.5+1` | `28631c1` | `41013478407` | success (first attested build) |
| `satware-v0.2.1-rc.5+2` | `3f1277d` | `41062891187` | success; current head, CI gate + Security green on the same commit |

A release tag may lag `satware/main` by docs-only commits; the tag always names
the exact commit whose bytes were built and signed, which is what
`gh attestation verify` reports back.

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
`gh attestation verify`. This holds for `satware-v*` tags as well: they are
release triggers and attestation sources, and a redo re-tags under a new
`+<n>` instead of overwriting. Rulesets cannot protect tags; this is a
human rule.
