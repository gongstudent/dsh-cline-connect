/**
 * Plugin release freshness: what is installed here, what this profile locked, and
 * what the published repository carries now.
 *
 * The question exists because of how the plugin is installed. A `github:`
 * dependency is resolved to one commit and pinned by the profile's pnpm lockfile,
 * so installing any other plugin re-resolves the tree from that lock and puts the
 * pinned commit back — including over a newer release. Nothing in the harness
 * answers "am I behind?", which leaves the user to discover it by noticing a
 * capability that stopped working. This module answers it from outside the
 * installation: the version in the installed package, the commit the lockfile
 * names, and the commit and version the repository publishes now.
 *
 * Everything fails soft. A blocked GitHub API, an offline machine or an unusual
 * layout leaves the panel with what it can still prove — the installed version,
 * the locked commit, the exact update command — plus the error string. No caller
 * of this module has to handle a rejection.
 *
 * @module dsh-cline-connect/updates
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The published repository this plugin comes from. */
export const UPDATE_REPO = 'gongstudent/dsh-cline-connect'
/** The package name pnpm and the lockfile know it by. */
export const UPDATE_PACKAGE = 'dsh-cline-connect'
/** How long one upstream reading is reused before the next ask. */
export const UPDATE_CHECK_TTL_MS = 10 * 60 * 1000
/** How long a failed reading is reused — long enough to stop a retry loop, short enough to recover. */
export const UPDATE_FAILURE_TTL_MS = 60 * 1000
const GITHUB_API = 'https://api.github.com'
const RAW_HOST = 'https://raw.githubusercontent.com'

/** A timeout signal, or undefined on a runtime without AbortSignal.timeout. */
function timeoutSignal(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  try {
    return AbortSignal.timeout(ms)
  } catch {
    return undefined
  }
}

/** The first line of a commit message, for a one-line label. */
function firstLine(text) {
  const value = String(text ?? '').trim()
  const cut = value.indexOf('\n')
  return (cut === -1 ? value : value.slice(0, cut)).slice(0, 120)
}

/**
 * The numeric parts of a version string.
 * `0.2.0-beta.1` → `[0, 2, 0]`; an unparsable string → `[]`.
 */
export function versionParts(text) {
  const match = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(text ?? ''))
  if (match === null) return []
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/**
 * Compare two versions by their numeric parts.
 * @returns 1 when `left` is newer, -1 when older, 0 when equal or unparsable.
 */
export function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (a.length === 0 || b.length === 0) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

/** The version in one `package.json` text, or an empty string. */
export function packageVersion(text) {
  try {
    return String(JSON.parse(String(text ?? '')).version ?? '').trim()
  } catch {
    return ''
  }
}

/**
 * The commit this profile's lockfile pinned the plugin to.
 *
 * pnpm records a git dependency as a tarball URL, so the commit is the last path
 * segment of the locked version (`…/dsh-cline-connect/tar.gz/<sha>`). The search
 * is anchored on this package's own key: a lockfile carries several git
 * dependencies, and reading the wrong one would report someone else's commit.
 *
 * @returns the commit, or an empty string when the entry is absent (a `link:`
 *   install has none, which is itself worth showing).
 */
export function lockedCommit(lockText, packageName = UPDATE_PACKAGE) {
  const text = String(lockText ?? '')
  const anchor = `${packageName}:`
  const index = text.indexOf(anchor)
  if (index === -1) return ''
  const block = text.slice(index, index + 800)
  const match = /tar\.gz\/([0-9a-f]{7,40})\b/i.exec(block)
  return match === null ? '' : match[1].toLowerCase()
}

/**
 * Ask GitHub what the published repository carries now.
 *
 * Two requests: the head commit, then the `package.json` at that commit — the
 * version has to come from the commit itself, or a cached CDN copy of `main`
 * could report a version that does not belong to the sha beside it.
 *
 * @throws when either request is unusable; {@link UpdateChecker} turns that into
 *   a reading the panel can show.
 */
export async function fetchUpstreamRelease({ fetchImpl = fetch, timeoutMs = 8000, repo = UPDATE_REPO } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('no fetch implementation is available')
  const headers = { accept: 'application/vnd.github+json', 'user-agent': `${UPDATE_PACKAGE}-update-check` }
  const commitResponse = await fetchImpl(`${GITHUB_API}/repos/${repo}/commits/main`, { headers, signal: timeoutSignal(timeoutMs) })
  if (!commitResponse.ok) throw new Error(`GitHub answered HTTP ${commitResponse.status} for the head commit`)
  const commit = await commitResponse.json()
  const sha = String(commit?.sha ?? '').trim()
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('GitHub answered without a usable commit sha')
  const manifestResponse = await fetchImpl(`${RAW_HOST}/${repo}/${sha}/package.json`, {
    headers: { 'user-agent': headers['user-agent'] },
    signal: timeoutSignal(timeoutMs),
  })
  if (!manifestResponse.ok) throw new Error(`the published package.json answered HTTP ${manifestResponse.status}`)
  return {
    version: packageVersion(await manifestResponse.text()),
    commit: sha.toLowerCase(),
    date: String(commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? ''),
    message: firstLine(commit?.commit?.message),
  }
}

