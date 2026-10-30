#!/usr/bin/env bash
# Weekly upstream sync helper for the satwareAG fork.
#
# Fetches upstream tags, reports the newest dsh-v* release relative to the
# current base, and - with --merge <tag> - creates the sync branch and merges
# it so the delta can be rebased/reviewed. Never pushes.
#
#   scripts/satware/sync-upstream.sh                 report only
#   scripts/satware/sync-upstream.sh --merge dsh-v0.2.2-alpha.2
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2

git remote get-url upstream >/dev/null 2>&1 || {
    printf 'sync: no upstream remote; add https://github.com/deepseek-ai/deepseek-harness\n' >&2
    exit 2
}

printf '== fetching upstream tags\n'
git fetch --quiet upstream --tags || { printf 'sync: fetch failed\n' >&2; exit 1; }

base="$(git describe --tags --abbrev=0 2>/dev/null || echo none)"
printf '== current base: %s\n' "$base"

printf '== newest upstream releases\n'
git tag --list 'dsh-v*' --sort=-v:refname | head -5 | sed 's/^/   /'

if [ "${1:-}" = "--check" ]; then
    ref="${2:-upstream/master}"
    printf '\n== trial merge of %s (nothing is committed)\n' "$ref"
    git switch -q -c "sync/check-$$" satware/main || exit 1
    if git merge --no-commit --no-ff "$ref" >/tmp/satware-sync-check.$$ 2>&1; then
        printf '   clean merge - no conflicts\n'
    else
        total="$(grep -cE '^CONFLICT' /tmp/satware-sync-check.$$ || true)"
        modify_delete="$(grep -cE '^CONFLICT \(modify/delete\)' /tmp/satware-sync-check.$$ || true)"
        printf '   %s conflict(s): %s modify/delete (take the deletion), %s content\n' \
            "$total" "$modify_delete" "$((total - modify_delete))"
        grep -E '^CONFLICT \(content\)' /tmp/satware-sync-check.$$ | sed 's/^/     /'
    fi
    rm -f /tmp/satware-sync-check.$$
    git merge --abort 2>/dev/null
    git switch -q satware/main
    git branch -D "sync/check-$$" >/dev/null 2>&1
    exit 0
fi

if [ "${1:-}" != "--merge" ]; then
    printf '\n== delta since %s\n' "$base"
    git diff --stat "$base"..HEAD -- . ':!.github' | tail -12
    printf '\nrun again with --merge <tag> to create sync/upstream-<tag>\n'
    exit 0
fi

target="${2:-}"
[ -z "$target" ] && { printf 'sync: --merge needs a tag\n' >&2; exit 2; }
git rev-parse -q --verify "refs/tags/$target" >/dev/null || { printf 'sync: unknown tag %s\n' "$target" >&2; exit 2; }

branch="sync/upstream-$target"
git switch -c "$branch" satware/main || exit 1
printf '== merging %s into %s\n' "$target" "$branch"
if ! git merge --no-edit "$target"; then
    printf '\nconflict: the delta should only touch pnpm-workspace.yaml, patches/,\n' >&2
    printf '.github/workflows/, scripts/satware/ and the fork docs. Resolve, then:\n' >&2
    printf '  pnpm install --no-frozen-lockfile && bash scripts/satware/pre-pr.sh --full\n' >&2
    exit 1
fi

printf '\n== gates\n'
pnpm install --no-frozen-lockfile >/dev/null 2>&1
bash scripts/satware/pre-pr.sh --full
