import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import extractZip from 'extract-zip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Regression guard for the satware extract-zip patch (patches/extract-zip@2.0.1.patch).
//
// extract-zip 2.0.1 is the last upstream release and carries two open advisories
// with no fixed version (GHSA-jmr9-qjv8-65gv unvalidated symlink path traversal,
// GHSA-7pqw-9j4j-h8q3 arbitrary file writes through symlink archive entries).
// `auditConfig.ignoreGhsas` in pnpm-workspace.yaml suppresses them because the
// patch below rejects the escape. This spec is the canary: if the patch stops
// applying, these tests fail and the suppression is no longer justified.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32 (buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    // The table is fully populated; `?? 0` only satisfies noUncheckedIndexedAccess.
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface Entry {
  name: string
  data: string
  /** Unix mode; 0o120777 = symlink, 0o100644 = regular file. */
  mode: number
}

/** Minimal stored (uncompressed) ZIP writer - no dependency, exact bytes. */
function buildZip (entries: Entry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30 + name.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    data.copy(local, 30 + name.length)
    locals.push(local)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x0314, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(entry.mode << 16 >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, ...centrals, eocd])
}

let work: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'dsh-extract-zip-guard-'))
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function extract (entries: Entry[]): Promise<string> {
  const zipPath = join(work, 'archive.zip')
  const outDir = join(work, 'out')
  await writeFile(zipPath, buildZip(entries))
  await extractZip(zipPath, { dir: outDir })
  return outDir
}

describe('extract-zip symlink guard (satware patch)', () => {
  it('rejects a symlink entry whose target escapes the extraction root', async () => {
    await expect(extract([{ name: 'escape', data: '../../outside.txt', mode: 0o120777 }]))
      .rejects.toThrow(/Out of bound symlink target/)
  })

  it('rejects a symlink entry with an absolute target', async () => {
    await expect(extract([{ name: 'absolute', data: '/etc/passwd', mode: 0o120777 }]))
      .rejects.toThrow(/Out of bound symlink target/)
  })

  it('rejects a file entry whose name escapes the extraction root', async () => {
    // yauzl rejects `..` segments itself ("invalid relative path"); the patched
    // destination check is the second line of defence behind it.
    await expect(extract([{ name: '../escaped.txt', data: 'payload', mode: 0o100644 }]))
      .rejects.toThrow(/invalid relative path|Out of bound path/)
  })

  it('still extracts an in-root symlink and its target', async () => {
    const outDir = await extract([
      { name: 'target.txt', data: 'hello', mode: 0o100644 },
      { name: 'ok-link', data: 'target.txt', mode: 0o120777 },
    ])
    expect(await readFile(join(outDir, 'target.txt'), 'utf8')).toBe('hello')
    const link = join(outDir, 'ok-link')
    expect(await readFile(link, 'utf8')).toBe('hello')
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
  })
})
