/**
 * The product-surface marker the Cline gateway demands for its free models.
 *
 * `GET /ai/cline/recommended-models` publishes a `free` array whose ids are
 * `cline-free/*`. Posting one of those with only `Authorization` is refused:
 *
 *   403 {"error":{"code":"API_REQUEST_ERROR_CODE","message":"Error 403:
 *        cline-free/<model> is only available via Cline product surfaces. ..."}}
 *
 * That is the server-side implementation of the documented rule "Free model
 * usage is not supported through the Cline API. Free models are only available
 * in the Cline IDE Extension and CLI." The header is the product-surface claim.
 *
 * Measured behaviour (2026-10-19): the gateway checks only that the header is
 * *present*, not what it says — `cline-cli`, `cline`, `vscode` and even
 * `bogus` all return 200. We send the CLI spelling the Cline CLI itself sends
 * (`@cline/llms` builds it as `"cline-" + source`), because that is the honest
 * one for a caller that is not the IDE.
 *
 * `cline-pass/*` models do not need it (200 either way), but sending it there
 * is harmless and measured to change nothing, so one code path covers both.
 *
 * The harness does NOT supply this: `attributionHeaders()` returns only
 * `user-agent`. Adding it is this plugin's whole reason to exist.
 *
 * Deliberately its own module with no imports, so the one behaviour that makes
 * free models reachable at all can be unit-tested outside the dsh runtime —
 * every other module here imports `@deepseek-ai/*`, which only resolves inside
 * the app.
 *
 * @module dsh-cline-connect/surface
 */

/** The HTTP header name carrying the product-surface claim. */
export const CLINE_CLIENT_TYPE_HEADER = 'x-client-type'

/** The product-surface value this plugin claims; see {@link CLINE_CLIENT_TYPE_HEADER}. */
export const CLINE_CLIENT_TYPE_VALUE = 'cline-cli'

/**
 * The product-surface header, ready to merge into a provider request.
 * @returns headers identifying this caller as a Cline CLI surface.
 */
export function clineProductSurfaceHeaders() {
  return { [CLINE_CLIENT_TYPE_HEADER]: CLINE_CLIENT_TYPE_VALUE }
}
