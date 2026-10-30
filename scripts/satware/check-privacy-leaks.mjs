#!/usr/bin/env node
/**
 * Privacy gate for the public satwareAG/deepseek-harness fork.
 *
 * Two tiers, because the fork starts from a repository that is already public:
 *
 *   HARD   - satware-internal identifiers (hostnames, staff addresses, our
 *            operator home paths). Upstream never contains these, so they are
 *            scanned in every tracked file and always fail.
 *   DELTA  - generic shapes (any absolute home path, RFC1918 addresses). The
 *            upstream tree is full of them in test fixtures and docs, so they
 *            are only checked in files this fork added or changed relative to
 *            the upstream merge base. Without a resolvable upstream ref the
 *            DELTA tier is skipped and reported as such.
 *
 * Usage: node scripts/satware/check-privacy-leaks.mjs [--json]
 * Exit:  0 clean | 1 findings
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const HARD_RULES = [
  { id: 'internal-host', re: /\b(?:git|mattermost|wiki|wiki-internal|jira|confluence)\.satware\.(?:ai|com)\b/, hint: 'satware-internal hostname' },
  { id: 'staff-email', re: /\b[A-Za-z0-9._%+-]+@(?:satware\.com|satware\.ai)\b/, hint: 'satware staff address (use the security contact)' },
  { id: 'operator-home', re: /\/(?:home|Users)\/(?:mw|ja|des|mwegener)\//, hint: 'satware operator home directory' },
]

const DELTA_RULES = [
  { id: 'home-path', re: /\/home\/[A-Za-z0-9._-]+\//, hint: 'absolute home directory path' },
  { id: 'mac-home-path', re: /\/Users\/[A-Za-z0-9._-]+\//, hint: 'absolute macOS home directory path' },
  { id: 'private-ip', re: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, hint: 'RFC1918 address' },
]

const TEXT_EXTENSIONS = /\.(?:md|txt|ts|tsx|js|mjs|cjs|json|jsonl|ya?ml|sh|py|toml|cfg|ini|patch|spec|swift|css|html)$/
const MAX_BYTES = 1_000_000

function git (args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function loadWhitelist () {
  try {
    return readFileSync('.privacy-whitelist', 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
      .map(line => {
        const match = /^path:(.*)$/.exec(line)
        return match ? { path: new RegExp(match[1]) } : { line: new RegExp(line) }
      })
  } catch {
    return []
  }
}

function isWhitelisted (file, line) {
  return whitelist.some(entry => (entry.path ? entry.path.test(file) : entry.line.test(line)))
}

const whitelist = loadWhitelist()
const json = process.argv.includes('--json')

let deltaBase = ''
try {
  deltaBase = git(['merge-base', 'HEAD', 'upstream/master'])
} catch {
  deltaBase = ''
}

let changed = null
if (deltaBase !== '') {
  const tracked = git(['diff', '--name-only', deltaBase, 'HEAD']).split('\n').filter(Boolean)
  const worktree = git(['status', '--porcelain']).split('\n')
    .map(line => line.slice(3).trim())
    .filter(Boolean)
  changed = new Set([...tracked, ...worktree])
}

const files = git(['ls-files', '-z']).split('\0').filter(Boolean)
const findings = []
let scanned = 0

for (const file of files) {
  if (!TEXT_EXTENSIONS.test(file)) continue
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (content.length > MAX_BYTES) continue
  scanned++

  const inDelta = changed === null ? false : changed.has(file)
  const rules = inDelta ? [...HARD_RULES, ...DELTA_RULES] : HARD_RULES

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isWhitelisted(file, line)) continue
    for (const rule of rules) {
      if (rule.re.test(line)) {
        findings.push({ file, line: i + 1, rule: rule.id, hint: rule.hint, text: line.trim().slice(0, 160) })
        break
      }
    }
  }
}

const deltaStatus = changed === null ? 'skipped (no upstream/master ref)' : `${changed.size} changed file(s) vs upstream`

if (json) {
  process.stdout.write(JSON.stringify({ ok: findings.length === 0, scanned, delta: deltaStatus, findings }, null, 2) + '\n')
} else if (findings.length === 0) {
  console.log(`privacy gate: clean (${scanned} text files scanned; delta: ${deltaStatus})`)
} else {
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.rule} (${f.hint}) -> ${f.text}`)
  console.error(`privacy gate: ${findings.length} finding(s); delta: ${deltaStatus}`)
}
process.exit(findings.length === 0 ? 0 : 1)
