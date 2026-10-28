/**
 * Transport for the Cline gateway and its public catalogs. Transport only: no
 * pinning, retry, or failover policy lives here (see `adapter.js`).
 *
 * - `POST {baseURL}/chat/completions` — the gateway
 * - `GET  {baseURL}/models` — the gateway's own catalog
 * - `GET  {baseURL}/users/me/plan/usage-limits` — the account's quota windows
 * - `GET  {baseURL}/users/{id}/usages` — the per-request usage history behind them
 * - `GET  api.cline.bot/.../recommended-models` — official subscription list
 * - `GET  models.dev/api.json` — community registry, a backstop
 * - `GET  openrouter.ai/api/v1/...` — endpoint detail for direct-pipeline models
 *
 * @module dsh-cline-connect/cline
 */
/** The public Cline endpoint that lists subscription models without auth. */
export const RECOMMENDED_MODELS_URL = 'https://api.cline.bot/api/v1/ai/cline/recommended-models'
/** The authenticated sub-path that reports quota consumption for the account. */
export const USAGE_LIMITS_PATH = '/users/me/plan/usage-limits'
import { clineProductSurfaceHeaders } from './surface.js'

/** The authenticated sub-path naming the account the usage history belongs to. */
export const PROFILE_PATH = '/users/me'
/** The authenticated sub-path carrying the account's plan and its quota caps. */
export const PLAN_PATH = '/users/me/plan'
/**
 * How many usage rows one history page returns.
 *
 * 200 is what the gateway actually hands back: asking for more is accepted and
 * silently capped, which is how a "6 page" walk can cover far less history than
 * the arithmetic suggests.
 */
export const USAGE_PAGE_SIZE = 200
/** How many history pages one row-level walk reads before it reports partial data. */
export const USAGE_MAX_PAGES = 12
/** One day in milliseconds; the line between a window read row by row and per day. */
const DAY_MS = 86_400_000
/** How many models one window reports before the tail is summarised by count. */
export const MODEL_ROWS_MAX = 8
/**
 * The free family: models the gateway serves at no charge, gated behind the
 * product-surface header. Rotates — the published set is not stable, so the
 * list is always discovered, never hardcoded.
 */
export const FREE_MODEL_PREFIX = 'cline-free/'

/**
 * The subscription family (ClinePass). Served by this plugin too, because it
 * replaces dsh-cline-pass rather than sitting beside it.
 */
export const PASS_MODEL_PREFIX = 'cline-pass/'

/**
 * Whether one model id belongs to the free family.
 *
 * Checks the traditional `cline-free/` prefix as well as models ending with
 * `-free` or `:free`, matching the wire spellings the official gateway uses.
 *
 * @param id - a model id, in any case.
 */
export function isFreeModel(id) {
  const value = String(id ?? '').trim().toLowerCase()
  return value.startsWith(FREE_MODEL_PREFIX) || value.endsWith('-free') || value.endsWith(':free')
}

/**
 * Whether one gateway model id belongs to a family this plugin serves.
 * @param id - a model id, in any case.
 */
export function isServedModel(id) {
  const value = String(id ?? '').trim().toLowerCase()
  return value.startsWith(FREE_MODEL_PREFIX) || value.startsWith(PASS_MODEL_PREFIX) || isFreeModel(value)
}

/**
 * The local part of a served model id (everything after the family prefix).
 * @returns the local part, or the input when it carries no served prefix.
 */
export function modelLocalName(id) {
  const value = String(id ?? '')
  const cut = value.indexOf('/')
  return cut === -1 ? value : value.slice(cut + 1)
}