/** Quote one argument for a shell that accepts double quotes. */
function quote(value) {
  return `"${String(value).replace(/"/g, '\"')}"`
}

/**
 * The exact command that upgrades this profile's copy.
 *
 * The system `pnpm` is not necessarily the one that installed the profile: pnpm
 * majors use different content-addressable stores, and a store mismatch refuses
 * the operation outright (`ERR_PNPM_UNEXPECTED_STORE`) with no useful way to
 * continue. So the bundled runtime is preferred when it exists — that is
 * guaranteed to be the version the profile was installed with.
 */
export function updateCommand({ profileDir = '', appRoot = '' } = {}) {
  const dir = profileDir === '' ? '<profile directory>' : profileDir
  const runtime = appRoot === '' ? '' : join(appRoot, 'runtime', 'primary-runtime', 'dependencies')
  const candidates = runtime === ''
    ? []
    : [
      { node: join(runtime, 'node', 'bin', 'node.exe'), pnpm: join(runtime, 'pnpm', 'dist', 'pnpm.mjs') },
      { node: join(runtime, 'node', 'bin', 'node'), pnpm: join(runtime, 'pnpm', 'dist', 'pnpm.mjs') },
    ]
  for (const candidate of candidates) {
    if (existsSync(candidate.node) && existsSync(candidate.pnpm)) {
      return `&${quote(candidate.node)} ${quote(candidate.pnpm)} --dir ${quote(dir)} update ${UPDATE_PACKAGE}`
    }
  }
  return `pnpm --dir ${quote(dir)} update ${UPDATE_PACKAGE}`
}

/** Read a text file, or an empty string when it is not there. */
function readTextOrEmpty(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * One reading of "is this plugin behind the published repository".
 *
 * The cache is per instance and per process: the panel asks on mount, and the TTL
 * keeps a page that reopens from hitting GitHub again. `force` is the button.
 */
export class UpdateChecker {
  constructor({ installedVersion = '', profileDir = '', appRoot = '', fetchImpl = fetch, ttlMs = UPDATE_CHECK_TTL_MS, logger } = {}) {
    this.installedVersion = installedVersion
    this.profileDir = profileDir
    this.appRoot = appRoot
    this.fetchImpl = fetchImpl
    this.ttlMs = ttlMs
    this.logger = logger
    this.cached = null
    this.pending = null
  }

  /** The last reading, without touching the network. */
  peek() {
    return this.cached
  }

  /**
   * Read (or reuse) one freshness reading.
   * @returns a plain object; never rejects.
   */
  async check({ force = false } = {}) {
    const now = Date.now()
    if (force !== true && this.cached !== null && now < this.cached.expiresAt) return this.cached
    if (this.pending !== null) return await this.pending
    this.pending = this.read().finally(() => {
      this.pending = null
    })
    return await this.pending
  }

  /** One upstream reading turned into the shape the panel renders. */
  async read() {
    const checkedAt = Date.now()
    const locked = lockedCommit(readTextOrEmpty(join(this.profileDir, 'pnpm-lock.yaml')))
    const base = {
      checkedAt,
      installedVersion: this.installedVersion,
      lockedCommit: locked,
      command: updateCommand({ profileDir: this.profileDir, appRoot: this.appRoot }),
    }
    try {
      const upstream = await fetchUpstreamRelease({ fetchImpl: this.fetchImpl })
      const byVersion = compareVersions(upstream.version, this.installedVersion) > 0
      // A commit-only difference means the release was published without a version
      // bump, or the lockfile predates it: either way the profile is not running
      // the published code, and that is the same answer to the user.
      const byCommit = locked !== '' && upstream.commit !== '' && !upstream.commit.startsWith(locked)
      const value = {
        ok: true,
        ...base,
        upstream,
        updateAvailable: byVersion || byCommit,
        reason: byVersion ? 'version' : byCommit ? 'commit' : '',
        expiresAt: checkedAt + (Number.isFinite(this.ttlMs) && this.ttlMs > 0 ? this.ttlMs : UPDATE_CHECK_TTL_MS),
      }
      this.cached = value
      return value
    } catch (error) {
      const value = {
        ok: false,
        ...base,
        upstream: null,
        updateAvailable: false,
        reason: '',
        error: String(error?.message ?? error),
        expiresAt: checkedAt + Math.min(UPDATE_FAILURE_TTL_MS, Number.isFinite(this.ttlMs) && this.ttlMs > 0 ? this.ttlMs : UPDATE_CHECK_TTL_MS),
      }
      this.cached = value
      this.logger?.warn?.('[cline-connect] update check failed: %s', value.error)
      return value
    }
  }
}
