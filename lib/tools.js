/**
 * The model-facing `cline_connect_*` management tools.
 *
 * They read and write the same settings section the provider runs from, so a
 * change made here takes effect on the very next model call.
 *
 * @module dsh-cline-connect/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { modelLocalName } from './cline.js'
import { BUILD_TAG, normalizePinMode } from './protocol.js'

/** One model-facing text block. */
function text(value) {
  return [{ type: 'text', text: value }]
}

/** Collapse a value into one display line. */
function firstLine(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Human label for one upstream availability verdict. */
const STATUS_LABEL = {
  ok: 'available',
  limited: 'rate-limited',
  bad: 'not-pinnable',
  auth: 'auth-failed',
  // A channel that answered while a different one served the request. It is its
  // own verdict precisely because "available" used to be claimed for it.
  'not-adopted': 'not-adopted',
  unknown: 'unknown',
}

const statusLabel = (status) => STATUS_LABEL[status] ?? String(status ?? 'unknown')

const ACCOUNT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    apiKeyEnv: { type: 'string', required: true },
    enabled: { type: 'boolean', required: true },
    keyConfigured: { type: 'boolean', required: true },
    keyHint: { type: 'string', required: true },
  },
}

const TRACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    upstream: { type: 'string', required: true },
    status: { type: 'integer', required: true },
    ms: { type: 'integer', required: true },
    note: { type: 'string', required: true },
  },
}

const UPSTREAM_STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    upstream: { type: 'string', required: true },
    status: { type: 'string', required: true },
    ms: { type: 'integer', required: true },
    note: { type: 'string', required: true },
    checkedAt: { type: 'integer', required: true },
  },
}

const MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    pipeline: { type: 'string', required: true },
    pinnable: { type: 'boolean', required: true },
    hidden: { type: 'boolean', required: true },
    pinMode: { type: 'string', required: true },
    sort: { type: 'string', required: true },
    pinned: { type: 'array', required: true, items: { type: 'string' } },
    excluded: { type: 'array', required: true, items: { type: 'string' } },
    upstreams: { type: 'array', required: true, items: { type: 'string' } },
    upstreamStatus: { type: 'array', required: true, items: UPSTREAM_STATUS_SCHEMA },
    lastProvider: { type: 'string', required: true },
    lastMs: { type: 'integer', required: true },
    probedAt: { type: 'integer', required: true },
    validatedAt: { type: 'integer', required: true },
  },
}

/** Project one model from the live configuration plus what the store observed. */
function projectModel(model, pin, meta, hidden = false) {
  const upstreamStatus = Object.entries(meta?.upstreamStatus ?? {}).map(([upstream, verdict]) => ({
    upstream: String(upstream),
    status: String(verdict?.status ?? 'unknown'),
    ms: Number(verdict?.ms ?? 0),
    note: firstLine(verdict?.note, 160),
    checkedAt: Number(verdict?.checkedAt ?? 0),
  }))
  return {
    id: String(model),
    displayName: modelLocalName(model),
    pipeline: String(meta?.pipeline ?? ''),
    pinnable: meta?.pinnable === true,
    hidden: hidden === true,
    // The executed mode, not a second opinion about it: `buildAttempts` reads
    // the same normalizer, so what this shows is what a request will do.
    pinMode: normalizePinMode(pin?.pinMode),
    sort: String(pin?.sort ?? ''),
    pinned: Array.isArray(pin?.upstreams) ? pin.upstreams.map(String) : [],
    excluded: Array.isArray(pin?.exclude) ? pin.exclude.map(String) : [],
    upstreams: Array.isArray(meta?.upstreams) ? meta.upstreams.map(String) : [],
    upstreamStatus,
    lastProvider: String(meta?.lastProvider ?? ''),
    lastMs: Number(meta?.lastMs ?? 0),
    probedAt: Number(meta?.probedAt ?? 0),
    validatedAt: Number(meta?.validatedAt ?? 0),
  }
}

/**
 * Register every `cline_connect_*` tool.
 *
 * @param ctx - host plugin context (must own `tools`).
 * @param control - the plugin's configuration surface.
 * @param engine - the Cline Connect engine.
 * @param store - the observation store.
 */