/** The community model registry. */
export const MODELS_DEV_URL = 'https://models.dev/api.json'
/** OpenRouter's public API, used only for direct-pipeline endpoint detail. */
export const OPENROUTER_API = 'https://openrouter.ai/api/v1'
/** The gateway base used when no account supplies its own. */
export const DEFAULT_BASE_URL = 'https://api.cline.bot/api/v1'
/**
 * The gateway's own OpenRouter-style model catalog.
 *
 * The only catalog that publishes a context window for the models this plugin
 * serves — and the only one that already knows a model the day it is added. The
 * OpenAI-shaped `/models` answers with `{ id, object, created, owned_by }` and
 * nothing else; `recommended-models` carries `{ id, name, description, tags }`.
 * This one carries `context_length`, `top_provider.max_completion_tokens` and
 * `architecture.input_modalities` per upstream model, keyed by the upstream id
 * (`deepseek/deepseek-v4.1-flash-1017`) rather than by the served one
 * (`cline-pass/deepseek-v4.1-flash-1017`), so the scan matches on the local
 * name. It needs no API key.
 */
export const CLINE_MODELS_PATH = '/ai/cline/models'

/** Combine a caller signal with a timeout signal. */
function withTimeout(signal, timeoutMs) {
  const signals = []
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs))
  if (signal !== undefined && signal !== null) signals.push(signal)
  if (signals.length === 0) return undefined
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals)
}

/** Strip a trailing slash so paths can be appended literally. */
export function trimBase(baseURL) {
  return String(baseURL ?? '').trim().replace(/\/+$/, '')
}

/**
 * The gateway's own chat-completions endpoint for one base URL.
 * @param baseURL - e.g. `https://api.cline.bot/api/v1`.
 */
export function chatURL(baseURL) {
  return `${trimBase(baseURL)}/chat/completions`
}

/**
 * Send one JSON request and decode whatever comes back.
 * @returns `{ status, ok, json, text }`; never throws for an HTTP error status.
 */
export async function sendJSON(url, { method = 'GET', apiKey = '', body, signal, timeoutMs = 60000, headers = {} } = {}) {
  const outgoing = {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(apiKey === '' ? {} : { Authorization: `Bearer ${apiKey}` }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: withTimeout(signal, timeoutMs),
  }
  const response = await fetch(url, outgoing)
  const text = await response.text()
  let json = null
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }
  return { status: response.status, ok: response.ok, json, text }
}

/**
 * Send one chat completion, non-streaming.
 * @returns `{ status, ok, json, text }` with the gateway envelope already unwrapped by the caller.
 */
export function chatCompletion(options) {
  const { baseURL, apiKey, body, signal, timeoutMs = 180000 } = options
  return sendJSON(chatURL(baseURL), {
    method: 'POST',
    apiKey,
    body,
    signal,
    timeoutMs,
    // Same product-surface claim the streaming path makes: without it every
    // `cline-free/*` model is refused with 403. This is the path behind the
    // panel's "test key" and the `cline_connect_test` tool, so leaving it bare
    // made a perfectly good key look broken as soon as a free model was first
    // in the list.
    headers: clineProductSurfaceHeaders(),
  })
}

/**
 * Open a streaming chat completion and hand back the live response.
 * @returns the raw `fetch` Response so the caller owns SSE iteration and abort.
 */
