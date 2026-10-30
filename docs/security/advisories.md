# Advisory remediation record

Baseline: `dsh-v0.2.1-rc.5`, scanned 2026-10-30 with `pnpm audit` against the
upstream lockfile. **72 advisories** (1 critical, 29 high, 36 moderate,
6 low) across 24 packages. After the overrides below: **0 advisories**, with
one package patched locally and its two GitHub advisories suppressed.

Method: every entry is an exact pin, not a range, so a later install cannot
silently jump a major. Selector-scoped keys (`undici@^6`) keep the three
majors in the tree on their own fix line. Everything below is reproducible
with `pnpm install --frozen-lockfile && pnpm audit`.

## Overrides

| Package | Worst | Advisory range | Installed before | Override |
|---|---|---|---|---|
| `dompurify` | critical | `>=3.4.4 <=3.4.16` | 3.4.16 | `3.4.17` |
| `body-parser` | high | `>=2.0.0 <2.4.0` | 2.3.0 | `2.4.0` |
| `electron` | high | `>=44.0.0-alpha.1 <44.9.1` | 44.7.0 | `44.9.1` |
| `follow-redirects` | high | `>=1.16.0 <1.16.1` | 1.16.0 | `1.16.1` |
| `happy-dom` | high | `>=17.0.0 <=21.0.3` | 20.11.6 | `21.0.4` |
| `node-forge` | high | `<=1.4.0` | 1.4.0 | `1.4.1` |
| `zod` | high | `<4.6.6` | 4.4.3 | `4.6.6` |
| `undici` | high | `>=4 <6.29.1`, `>=6 <7.30.1`, `>=7 <8.12.2` | 6.28.1 / 7.29.1 / 8.11.2 | `undici@^6` → 6.29.1, `undici@^7` → 7.30.1, `undici@^8` → 8.12.2 |
| `@modelcontextprotocol/sdk` | high | `<1.32.0` | 1.31.0 | `1.32.0` |
| `@modelcontextprotocol/node` | high | `>=2.0.0 <2.1.0` | 2.0.0 | `2.1.0` |
| `@modelcontextprotocol/server` | high | `>=2.0.0 <2.3.0` | 2.2.0 | `2.3.0` |
| `@modelcontextprotocol/client` | moderate | `>=2.0.0 <2.3.0` | 2.2.0 | `2.3.0` |
| `vite` | high | `<=6.4.3`, `>=8.2.0 <=8.2.3` | 5.4.21 / 6.4.3 / 8.2.2 | `vite@^5` and `vite@^6` → 6.4.5, `vite@^8` → 8.2.4 |
| `fast-uri` | moderate | `>=3.0.0 <3.1.9` | 3.1.8 | `3.1.9` |
| `fflate` | moderate | `>=0.8.0 <0.8.3` | 0.8.2 | `0.8.3` |
| `hono` | moderate | `>=4.12.4 <4.13.11` | 4.13.7 | `4.13.11` |
| `@hono/node-server` | moderate | `>=1.19.10 <2.1.3` | 1.19.17 | `2.1.3` |
| `ip-address` | moderate | `<=10.7.3` | 10.7.1 | `10.7.4` |
| `qs` | moderate | `>=6.7.0 <=6.16.0` | 6.16.0 | `6.16.1` |
| `uuid` | moderate | `<11.1.1` | 11.1.0 | `11.1.1` |
| `@vitest/mocker` | moderate | `<4.1.12` | 4.1.11 | `4.1.12` |
| `esbuild` | moderate | `<=0.24.2` | 0.21.5 | `esbuild@<=0.24.2` → 0.25.12 |
| `katex` | low | `>=0.11.0 <0.18.2` | 0.16.47 | `katex@<0.18.2` → 0.18.7 |

## Locally patched: `extract-zip@2.0.1`

`extract-zip` 2.0.1 is the last release and both advisories have no fixed
version:

| Advisory | Title |
|---|---|
| GHSA-jmr9-qjv8-65gv | unvalidated symlink path traversal |
| GHSA-7pqw-9j4j-h8q3 | arbitrary file writes through symlink archive entries |

`patches/extract-zip@2.0.1.patch` adds two checks in `extractEntry`:

1. a symlink entry's **target** must resolve inside the extraction root
   (absolute targets and `..` escapes are rejected);
2. the **destination** itself must resolve inside the root, independent of the
   caller's directory-level check.

`auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` carries exactly these two
IDs. The suppression is only valid while the patch applies, and
`scripts/extract-zip-symlink-guard.spec.ts` proves it: with the patch reverted,
the two symlink-escape cases fail; with it applied, all four pass. Revert the
suppression when an upstream release exists.

## Verified

```
$ pnpm install --frozen-lockfile && pnpm audit
All found vulnerabilities were already reviewed and decided to be ignored
2 ignored: 2 high

$ pnpm audit --json | jq '.advisories | length'
0

$ npx vitest run scripts/extract-zip-symlink-guard.spec.ts
Tests  4 passed (4)
```

## Deliberate non-goals

- **Major jumps were avoided where a same-major fix existed.** `happy-dom`
  (20 → 21), `@hono/node-server` (1 → 2) and `vite` (5/6 → 6.4.5) are the only
  cross-major moves; each is a build/test-time dependency and each was verified
  by running the affected build (`pnpm run build:web`).
- **Upstream's own patches were left untouched.** `patches/*.patch` for
  `@yao-pkg/pkg`, `node-pty`, `lexical`, `exceljs`, `@fortune-sheet/*`,
  `app-builder-lib` and the mdast/micromark pair are not affected by any
  override in this table; the binary build (`build-exe-for-python-sdk.ts`)
  runs to completion with them applied.
- **No advisory was suppressed for convenience.** The only suppression is the
  patched `extract-zip`, which cannot be fixed by version pinning.