export function registerTools(ctx, { control, engine, store }) {
  const readConfig = () => control.readConfig()
  const pinOf = (model) => readConfig().perModel?.[model] ?? {}

  // ── cline_connect_status ─────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'cline_connect_status',
    description: 'Report the Cline Connect provider state: route, accounts and whether each key is stored, account mode, model and pin counts. Read-only and free. Check this first when a Cline Connect model fails.',
    parameters: {},
    isConcurrencySafe: () => true,
    timeoutMs: 30000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string', required: true },
          displayName: { type: 'string', required: true },
          baseURL: { type: 'string', required: true },
          routeRegistered: { type: 'boolean', required: true },
          settingsAvailable: { type: 'boolean', required: true },
          accountMode: { type: 'string', required: true },
          activeAccount: { type: 'string', required: true },
          accounts: { type: 'array', required: true, items: ACCOUNT_SCHEMA },
          knownModels: { type: 'integer', required: true },
          pinnedModels: { type: 'integer', required: true },
          probedModels: { type: 'integer', required: true },
          build: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        const rows = value.accounts.map((account) => `  ${account.key}${account.enabled ? '' : ' (disabled)'} key=${account.keyConfigured ? account.keyHint : 'NOT SET'} ref=${account.apiKeyEnv}`)
        return text([
          `${value.displayName} provider "${value.provider}" @ ${value.baseURL}`,
          `route registered=${value.routeRegistered} settings=${value.settingsAvailable ? 'available' : 'UNAVAILABLE (configuration cannot persist)'} build=${value.build}`,
          `accountMode=${value.accountMode} active=${value.activeAccount || '(first enabled)'}`,
          `accounts (${value.accounts.length}):`,
          ...rows,
          `models: known=${value.knownModels} pinned=${value.pinnedModels} probed=${value.probedModels}`,
        ].join('\n'))
      },
    },
    async execute() {
      const config = readConfig()
      const accounts = await control.accountsWithKeys()
      return {
        provider: control.providerName,
        displayName: control.displayName,
        baseURL: config.baseURL,
        routeRegistered: control.routeRegistered(),
        settingsAvailable: control.settingsAvailable(),
        accountMode: config.accountMode === 'roundrobin' ? 'roundrobin' : 'single',
        activeAccount: String(config.activeAccount ?? ''),
        accounts,
        knownModels: (config.knownModels ?? []).length,
        pinnedModels: Object.values(config.perModel ?? {}).filter((pin) => Array.isArray(pin?.upstreams) && pin.upstreams.length > 0).length,
        probedModels: store.allMeta().filter((meta) => meta.pipeline !== undefined && meta.pipeline !== null).length,
        build: BUILD_TAG,
      }
    },
  }))

  // ── cline_connect_models ─────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'cline_connect_models',
    description: 'List the Cline Connect models with their pipeline, discovered channels, per-channel verdicts, visibility and stored pin. Pass `model` to filter by substring, `refresh: true` to rescan the official model list, `model` + `visible` to show/hide one model in every picker, or `mode` to show/hide them all at once. Free unless `refresh` is set.',
    parameters: {
      model: { type: 'string', description: 'Only return models whose id contains this text, e.g. "glm-5.2".' },
      refresh: { type: 'boolean', description: 'Rescan the official model list first and adopt new ids.' },
      visible: { type: 'boolean', description: 'With `model` (an exact id): true offers it in the model pickers again, false hides it from them. Hiding never removes it from the subscription list.' },
      mode: { type: 'string', description: 'Bulk visibility: "all" shows every subscription model, "none" hides every one, "invert" swaps the two. One write, so the set can never half-apply.' },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 60000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          models: { type: 'array', required: true, items: MODEL_SCHEMA },
          catalogCount: { type: 'integer', required: true },
          catalogSources: { type: 'array', required: true, items: { type: 'string' } },
          catalogFetchedAt: { type: 'integer', required: true },
          added: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => {
        const blocks = value.models.map((model) => {
          const lines = [
            `${model.id}  pipeline=${model.pipeline || 'unknown'}${model.pinnable ? '' : ' (not pinnable)'}${model.hidden ? ' (hidden from pickers)' : ''}`,
            `  pinned=${model.pinned.length === 0 ? '(auto)' : model.pinned.join(' > ')} mode=${model.pinMode}${model.sort === '' ? '' : ` sort=${model.sort}`}${model.excluded.length === 0 ? '' : ` excluded=${model.excluded.join(',')}`}`,
          ]
          if (model.upstreams.length > 0) {
            const verdicts = new Map(model.upstreamStatus.map((entry) => [entry.upstream, entry.status]))
            lines.push(`  upstreams: ${model.upstreams.map((upstream) => `${upstream}[${statusLabel(verdicts.get(upstream) ?? 'unknown')}]`).join(' ')}`)
          } else {
            lines.push('  upstreams: (none observed yet)')
          }
          if (model.lastProvider !== '') lines.push(`  last=${model.lastProvider} (${model.lastMs}ms)`)
          return lines.join('\n')
        })
        const head = `${value.models.length} Cline Connect model(s); official catalog=${value.catalogCount}${value.catalogSources.length === 0 ? '' : ` via ${value.catalogSources.join(',')}`}`
        const added = value.added.length === 0 ? [] : [`newly adopted: ${value.added.join(', ')}`]
        return text([head, ...added, ...blocks].join('\n\n'))
      },
    },
    async execute(args) {
      const config = readConfig()
      let added = []
      let catalog = store.catalog()
      if (args.refresh === true) {
        const scan = await control.refreshCatalog()
        added = scan.added
        catalog = store.catalog()
      }
      const hidden = new Set((config.hiddenModels ?? []).map(String))
      // `visible` and `mode` are the writes this tool makes: they edit only which
      // models the route advertises, never the subscription list itself.
      if (typeof args.mode === 'string' && args.mode !== '') {
        const known = (config.knownModels ?? []).map(String)
        const next = known.filter((id) => {
          const wasHidden = hidden.has(id)
          return args.mode === 'all' ? false : args.mode === 'none' ? true : !wasHidden
        })
        hidden.clear()
        for (const id of next) hidden.add(id)
        await control.updateConfig({ hiddenModels: next })
      } else if (typeof args.visible === 'boolean') {
        const target = String(args.model ?? '').trim()
        if (!(config.knownModels ?? []).map(String).includes(target)) {
          throw new Error(`${JSON.stringify(target)} is not one of this route's subscription models`)
        }
        if (args.visible) hidden.delete(target)
        else hidden.add(target)
        await control.updateConfig({ hiddenModels: [...hidden] })
      }
      const needle = String(args.model ?? '').trim().toLowerCase()
      const models = (config.knownModels ?? [])
        .filter((id) => needle === '' || String(id).toLowerCase().includes(needle))
        .map((id) => projectModel(id, pinOf(id), store.metaOf(id), hidden.has(String(id))))
      return {
        models,
        catalogCount: catalog.ids?.length ?? 0,
        catalogSources: (catalog.sources ?? []).map(String),
        catalogFetchedAt: Number(catalog.fetchedAt ?? 0),
        added,
      }
    },
  }))

  // ── cline_connect_test ───────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'cline_connect_test',
    description: 'Send one small real request and report which upstream served it, with the failover trace. `upstreams` and `exclude` override the routing for this call only; omit both to use the route as configured. Nothing is persisted.',
    parameters: {
      model: { type: 'string', required: true, description: 'Model id, e.g. "cline-pass/glm-5.2".' },
      upstreams: { type: 'array', items: { type: 'string' }, description: 'Ordered upstream candidates for this call only.' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Upstream channels to exclude for this call only.' },
    },
    timeoutMs: 600000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          model: { type: 'string', required: true },
          error: { type: 'string', required: true },
          ms: { type: 'integer', required: true },
          targets: { type: 'array', required: true, items: { type: 'string' } },
          excluded: { type: 'array', required: true, items: { type: 'string' } },
          actual: { type: 'string', required: true },
          actualName: { type: 'string', required: true },
          pipeline: { type: 'string', required: true },
          pinnable: { type: 'boolean', required: true },
          canonicalSlug: { type: 'string', required: true },
          account: { type: 'string', required: true },
          content: { type: 'string', required: true },
          adopted: { type: 'boolean', required: true },
          adherence: { type: 'string', required: true },
          plan: { type: 'string', required: true },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
          trace: { type: 'array', required: true, items: TRACE_SCHEMA },
        },
      },
      render: (_args, value) => {
        const trace = value.trace.map((entry) => `  ${entry.upstream} -> HTTP ${entry.status} in ${entry.ms}ms${entry.note === '' ? '' : ` — ${entry.note}`}`)
        const head = value.ok
          ? `test ${value.model}: ok in ${value.ms}ms via ${value.actual || value.actualName || '(unknown)'}`
          : `test ${value.model}: FAILED — ${value.error}`
        // A 200 from the wrong channel is the finding. It must never be left for
        // the reader to spot by comparing `pinned` with `actual`.
        const adherenceNote = value.ok
          ? value.adherence === 'fallback'
            ? `⚠ the gateway fell back to ${value.actual || '(unknown)'}`
            : value.adherence === 'unresolved' && value.targets.length > 0
              // Only worth saying when a pin was actually asked for: under
              // automatic routing there is nothing to confirm, and claiming
              // otherwise reads as a failure that did not happen.
              ? '⚠ the response did not name the serving channel, so the pin could not be confirmed'
              : ''
          : value.actual === '' ? '' : `actual: served by ${value.actual}`
        return text([
          head,
          adherenceNote,
          ...value.warnings.map((warning) => `⚠ ${warning}`),
          value.targets.length === 0 ? '' : `pinned: ${value.targets.join(' > ')}`,
          value.excluded.length === 0 ? '' : `excluded: ${value.excluded.join(', ')}`,
          value.ok ? `pipeline=${value.pipeline} canonicalSlug=${value.canonicalSlug || '-'} account=${value.account || '-'}` : '',
          value.plan === '' ? '' : `router: ${value.plan}`,
          trace.length === 0 ? '' : `attempts (${trace.length}):`,
          ...trace,
          value.content === '' ? '' : `reply: ${value.content}`,
        ].filter((line) => line !== '').join('\n'))
      },
    },
    async execute(args, exec) {
      const model = String(args.model).trim()
      const result = await engine.test(model, {
        upstreams: Array.isArray(args.upstreams) ? args.upstreams.map(String) : undefined,
        exclude: Array.isArray(args.exclude) ? args.exclude.map(String) : undefined,
        signal: exec.signal,
      })
      return {
        ok: result.ok === true,
        model,
        error: firstLine(result.error, 400),
        ms: Number(result.ms ?? 0),
        targets: (result.targets ?? []).map(String),
        excluded: (result.excluded ?? []).map(String),
        actual: String(result.actual ?? ''),
        actualName: String(result.actualName ?? ''),
        pipeline: String(result.pipeline ?? ''),
        pinnable: result.pinnable === true,
        canonicalSlug: String(result.canonicalSlug ?? ''),
        account: String(result.account ?? ''),
        content: String(result.content ?? ''),
        adopted: result.adopted === true,
        adherence: String(result.adherence ?? ''),
        plan: firstLine(result.plan, 300),
        warnings: (result.warnings ?? []).map(String),
        trace: (result.trace ?? []).map((entry) => ({
          upstream: String(entry.upstream ?? '(auto)'),
          status: Number(entry.status ?? 0),
          ms: Number(entry.ms ?? 0),
          note: firstLine(entry.note, 160),
        })),
      }
    },
  }))

  // ── cline_connect_history ────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'cline_connect_history',
    description: 'Read the in-process request history (newest first): account, upstream that served each call, latency, error. Read-only and free. In memory only, so it starts empty after a restart.',
    parameters: {
      limit: { type: 'integer', description: 'How many rows to return (default 25, max 100).' },
      model: { type: 'string', description: 'Only return rows whose model id contains this text.' },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 30000,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ts: { type: 'integer', required: true },
                model: { type: 'string', required: true },
                provider: { type: 'string', required: true },
                canonical: { type: 'string', required: true },
                account: { type: 'string', required: true },
                ms: { type: 'integer', required: true },
                ttfb: { type: 'integer', required: true },
                ttft: { type: 'integer', required: true },
                stream: { type: 'boolean', required: true },
                effort: { type: 'string', required: true },
                // `usageReported` says whether the gateway sent a usage frame;
                // the counts below are zero when it did not, so the flag is what
                // separates "cost nothing" from "not reported".
                usageReported: { type: 'boolean', required: true },
                usage: {
                  type: 'object',
                  required: true,
                  additionalProperties: false,
                  properties: {
                    inputTokens: { type: 'integer', required: true },
                    outputTokens: { type: 'integer', required: true },
                    cacheReadTokens: { type: 'integer', required: true },
                    reasoningTokens: { type: 'integer', required: true },
                  },
                },
                error: { type: 'string', required: true },
                attempts: { type: 'array', required: true, items: { type: 'string' } },
                adherence: { type: 'string', required: true },
                warnings: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        if (value.entries.length === 0) return text('No Cline Connect model calls recorded yet in this process.')
        return text([
          `last ${value.entries.length} of ${value.total} call(s):`,
          ...value.entries.map((entry) => {
            const when = entry.ts === 0 ? '-' : new Date(entry.ts).toISOString()
            const attempts = entry.attempts.length === 0 ? '' : ` attempts=${entry.attempts.join('>')}`
            const error = entry.error === '' ? '' : ` error=${entry.error}`
            const adherence = entry.adherence === '' ? '' : ` adherence=${entry.adherence}`
            const warnings = entry.warnings.length === 0 ? '' : ` warnings=${entry.warnings.length}`
            // First chunk then total, the same pair the panel shows; a dash marks
            // a request that never produced content. The first-byte moment stays in
            // the structured output for anyone comparing gateways, but it is not
            // displayed: on the gateways measured so far it lands within a
            // millisecond of the first chunk and would only read as a duplicate.
            const stamp = (value) => (value > 0 ? `${value}ms` : '—')
            const latency = `${stamp(entry.ttft)}/${entry.ms}ms`
            // Tokens and the rate the answer came out at, when the gateway sent a
            // usage frame; the rate is measured after the first chunk, so it
            // describes streaming rather than the wait before it.
            const tokens = entry.usage === null
              ? ''
              : ` in=${entry.usage.inputTokens} out=${entry.usage.outputTokens}${entry.usage.cacheReadTokens > 0 ? ` cache=${entry.usage.cacheReadTokens}` : ''}${entry.usage.reasoningTokens > 0 ? ` think=${entry.usage.reasoningTokens}` : ''}`
            const elapsedAfterFirst = entry.ms - entry.ttft
            const rate = entry.usageReported !== true || entry.usage.outputTokens === 0 || entry.ttft === 0 || elapsedAfterFirst <= 0
              ? ''
              : ` ${(entry.usage.outputTokens / (elapsedAfterFirst / 1000)).toFixed(1)}t/s`
            const effort = entry.effort === '' ? '' : ` effort=${entry.effort}`
            return `${when} ${entry.model} -> ${entry.provider || '(auto)'}${entry.canonical === '' ? '' : ` [${entry.canonical}]`} ${latency}${rate}${entry.stream ? ' stream' : ''}${effort} account=${entry.account || '-'}${tokens}${attempts}${adherence}${warnings}${error}`
          }),
        ].join('\n'))
      },
    },
    async execute(args) {
      const limit = Number.isSafeInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 100) : 25
      const entries = store.readHistory(limit, args.model ?? '')
      return {
        total: store.historySize(),
        entries: entries.map((entry) => ({
          ts: Number(entry.ts ?? 0),
          model: String(entry.model ?? ''),
          provider: String(entry.provider ?? ''),
          canonical: String(entry.canonical ?? ''),
          account: String(entry.account ?? ''),
          ms: Number(entry.ms ?? 0),
          ttfb: Number(entry.ttfb ?? 0),
          ttft: Number(entry.ttft ?? 0),
          stream: entry.stream === true,
          effort: String(entry.effort ?? ''),
          usageReported: entry.usage !== null && entry.usage !== undefined,
          usage: {
            inputTokens: Number(entry.usage?.inputTokens ?? 0),
            outputTokens: Number(entry.usage?.outputTokens ?? 0),
            cacheReadTokens: Number(entry.usage?.cacheReadTokens ?? 0),
            reasoningTokens: Number(entry.usage?.reasoningTokens ?? 0),
          },
          error: firstLine(entry.error, 200),
          attempts: Array.isArray(entry.attempts) ? entry.attempts.map((item) => String(item ?? '')) : [],
          adherence: String(entry.adherence ?? ''),
          warnings: Array.isArray(entry.warnings) ? entry.warnings.map((item) => firstLine(item, 200)) : [],
        })),
      }
    },
  }))
}