export async function openChatStream({ baseURL, apiKey, body, signal, headers = {} }) {
  return await fetch(chatURL(baseURL), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(apiKey === '' ? {} : { Authorization: `Bearer ${apiKey}` }),
      // Same product-surface claim; see chatCompletion.
      ...clineProductSurfaceHeaders(),
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Read the metadata one catalog source publishes about a model.
 *
 * Three shapes reach here, and the differences are all real:
 * - models.dev nests the window and the output cap under `limit`, and the
 *   readable modalities under `modalities.input`.
 * - The gateway's own `/ai/cline/models` is OpenRouter-shaped: a flat
 *   `context_length`, the caps under `top_provider`, and the modalities under
 *   `architecture.input_modalities`. Its `context` field is always `0` and is
 *   deliberately not read — it exists, it is a trap, and `context_length` is the
 *   number the gateway enforces.
 * - A few providers carry a flat `input`.
 *
 * Fields a source omits stay absent rather than becoming a guess: the resolver's
 * own fallbacks are the one place a missing value is interpreted.
 *
 * @returns the subset of `{ name, contextWindow, maxTokens, inputModalities }`
 *   this entry supplies.
 */
function modelMetadata(entry) {
  const meta = {}
  const name = entry?.name
  if (typeof name === 'string' && name.trim().length > 0) meta.name = name.trim()
  const modalities = entry?.modalities?.input ?? entry?.input ?? entry?.architecture?.input_modalities
  if (Array.isArray(modalities)) {
    const input = modalities.filter((value) => typeof value === 'string' && value.length > 0)
    if (input.length > 0) meta.inputModalities = input
  }
  const contextWindow = entry?.limit?.context ?? entry?.contextWindow ?? entry?.context_length ?? entry?.top_provider?.context_length
  if (Number.isSafeInteger(contextWindow) && contextWindow > 0) meta.contextWindow = contextWindow
  const maxTokens = entry?.limit?.output ?? entry?.maxTokens ?? entry?.top_provider?.max_completion_tokens
  if (Number.isSafeInteger(maxTokens) && maxTokens > 0) meta.maxTokens = maxTokens
  // Whether the model reasons. models.dev states it outright; the gateway's own
  // catalog states it as the request parameters the upstream accepts, so the
  // reasoning spellings among them are the same answer in a different shape.
  // Absent stays absent: a model nothing says this about keeps the route's
  // default rather than being declared non-reasoning.
  if (typeof entry?.reasoning === 'boolean') meta.reasoning = entry.reasoning
  else if (Array.isArray(entry?.supported_parameters) && entry.supported_parameters.length > 0) {
    meta.reasoning = entry.supported_parameters.some((value) => value === 'reasoning' || value === 'reasoning_effort' || value === 'include_reasoning')
  }
  return meta
}

/**
 * List the gateway's own catalog ids.
 * @returns the model ids; an empty array when the call fails or returns nothing.
 */
export async function fetchGatewayCatalog({ baseURL, apiKey, signal, timeoutMs = 30000 }) {
  try {
    const result = await sendJSON(`${trimBase(baseURL)}/models`, { apiKey, signal, timeoutMs })
    const ids = (result.json?.data ?? []).map((model) => model?.id).filter((id) => typeof id === 'string')
    return ids
  } catch {
    return []
  }
}

/**
 * Read the account's official quota consumption.
 *
 * The gateway answers with `{ success, data: { limits: [{ type, percentUsed,
 * resetsAt }] } }`, where `type` is `five_hour`, `weekly` or `monthly`. The
 * window list is passed through in the order the gateway sends it rather than
 * mapped onto a fixed shape here, so a window Cline adds later reaches the panel
 * as an extra row instead of needing a release of this plugin.
 *
 * A refusal is reported as data, never thrown: the panel shows quota beside
 * controls that keep working without it.
 *
 * @returns `{ ok, limits, error }`.
 */
export async function fetchUsageLimits({ baseURL, apiKey, signal, timeoutMs = 30000 }) {
  const refusal = { ok: false, limits: [], error: 'the usage endpoint is unavailable' }
  try {
    const result = await sendJSON(`${trimBase(baseURL)}${USAGE_LIMITS_PATH}`, { apiKey, signal, timeoutMs })
    const envelope = result.json
    if (!result.ok) {
      const detail = firstMessage(envelope) ?? result.text.slice(0, 120)
      return { ...refusal, error: `the usage endpoint answered HTTP ${result.status}${detail === '' ? '' : `: ${detail}`}` }
    }
    // The envelope wrapper is not contractual: read the payload whether the
    // gateway nests it under `data` or answers with the window list itself.
    const payload = envelope?.data ?? envelope
    const limits = (Array.isArray(payload?.limits) ? payload.limits : [])
      .map((limit) => ({
        type: String(limit?.type ?? ''),
        percentUsed: Number(limit?.percentUsed ?? 0),
        resetsAt: String(limit?.resetsAt ?? ''),
      }))
      .filter((limit) => limit.type.length > 0)
    return { ok: true, limits, error: firstMessage(envelope) ?? '' }
  } catch (error) {
    return { ...refusal, error: String(error?.message ?? error) }
  }
}

/**
 * Read the signed-in account's id.
 *
 * The usage endpoints are addressed by id (`/users/{id}/usages`), not by `me`,
 * so a reading has to resolve one first. `/users/me` is the only endpoint that
 * names it.
 *
 * @returns `{ ok, id, error }`.
 */
export async function fetchProfile({ baseURL, apiKey, signal, timeoutMs = 30000 }) {
  try {
    const result = await sendJSON(`${trimBase(baseURL)}${PROFILE_PATH}`, { apiKey, signal, timeoutMs })
    const envelope = result.json
    if (!result.ok) {
      const detail = firstMessage(envelope)
      return { ok: false, id: '', error: `the profile endpoint answered HTTP ${result.status}${detail === '' ? '' : `: ${detail}`}` }
    }
    const payload = envelope?.data ?? envelope
    const id = String(payload?.id ?? '')
    return id === '' ? { ok: false, id: '', error: 'the profile endpoint named no account id' } : { ok: true, id, error: '' }
  } catch (error) {
    return { ok: false, id: '', error: String(error?.message ?? error) }
  }
}

/** The gateway's own one-line explanation, when it sent one. */
function firstMessage(envelope) {
  const message = envelope?.error ?? envelope?.message ?? envelope?.error?.message
  return typeof message === 'string' ? message.slice(0, 200) : ''
}

/** A `YYYY-MM-DD` day, in UTC, as the daily endpoint expects it. */
export function dayStamp(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}


/**
 * One range of per-day usage, from the gateway's own aggregation.
 *
 * One request covers the whole range, which is the only way a complete reading
 * exists at all: the detailed history pages at 200 rows, so a busy account's
 * month cannot be walked row by row — an earlier version tried and stopped at
 * 1200 rows, reporting the same figure for "this week" and "this month".
 *
 * Rows are per day AND per model, so they sum along either axis. The model is
 * kept here rather than flattened away: which models a window's spend went to is
 * the question a quota figure cannot answer, and it is the one that decides where
 * to change behaviour.
 *
 * @returns `{ ok, rows, error }` — `rows` carries `{ date, model, modelType, tokens, costUsd }`.
 */
export async function fetchDailyUsage({ baseURL, apiKey, userId, startDate, endDate, signal, timeoutMs = 45000 }) {
  const refusal = { ok: false, rows: [], error: 'the daily usage endpoint is unavailable' }
  try {
    const query = `${trimBase(baseURL)}/users/${encodeURIComponent(userId)}/usages/daily?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
    const result = await sendJSON(query, { apiKey, signal, timeoutMs })
    const envelope = result.json
    if (!result.ok) {
      const detail = firstMessage(envelope)
      return { ...refusal, error: `the daily usage endpoint answered HTTP ${result.status}${detail === '' ? '' : `: ${detail}`}` }
    }
    const payload = envelope?.data ?? envelope
    const rows = (Array.isArray(payload?.items) ? payload.items : []).map((row) => ({
      date: String(row?.date ?? ''),
      // `aiModelName` is the wire spelling; the type name is the fallback so a
      // row still lands somewhere named rather than in an anonymous bucket.
      model: String(row?.aiModelName ?? row?.aiModelTypeName ?? ''),
      // `cline-free` / `cline-pass` / `deepseek` — the only field that reliably
      // separates the families. It has to be the discriminator because
      // `aiModelName` is inconsistent: sometimes the id
      // (`cline-free/nemotron-3.5-super-vl`), sometimes the display name
      // (`Mimo V2.6 Flash`), so prefix matching silently drops rows.
      modelType: String(row?.aiModelTypeName ?? ''),
      tokens: Number(row?.promptTokens ?? 0) + Number(row?.completionTokens ?? 0),
      costUsd: Number(row?.costUsd ?? 0),
    }))
    return { ok: true, rows, error: '' }
  } catch (error) {
    return { ...refusal, error: String(error?.message ?? error) }
  }
}


/**
 * Index the gateway's own catalog by the model's local name, keeping the
 * variants apart.
 *
 * One upstream model can be published several times — `x`, `x:free`,
 * `x:batch`, `x:thinking` — and the variants differ in window and output cap.
 * They are not interchangeable: a free model is served by the `:free` variant
 * when the gateway publishes one, a subscription model by the plain one.
 * Collapsing them into one entry would hand `cline-free/*` a paid variant's
 * numbers, which is exactly the kind of quietly wrong figure this catalog exists
 * to remove.
 *
 * @param payload - the decoded `/ai/cline/models` body.
 * @returns `Map<local name, { plain?, free?, batch?, thinking? }>`; each value is
 *   a `{ name, contextWindow, maxTokens, inputModalities }` subset.
 */
export function indexUpstreamCatalog(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
  const index = new Map()
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id.trim() : ''
    if (id === '') continue
    const cut = id.lastIndexOf('/')
    const local = cut === -1 ? id : id.slice(cut + 1)
    const parsed = /^(.*?)(?::(free|batch|thinking))?$/i.exec(local)
    const base = (parsed?.[1] ?? local).toLowerCase()
    const variant = (parsed?.[2] ?? '').toLowerCase() || 'plain'
    if (!/^[a-z0-9._-]+$/.test(base)) continue
    const meta = modelMetadata(row)
    if (Object.keys(meta).length === 0) continue
    const bucket = index.get(base) ?? {}
    // Duplicate ids have been seen; keep the wider window rather than the first
    // one, so a stale duplicate cannot understate the model.
    if (bucket[variant] === undefined || (meta.contextWindow ?? 0) > (bucket[variant].contextWindow ?? 0)) {
      bucket[variant] = meta
    }
    index.set(base, bucket)
  }
  return index
}

/**
 * Fetch the gateway's own model catalog.
 *
 * Public: the endpoint answers without a key (verified 2026-10-20), which is
 * what lets a cold start learn real windows before any account is usable.
 *
 * @returns the index from {@link indexUpstreamCatalog}, or null when the source
 *   is unavailable — a missing catalog must never fail the scan.
 */
export async function fetchUpstreamCatalog({ baseURL = DEFAULT_BASE_URL, signal, timeoutMs = 30000, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(`${trimBase(baseURL)}${CLINE_MODELS_PATH}`, { signal: withTimeout(signal, timeoutMs) })
    if (!response.ok) return null
    const index = indexUpstreamCatalog(await response.json())
    return index.size > 0 ? index : null
  } catch {
    return null
  }
}

/**
 * Collect `cline-free/*` and `cline-pass/*` ids from the official endpoints and
 * the community registry.
 *
 * Additive by design: every source that answers contributes, and a source that
 * fails is skipped rather than failing the scan.
 *
 * Metadata is carried, not just ids: a model the plugin has never heard of used
 * to be adopted as an id alone, so it resolved through the fallback to
 * `['text']` and the harness then refused every image for it — a multimodal
 * model that could be selected and chatted with but never shown a picture, and
 * with nothing said about why. `inputModalities` is what the LLM seam's
 * `LlmDiscoveredModel` accepts, so a newly published model arrives knowing what
 * it can read.
 *
 * Three sources, each publishing what the others do not: the official list
 * knows which ids exist and their labels, models.dev knows modalities, and the
 * gateway's own catalog (`/ai/cline/models`) is the only one that publishes a
 * context window — which is what decides whether the harness packs a 1M-token
 * conversation or truncates it at a guess.
 *
 * @returns `{ models, catalog, sources, free, clinePass }` — every served id,
 *   per-model metadata, the sources that answered, and the two families split
 *   out as the official endpoint published them.
 */
export async function fetchOfficialModels({ signal, timeoutMs = 30000, fetchImpl = fetch, baseURL = DEFAULT_BASE_URL } = {}) {
  const found = new Map()
  const sources = []
  const knownFree = new Set()
  const isFree = (id) => knownFree.has(id) || isFreeModel(id)
  const isServed = (id) => isServedModel(id) || knownFree.has(id)
  /** Ids the official endpoint listed under `free`, in its own order. */
  let free = []
  /** Ids the official endpoint listed under `clinePass`, in its own order. */
  let clinePass = []
  /**
   * Merge one source's metadata into a served id.
   *
   * Field by field the first source wins, which is why the sources are ordered
   * the way they are. The one exception is `name`: a source that only repeats
   * the served id (the official list does this for every model it has no label
   * for) says nothing, so a later real label replaces it.
   */
  const record = (id, incoming) => {
    const existing = found.get(id)
    if (existing === undefined) {
      found.set(id, { ...incoming })
      return
    }
    const merged = { ...incoming, ...existing }
    const label = String(existing.name ?? '').trim().toLowerCase()
    if (incoming.name !== undefined && (label === '' || label === id)) merged.name = incoming.name
    found.set(id, merged)
  }
  /** Normalize one source entry and merge it. */
  const add = (value) => {
    const id = typeof value === 'string' ? value : value?.id
    if (typeof id !== 'string') return
    const normalized = id.trim().toLowerCase()
    if (!isServed(normalized)) return
    record(normalized, typeof value === 'string' ? {} : modelMetadata(value))
  }
  try {
    const response = await fetchImpl(RECOMMENDED_MODELS_URL, { signal: withTimeout(signal, timeoutMs) })
    if (response.ok) {
      const json = await response.json()
      // Two families, read independently: a deployment that publishes only one
      // of them must not suppress the other.
      const freeList = json?.free ?? json?.data?.free
      const passList = json?.clinePass ?? json?.data?.clinePass
      if (Array.isArray(freeList) && freeList.length > 0) {
        for (const entry of freeList) {
          const rawId = typeof entry === 'string' ? entry : entry?.id
          if (typeof rawId === 'string' && rawId.trim().length > 0) {
            const normalized = rawId.trim().toLowerCase()
            knownFree.add(normalized)
            record(normalized, typeof entry === 'string' ? {} : modelMetadata(entry))
          }
        }
        free = freeList.map((entry) => String(entry?.id ?? '').trim().toLowerCase()).filter(isServed)
        sources.push('cline.api.free')
      }
      if (Array.isArray(passList) && passList.length > 0) {
        passList.forEach(add)
        clinePass = passList.map((entry) => String(entry?.id ?? '').trim().toLowerCase()).filter(isServed)
        sources.push('cline.api.clinepass')
      }
    }
  } catch { /* source unavailable */ }
  try {
    const response = await fetchImpl(MODELS_DEV_URL, { signal: withTimeout(signal, timeoutMs) })
    if (response.ok) {
      const json = await response.json()
      const provider = json?.providers?.['cline-pass'] ?? json?.['cline-pass']
      if (provider?.models !== undefined && provider.models !== null) {
        for (const [id, entry] of Object.entries(provider.models)) {
          add({ ...(entry ?? {}), id: id.startsWith('cline-pass/') ? id : `cline-pass/${id}` })
        }
        sources.push('models.dev')
      }
      // Also look up metadata from matching upstream providers in models.dev
      for (const id of [...found.keys()]) {
        const cut = id.indexOf('/')
        if (cut === -1) continue
        const rawProvider = id.slice(0, cut).toLowerCase()
        const providerName = rawProvider === 'cline-free' || rawProvider === 'cline-pass' ? '' : rawProvider
        if (providerName === '') continue
        const providerData = json?.providers?.[providerName] ?? json?.[providerName]
        if (providerData?.models) {
          const local = modelLocalName(id).toLowerCase()
          const baseLocal = local.replace(/-(?:free|pass)$/i, '').replace(/:(?:free|pass)$/i, '')
          for (const [mId, entry] of Object.entries(providerData.models)) {
            const entryLocal = (mId.includes('/') ? mId.slice(mId.indexOf('/') + 1) : mId).toLowerCase()
            if (entryLocal === local || entryLocal === baseLocal || entryLocal.startsWith(baseLocal + '-')) {
              record(id, modelMetadata(entry))
              break
            }
          }
        }
      }
    }
  } catch { /* source unavailable */ }
  // The gateway's own catalog, last because it fills gaps rather than deciding
  // membership: it is keyed by the upstream id, so it can only describe a model
  // the two lists above already named.
  try {
    const upstream = await fetchUpstreamCatalog({ baseURL, signal, timeoutMs, fetchImpl })
    if (upstream !== null) {
      let described = 0
      for (const id of [...found.keys()]) {
        const local = modelLocalName(id).toLowerCase()
        const baseLocal = local.replace(/-(?:free|pass)$/i, '').replace(/:(?:free|pass)$/i, '')
        const bucket = upstream.get(local) ?? upstream.get(baseLocal) ?? [...upstream.entries()].find(([k]) => k.startsWith(baseLocal + '-'))?.[1]
        if (bucket === undefined) continue
        // A free model is served by the `:free` variant when the gateway
        // publishes one — the same upstream model's paid variant usually has a
        // wider window and a different output cap, so picking the wrong one is
        // silently wrong. Subscription models are the plain variant.
        const meta = isFree(id)
          ? (bucket.free ?? bucket.plain)
          : (bucket.plain ?? bucket.free)
        if (meta === undefined) continue
        record(id, meta)
        described += 1
      }
      if (described > 0) sources.push('cline.api.models')
    }
  } catch { /* source unavailable */ }
  const models = [...found.keys()].filter((id) => isServed(id) && /^[a-z0-9._-]+$/.test(modelLocalName(id)))
  const catalog = {}
  for (const id of models) {
    const meta = found.get(id)
    if (meta !== undefined && Object.keys(meta).length > 0) catalog[id] = meta
  }
  return { models, catalog, sources, free, clinePass }
}

/**
 * Resolve a canonical slug against OpenRouter's public catalog, tolerating the
 * hyphen differences between the gateway's slug and OpenRouter's id.
 * @returns the real OpenRouter id, or null.
 */
export async function resolveOpenRouterSlug(slug, { signal, timeoutMs = 30000 } = {}) {
  try {
    const result = await sendJSON(`${OPENROUTER_API}/models`, { signal, timeoutMs })
    const ids = (result.json?.data ?? []).map((model) => model?.id).filter((id) => typeof id === 'string')
    const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
    return ids.find((id) => id === slug) ?? ids.find((id) => normalize(id) === normalize(slug)) ?? null
  } catch {
    return null
  }
}

/**
 * Per-upstream endpoint detail (context length, recent uptime) for one
 * OpenRouter model. Only meaningful for direct-pipeline models.
 * @returns `{ slug, endpoints }`, where endpoints is `[{ slug, name, endpoints, context, uptime }]`.
 */
export async function openRouterEndpoints(slug, { signal, timeoutMs = 30000 } = {}) {
  const real = await resolveOpenRouterSlug(slug, { signal, timeoutMs })
  if (real === null) return { slug, endpoints: [] }
  try {
    const result = await sendJSON(`${OPENROUTER_API}/models/${real}/endpoints`, { signal, timeoutMs })
    const detail = new Map()
    for (const entry of result.json?.data?.endpoints ?? []) {
      const providerSlug = String(entry?.tag ?? '').split('/')[0] || String(entry?.provider_name ?? '').toLowerCase().replace(/\s+/g, '-')
      if (providerSlug === '') continue
      const current = detail.get(providerSlug) ?? { slug: providerSlug, name: String(entry?.provider_name ?? providerSlug), endpoints: 0, context: 0, uptime: 0 }
      current.endpoints += 1
      current.context = Math.max(current.context, Number(entry?.context_length ?? 0))
      current.uptime = Math.max(current.uptime, Math.round(Number(entry?.uptime_last_30m ?? 0)))
      detail.set(providerSlug, current)
    }
    return { slug: real, endpoints: [...detail.values()] }
  } catch {
    return { slug: real, endpoints: [] }
  }
}
