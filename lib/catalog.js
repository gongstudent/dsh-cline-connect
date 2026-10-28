/**
 * Published model metadata, plus the merge that turns a caller's overrides into
 * the exact descriptor the LLM seam validates.
 *
 * Context window and output cap are provider facts, not preferences: the
 * harness sizes its prompt budget against `context.contextWindow`, so an
 * understated window silently truncates history.
 *
 * Four sources answer, and which one wins depends on the field:
 * 1. a configured per-model override — the user's word is final, for every field;
 * 2. the last catalog scan, which reads the gateway's own `/ai/cline/models`
 *    (`context_length`, `top_provider.max_completion_tokens`,
 *    `architecture.input_modalities`, `supported_parameters`) — it outranks the
 *    table for the window, the output ceiling and the accepted modalities,
 *    because the gateway republishes those for every model it adds and the table
 *    is a snapshot of the release date;
 * 3. this shipped table, for the models that existed at release time — it owns
 *    the label and the measured `reasoning` capability, and it fills any field
 *    the scan did not publish;
 * 4. {@link siblingCatalogEntry}, which recognizes a date-stamped snapshot
 *    (`deepseek-v4.1-flash-1017`) as a member of a family already in the table;
 * 5. the route-wide fallback, for a model nothing describes.
 *
 * The effect is that a model added after this release — or an existing model
 * whose upstream window or upload types changed — is described by its current
 * numbers without a plugin release.
 *
 * The reasoning vocabulary is gateway-wide rather than per model: anything
 * outside `none|minimal|low|medium|high|xhigh|max` is rejected with HTTP 400,
 * so `off` is deliberately absent.
 *
 * @module dsh-cline-connect/catalog
 */
/** Selectable reasoning efforts offered for a reasoning-capable model. */
export const REASONING_EFFORTS = [
  { id: 'none', name: 'None', description: 'No extra thinking; fastest and cheapest.' },
  { id: 'minimal', name: 'Minimal', description: 'A bare minimum of reasoning.' },
  { id: 'low', name: 'Low', description: 'Prefer for routine or latency-sensitive work.' },
  { id: 'medium', name: 'Medium', description: 'A balanced amount of reasoning.' },
  { id: 'high', name: 'High', description: 'More thorough reasoning for multi-step work.' },
  { id: 'xhigh', name: 'Extra high', description: 'For difficult work that rewards more thinking.' },
  { id: 'max', name: 'Max', description: 'Reserve for the hardest quality-first tasks.' },
]

/**
 * Published metadata for the shipped free (`cline-free/*`) models.
 *
 * Measured on 2026-10-19 against the live gateway, because at release time
 * **nothing upstream published these facts**: the official `recommended-models`
 * payload carries only `{ id, name, description, tags }`, and models.dev has no
 * `cline-free` provider at all (only `cline-pass`). Without a table here every
 * free model would resolve to the `['text']` fallback and the harness would
 * refuse its images with no explanation — the exact silent failure the pass table
 * exists to prevent.
 *
 * Since 2026-10-20 the gateway's own catalog (`GET /ai/cline/models`) does
 * publish a window, a cap and the modalities per upstream model, and the scan
 * feeds it in below this table. The table therefore is what a cold start and an
 * offline route have, and the curated `:free`-variant numbers, not the only
 * source.
 *
 * Evidence per row:
 * - `input`: measured by posting a 1x1 base64 PNG. `nemotron-3.5-super-vl`,
 *   `mimo-v2.6-flash` and `muse-spark-1.3-contributor` answered 200;
 *   `solar-mini4` answered 500 "No endpoints found that support image input"
 *   (note: 500, not 4xx — the gateway wraps upstream 404s).
 * - `reasoning`: measured — `message.reasoning` came back populated.
 * - `contextWindow`: `solar-mini4` is measured (524288, quoted by the gateway's
 *   own context-overflow error). The other three are **inferred** from the
 *   upstream model the gateway routes to and its models.dev entry.
 * - `maxTokens`: **not measured for any free model.** These are models.dev
 *   output ceilings for the routed upstream; treat them as ceilings, not facts.
 */
export const FREE_MODEL_CATALOG = {
  'reflection/beam-free': {
    name: 'Beam',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text'],
  },
  'cline-free/nemotron-3.5-super-vl': {
    name: 'Nemotron 3.5 Super VL',
    // The `:free` variant's own window: the gateway's catalog reads 1000000 for
    // nvidia/nemotron-3.5-super-vl:free against 1048576 for the paid model this
    // route does not serve (2026-10-20).
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'nvidia/nemotron-3.5-lightning-free': {
    name: 'Nemotron 3.5 Lightning',
    contextWindow: 1000000,
    maxTokens: 65536,
    reasoning: true,
    input: ['text'],
  },
  'poolside/laguna-s-2.1-free': {
    name: 'Laguna S 2.1',
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ['text'],
  },
  'cline-free/mimo-v2.6-flash': {
    name: 'MiMo V2.6 Flash',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-free/muse-spark-1.3-contributor': {
    name: 'Muse Spark 1.3 Contributor',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-free/solar-mini4': {
    name: 'Solar Mini 4',
    contextWindow: 524288,
    maxTokens: 131072,
    reasoning: true,
    // Measured text-only: sending it an image is a hard 500 upstream.
    input: ['text'],
  },
}

/**
 * Published metadata for the shipped `cline-pass/*` models — Cline's own
 * ClinePass subscription family, not this plugin's brand.
 *
 * `name` mirrors the provider's own display name where it publishes one, and
 * falls back to the model id when the catalog has no separate label.
 */
export const MODEL_CATALOG = {
  'cline-pass/deepseek-v4.1-flash': {
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1000000,
    maxTokens: 384000,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/mimo-v2.6-flash': {
    name: 'MiMo V2.6 Flash',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/mimo-v2.6-pro': {
    name: 'MiMo V2.6 Pro',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/muse-spark-1.3-contributor': {
    name: 'Muse Spark 1.3 Contributor',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/kimi-k3.1-pro': {
    name: 'Kimi K3.1 Pro',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/minimax-m3.1-flash': {
    name: 'MiniMax M3.1 Flash',
    contextWindow: 1048576,
    maxTokens: 512000,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    contextWindow: 1000000,
    maxTokens: 384000,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    contextWindow: 1000000,
    maxTokens: 384000,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/glm-5.3': {
    name: 'GLM-5.3',
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/glm-5.3-flash': {
    name: 'GLM-5.3 Flash',
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/glm-5.2': {
    name: 'GLM-5.2',
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/kimi-k3': {
    name: 'Kimi K3',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/kimi-k2.7-code': {
    name: 'Kimi K2.7 Code',
    contextWindow: 262144,
    maxTokens: 262144,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/kimi-k2.6': {
    name: 'Kimi K2.6',
    contextWindow: 262144,
    maxTokens: 262144,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/minimax-m3': {
    name: 'MiniMax-M3',
    contextWindow: 1048576,
    maxTokens: 512000,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/qwen3.8-max': {
    name: 'Qwen3.8 Max',
    contextWindow: 1000000,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/qwen3.7-max': {
    name: 'Qwen3.7 Max',
    contextWindow: 1000000,
    maxTokens: 65536,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/qwen3.7-plus': {
    name: 'Qwen3.7 Plus',
    contextWindow: 1000000,
    maxTokens: 64000,
    reasoning: true,
    input: ['text', 'image'],
  },
  'cline-pass/mimo-v2.5-pro': {
    name: 'MiMo-V2.5-Pro',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text'],
  },
  'cline-pass/mimo-v2.5': {
    name: 'MiMo-V2.5',
    contextWindow: 1048576,
    maxTokens: 131072,
    reasoning: true,
    input: ['text', 'image', 'audio'],
  },
}

/** Published entry for one model id, or undefined when the catalog lacks it. */
export function catalogEntry(model) {
  return MODEL_CATALOG[model] ?? FREE_MODEL_CATALOG[model]
}

/**
 * Metadata inherited from the family a date-stamped snapshot belongs to.
 *
 * The gateway adds snapshots as new ids (`cline-pass/deepseek-v4.1-flash-1017`
 * beside `cline-pass/deepseek-v4.1-flash`) and the table only knows the family.
 * Recognizing the trailing date keeps a brand-new snapshot from falling all the
 * way back to the route-wide guess, which used to mean a 1M model was advertised
 * with 128k of context the day it appeared.
 *
 * The name is deliberately not inherited: "DeepSeek V4.1 Flash" on the 1017
 * snapshot would hide which snapshot the picker is offering. Only a date-shaped
 * suffix qualifies — `kimi-k2.7-code` is a different model, not a snapshot of
 * `kimi-k2.7`.
 *
 * @returns the inherited fields (without `name`), or undefined.
 */
export function siblingCatalogEntry(model) {
  const cut = model.lastIndexOf('-')
  if (cut === -1) return undefined
  const suffix = model.slice(cut + 1)
  // `-1017` (month/day) and `-20261017` are both real snapshot spellings.
  if (!/^\d{4}$/.test(suffix) && !/^\d{8}$/.test(suffix)) return undefined
  const entry = catalogEntry(model.slice(0, cut))
  if (entry === undefined) return undefined
  const { name, ...rest } = entry
  return rest
}

/**
 * Resolve one field as: configured value, then published value, then fallback.
 * Configuration schemas default absent optional fields to `0`, `''` or `[]`,
 * so an empty configured value must read as "not set" — otherwise the default
 * would shadow the catalog and understate a real window to zero.
 */
function pick(configured, published, fallback) {
  const set = Array.isArray(configured)
    ? configured.length > 0
    : configured !== undefined && configured !== null && configured !== '' && configured !== 0
  if (set) return configured
  if (published !== undefined && published !== null) return published
  return fallback
}

/**
 * The seam's whole `ModelModality` vocabulary. A catalog entry may list more
 * than this (models.dev reports `audio` for mimo-v2.5); the seam would reject
 * the extra value, so the resolver clamps to what it declares.
 */
const SEAM_MODALITIES = new Set(['text', 'image'])

/**
 * The output budget to advertise for one model.
 *
 * `defaultMaxTokens` is what a request asks for, not what the model can emit, and
 * the harness spends it twice: it fills a request's `max_tokens` from it, and it
 * reserves the same number as completion room before deciding to compact. So the
 * published output ceiling clamps the configured budget rather than becoming it.
 * Reporting the ceiling instead reserves that much of every window — at the
 * shipped 384k ceiling compaction moves from 80% of a 1M window down to 55% — and
 * a ceiling equal to the window leaves the compaction policy no message budget at
 * all, which it answers with an error rather than a reading.
 *
 * A budget is also never taken past half the window: reserving more than half of it
 * leaves the conversation less room than a single response, which is the state the
 * policy refuses. Every shipped model still clears the harness's headroom at that
 * bound, so the guard only ever catches a hand-set value.
 *
 * @param budget - the configured per-request budget, when one is set.
 * @param ceiling - the model's published output ceiling, when one is known.
 * @param contextWindow - the resolved window, when one is known.
 * @returns the tokens to advertise, or undefined when nothing constrains it.
 */
function resolveOutputBudget(budget, ceiling, contextWindow) {
  const wanted = Number.isFinite(budget) && budget > 0 ? budget : undefined
  const most = Number.isFinite(ceiling) && ceiling > 0 ? ceiling : undefined
  const chosen = wanted === undefined ? most : most === undefined ? wanted : Math.min(wanted, most)
  if (chosen === undefined) return undefined
  const half = Number.isFinite(contextWindow) && contextWindow > 0 ? Math.floor(contextWindow / 2) : undefined
  return half === undefined ? chosen : Math.min(chosen, half)
}

/**
 * The per-model facts a listing needs, under the resolver's own precedence.
 *
 * A listing is not the resolver, but the two must not disagree: a model shown as
 * text-only in the picker while `resolveModel` told the harness it reads images
 * is exactly the silent mismatch issue #1 reports. The same four rules apply,
 * with one addition — a date-stamped snapshot also inherits its family's
 * modalities here, which is what makes the no-scan (cold start, offline) path
 * agree with the resolver instead of falling back to text-only.
 *
 * @param discovered - metadata for this model from the last catalog scan.
 * @returns `{ name, contextWindow, maxTokens, reasoning, input }`.
 */
export function listingMetadata(model, discovered = {}) {
  const table = { ...(siblingCatalogEntry(model) ?? {}), ...(catalogEntry(model) ?? {}) }
  const scanned = discovered ?? {}
  const modality = scanned.inputModalities ?? table.input
  return {
    name: table.name ?? scanned.name,
    contextWindow: scanned.contextWindow ?? table.contextWindow,
    maxTokens: scanned.maxTokens ?? table.maxTokens,
    reasoning: table.reasoning ?? scanned.reasoning,
    // Clamped exactly like the resolver: a table row may list `audio` (models.dev
    // does for mimo-v2.5), and the listing must not hand the seam a modality its
    // vocabulary does not contain.
    input: Array.isArray(modality) ? modality.filter((entry) => SEAM_MODALITIES.has(entry)) : modality,
  }
}

/**
 * Resolve the metadata seam fields for one model.
 *
 * The precedence is per field rather than per layer, because the layers know
 * different kinds of fact — see the comment in the body. Measurement outranks the
 * shipped table for capacity and modalities, which is what lets a model's own
 * numbers follow it after this release; the curated label and the measured
 * reasoning capability stay with the table.
 *
 * The output budget is the exception to the field rules: there a published figure
 * is a ceiling that bounds the configured budget, which is why it goes through
 * {@link resolveOutputBudget}.
 *
 * @param discovered - metadata for this model from the last catalog scan.
 * @returns a descriptor the seam's `normalizeModelInfo` accepts.
 */
export function resolveModelMetadata(provider, model, override, fallback, discovered = {}) {
  const table = catalogEntry(model) ?? {}
  const scanned = discovered ?? {}
  const sibling = siblingCatalogEntry(model) ?? {}
  // Not one merge order but four, because the layers know different kinds of
  // fact and a wrong rule in any of them is a silent error:
  //
  // - the **label** is curated here, so the table outranks a scan's spelling
  //   ("DeepSeek: DeepSeek V4.1 Flash 1017");
  // - the **window**, the **output cap** and the **accepted modalities** are
  //   provider facts the gateway republishes for every model it adds, so a
  //   measurement outranks the table — this is what keeps a new model (or a
  //   model whose upstream changed) from being described by a stale snapshot;
  // - **reasoning** is a capability this release measured against the live
  //   gateway, so the table outranks the gateway's parameter list, which states
  //   what the endpoint accepts rather than what the model does;
  // - the **snapshot family** fills what no one else says, and the route-wide
  //   fallback closes the list.
  const name = pick(override?.name, table.name, scanned.name ?? model)
  const contextWindow = pick(
    override?.contextWindow,
    scanned.contextWindow,
    pick(table.contextWindow, sibling.contextWindow, fallback.contextWindow),
  )
  const maxTokens = resolveOutputBudget(
    fallback.maxTokens,
    pick(override?.maxTokens, scanned.maxTokens, pick(table.maxTokens, sibling.maxTokens, undefined)),
    contextWindow,
  )
  const modality = pick(override?.input, scanned.inputModalities, pick(table.input, sibling.input, undefined))
  const reasoning = override?.reasoning ?? table.reasoning ?? scanned.reasoning ?? sibling.reasoning ?? fallback.reasoning
  const offered = (modality ?? ['text']).filter((entry) => SEAM_MODALITIES.has(entry))
  return {
    provider,
    id: model,
    name,
    inputModalities: offered.length > 0 ? offered : ['text'],
    context: { contextWindow },
    defaultMaxTokens: maxTokens,
    ...(reasoning === true ? { reasoning: { efforts: REASONING_EFFORTS } } : {}),
  }
}
