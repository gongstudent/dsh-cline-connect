/**
 * dsh-cline-connect — browser half.
 *
 * A hand-written dsh client bundle: the module system loads it with
 * `window.__ModuleLoader__.load`, and the Cordis Loader treats the returned
 * exports as an ordinary plugin (`apply` + `inject`). Plain CJS with no build
 * step, so `require` reaches only the shell's platform seed table — `react`.
 *
 * It adds a folded Cline Connect card to the Plugins page and a compact key card
 * on the Models page. Every read and write goes to the authenticated
 * `/api/cline-connect` route published by `lib/panel.js`, so the panel and the
 * `cline_connect_*` tools share one source of truth.
 *
 * @module dsh-cline-connect/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-cline-connect',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // The only module this bundle takes from the platform seed table. Nothing
    // else is required — in particular none of the host's own UI packages: they
    // change without notice, this file has no type check to catch it, and a
    // throw while the factory runs takes the whole bundle down, panel tab and
    // model card together, with nothing in the console naming the cause. The
    // disclosure chevron below is drawn by this plugin for that reason.
    const React = require('react')
    const h = React.createElement

    /** Locale namespace this card owns. */
    const NS = 'cline-connect'
    /** Exact `/api` Fetch route the host half publishes. */
    const PANEL_PATH = '/api/cline-connect'
    /** Human label for the upstream verdict vocabulary. */
    const VERDICT = { ok: 'available', limited: 'rate-limited', bad: 'not-pinnable', auth: 'auth-failed', 'not-adopted': 'not-adopted', unknown: 'unknown' }
    /**
     * The quota windows this bundle can name, in display order.
     *
     * A window the gateway reports that is missing here still renders — under the
     * gateway's own type string — so an added window needs no release.
     */
    const USAGE_WINDOWS = [['five_hour', 'usageFiveHour'], ['weekly', 'usageWeekly'], ['monthly', 'usageMonthly']]
    /**
     * How long a token reading stays fresh.
     *
     * Counting walks the account's usage history, so an automatic re-read on
     * every panel open would spend requests for a number that moves slowly.
     */
    const TOKEN_TTL_MS = 5 * 60_000

    //#region styles

    const CSS = [
      '.cc-panel{max-width:820px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:14px;font-size:13px}',
      '.cc-title{margin:0;font-size:18px;font-weight:600}',
      '.cc-card{border:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}',
      '.cc-card-title{font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px;justify-content:space-between}',
      '.cc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.cc-grow{flex:1;min-width:120px}',
      '.cc-muted{color:var(--dsw-alias-label-tertiary)}',
      '.cc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}',
      '.cc-input,.cc-select{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font-size:13px;min-width:0}',
      '.cc-input:focus-visible,.cc-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.cc-btn{border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}',
      '.cc-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.cc-btn:disabled{opacity:.5;cursor:default}',
      '.cc-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}',
      '.cc-btn-danger{color:var(--dsw-alias-state-error-primary)}',
      '.cc-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}',
      '.cc-table{display:flex;flex-direction:column;gap:6px}',
      '.cc-model{border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:8px}',
      // The account table is a real table for the same reason the history one
      // is: per-row grids size their `auto` tracks from their own content, so a
      // header cell never lines up with the data under it.
      '.cc-acct-table{width:100%;border-collapse:collapse;table-layout:fixed}',
      '.cc-acct-table th{text-align:center;font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 0 6px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}',
      '.cc-acct-table td{padding:6px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2);font-size:12px;vertical-align:middle;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-acct-table tbody tr:hover td{background:var(--dsw-alias-bg-layer-2)}',
      '.cc-acct-col-dot{width:52px}',
      '.cc-acct-state{display:flex;align-items:center;gap:8px}',
      '.cc-acct-row-off .cc-acct-id,.cc-acct-row-off .cc-acct-hint{opacity:.55}',
      '.cc-acct-col-hint{width:104px}',
      '.cc-acct-col-actions{width:190px}',
      '.cc-acct-id{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0}',
      '.cc-acct-name{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-acct-ref,.cc-acct-hint{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-acct-ref{color:var(--dsw-alias-label-tertiary)}',
      '.cc-acct-hint{color:var(--dsw-alias-label-secondary);font-size:12px}',
      // Wrapping is the fallback for a panel narrower than the three buttons:
      // a taller row beats a clipped button.
      '.cc-acct-actions{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap}',
      '.cc-acct-newname{flex:0 0 150px}',
      '.cc-acct-add,.cc-acct-key{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:10px;margin-top:2px}',
      '.cc-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.cc-chip{border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 8px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}',
      '.cc-chip-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.cc-chip-excluded{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}',
      // The FREE badge is the chip family with a different fill, not a second
      // badge system: same geometry, but solid success colour so it reads as a
      // marker rather than as one more clickable channel. Every var() carries a
      // literal fallback, because a removed theme variable invalidates the whole
      // declaration and the badge would silently lose its colour.
      '.cc-chip-free{border-color:var(--dsw-alias-state-success-primary,#12b76a);background:var(--dsw-alias-state-success-primary,#12b76a);color:var(--dsw-alias-bg-base,#fff);font-weight:700;letter-spacing:.04em;cursor:default}',
      '.cc-msg{border-radius:6px;padding:6px 8px;font-size:12px;line-height:17px;white-space:pre-wrap;word-break:break-word}',
      '.cc-msg-ok{background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base)}',
      '.cc-msg-err{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}',
      '.cc-msg-warn{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base)}',
      '.cc-history{max-height:280px;overflow:auto;padding:0 4px 2px}',
      // A real table, not a grid per row: with one grid per row every `auto`
      // track is resolved from that row's own content, so a row whose upstream
      // is a long pill and a row whose upstream is "(auto)" end up with
      // different column widths — and nothing lines up with the header.
      //
      // `table-layout:auto`, i.e. the browser's own algorithm, and no `min-width`:
      // the table always fits its container, so the log never needs sideways
      // scrolling, and the sizing decision is left to the engine that knows each
      // cell's real content width.
      //
      // That decision matters because the content genuinely does not fit. Measured
      // at this card's real width (about 490px of table inside the settings card,
      // which caps at 760px): the columns need roughly 85 + 208 + 234 + 111 =
      // 638px, so something has to give. Under `table-layout:fixed` plus shares,
      // what gave was the right-hand figures — they were ellipsised to "13…" and
      // "4…", losing the number the reader came for. Left to itself the engine
      // gives way on the token column instead, which simply wraps to a second
      // line: the figures stay whole and nothing is lost.
      '.cc-history-table{width:100%;border-collapse:collapse;table-layout:auto}',
      // Header and data share one alignment: a table whose labels sit left of
      // their values is the thing this panel keeps getting asked to fix.
      '.cc-history-table th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1);text-align:center;font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary);padding:2px 0 6px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}',
      '.cc-history-table td{padding:6px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2);font-size:12px;vertical-align:middle;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-history-table tbody tr:hover td{background:var(--dsw-alias-bg-layer-2)}',
      // Only two columns are pinned, and each to its measured need:
      //   点 16px    — the status dot
      //   时间 82px  — a clock, or a dated stamp like "09-24 04:48" (needs 85px,
      //                but the engine measures a little differently than the
      //                intrinsic probe; 82px is where the stamp stops clipping)
      // TOKEN and 延迟 are left to the engine. 延迟 holds single-line figures, so
      // it always gets what it needs — which is the point: previously the model
      // column took every spare pixel while the figures on the right were clipped,
      // and that is the "left too loose, right too tight" shape being fixed.
      '.cc-history-col-dot{width:16px}',
      '.cc-history-col-when{width:82px}',
      // The columns used to sit flush against one another at `padding:0`, which is
      // what made the right-hand figures read as cramped. A little padding on each
      // side of the three content columns separates label from neighbour.
      '.cc-history-table th:nth-child(2),.cc-history-table td:nth-child(2){padding-left:10px;padding-right:10px}',
      '.cc-history-table th:nth-child(4),.cc-history-table td:nth-child(4){padding-left:10px;padding-right:10px}',
      '.cc-history-table th:nth-child(5),.cc-history-table td:nth-child(5){padding-left:10px;padding-right:10px}',
      '.cc-history-when{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.cc-history-model-cell{min-width:0}',
      // The flex stack lives INSIDE the cell, never on the `<td>` itself: a td
      // with `display:flex` stops being a table-cell, drops out of the row's
      // height equalisation, and the row's two bottom borders land at different
      // y positions — which is what makes the rule look broken.
      '.cc-history-model-stack{display:flex;flex-direction:column;gap:2px;min-width:0;align-items:center}',
      '.cc-history-model{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // Selector must out-specify `.cc-history-table td` (0,1,1), whose nowrap +
      // ellipsis would otherwise clip the counts with no way to read them.
      '.cc-history-table td.cc-history-tokens{color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.5}',
      // Three stacked figures read like a request log: label left, value right.
      '.cc-history-table td.cc-history-load{font-variant-numeric:tabular-nums;white-space:normal;overflow:visible;text-overflow:clip}',
      // `space-between` is what keeps the three figures right-aligned with each
      // other across rows, but it also turns every spare pixel of the column into
      // a gap between label and value. Capping the row and centring it makes that
      // surplus invisible instead, so the column can be given generous width at a
      // wide panel without the figures drifting apart.
      '.cc-history-load-row{display:flex;justify-content:space-between;gap:5px;max-width:112px;margin:0 auto;font-size:11.5px;line-height:1.5}',
      // With the table no longer allowed to scroll sideways, a narrow pane can
      // leave this column short of its need. The label must not wrap then — a
      // taller cell would change the row height — so the label stays whole and
      // the figure is the part that gives way, ellipsised with its exact value
      // still available in the row tooltip.
      '.cc-history-load-row>span{white-space:nowrap}',
      '.cc-history-load-row>span:first-child{flex:none}',
      '.cc-history-load-row>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:right}',
      '.cc-history-meta{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;overflow:hidden}',
      // A failure gets its own row under the entry rather than widening it: the
      // gateway's messages are long enough to wreck a one-line layout.
      '.cc-history-error{color:var(--dsw-alias-state-error-primary);font-size:11.5px}',
      '.cc-tag{border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cc-tag-quiet{background:0 0;border-color:transparent;color:var(--dsw-alias-label-tertiary);flex:none}',
      '.cc-trace{font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:2px}',
      '.cc-inline{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.cc-grow-end{margin-left:auto}',
      // Plugins-page card chrome, mirrored token for token from the host's own
      // `PluginCard`: that tab hands a plugin the whole card, so matching it —
      // rather than inventing a second look — is this bundle's job.
      '.cc-set-card{border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}',
      '.cc-set-card:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.cc-set-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.cc-set-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
      '.cc-set-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.cc-set-head-text{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
      '.cc-set-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
      '.cc-set-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
      '.cc-set-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
      '.cc-set-chevron-open{transform:rotate(180deg)}',
      '.cc-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s;display:inline-flex}',
      'details[open]>summary .cc-chevron{transform:rotate(180deg)}',
      // A summary laid out as a flex row keeps no native affordance, so the
      // pointer and the hover tone are what say "this opens".
      '.cc-fold{cursor:pointer}',
      '.cc-fold:hover .cc-chevron{color:var(--dsw-alias-label-primary)}',
      '.cc-set-body{border-top:0.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px}',
      '.cc-usage-groups{display:flex;flex-direction:column;gap:12px}',
      // A pool shows one account at a time: the arrows are the only way to reach
      // the others, so they sit on the same row as the name they act on.
      '.cc-usage-pager{display:flex;align-items:center;gap:8px}',
      '.cc-usage-nav{box-sizing:border-box;width:24px;height:24px;flex:none;padding:0;border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
      '.cc-usage-nav:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.cc-usage-name{display:flex;align-items:center;gap:8px;min-width:0}',
      '.cc-usage-acct{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-usage-active{border:0.5px solid var(--dsw-alias-brand-primary);border-radius:999px;padding:1px 7px;font-size:11px;font-weight:600;flex:none}',
      '.cc-usage-pos{font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}',
      '.cc-usage{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}',
      '.cc-usage-item{border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '.cc-usage-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
      '.cc-usage-label{font-weight:600}',
      '.cc-usage-value{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.cc-usage-track{height:6px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}',
      '.cc-usage-fill{height:100%;border-radius:999px;transition:width .3s}',
      '.cc-usage-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.cc-usage-tokens{font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.cc-usage-models{margin-top:2px}',
      '.cc-usage-models-sum{cursor:pointer;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.cc-usage-models-sum:hover{color:var(--dsw-alias-label-primary)}',
      '.cc-usage-model-rows{display:flex;flex-direction:column;gap:2px;margin-top:6px}',
      '.cc-usage-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:baseline;font-size:11.5px}',
      '.cc-usage-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.cc-usage-model-cost{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      // The free-model breakdown lines up its figures because every column is
      // pinned: an `auto` track is measured from each row's own content, so a
      // row whose cost is "0" would start its token count at a different x
      // than a row whose cost is "$0.0589".
      '.cc-free-model-row{display:flex;align-items:baseline;gap:10px;font-size:11.5px}',
      '.cc-free-model-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.cc-free-model-tokens{flex:none;min-width:60px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.cc-free-model-cost{flex:none;min-width:74px;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}',
      // The shared-window caveat is the one line of this card a reader must not
      // skip, so it gets more line-height than a footnote.
      '.cc-free-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.cc-check{width:14px;height:14px;flex:none;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
      '.cc-tools-label{cursor:pointer;gap:8px}',
      // The usage pill beside the model selector. It borrows the panel's ramp and
      // track treatment so a reading looks the same in both places.
      '.cc-pill{position:relative;display:flex;align-items:center;font-size:12px;line-height:1.4}',
      '.cc-pill-btn{border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 9px;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.cc-pill-btn:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
      '.cc-pill-btn[aria-expanded=true]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
      '.cc-pill-pop{position:absolute;bottom:calc(100% + 8px);right:0;z-index:40;min-width:236px}',
      '.cc-pill-card{background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.16));padding:12px 14px;display:flex;flex-direction:column;gap:9px}',
      '.cc-pill-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      // The heading row carries the account switcher in a pool, so the title and
      // the arrows sit on one line and the reading keeps the width below them.
      '.cc-pill-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.cc-pill-nav{display:flex;align-items:center;gap:5px;min-width:0}',
      '.cc-pill-arrow{border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:6px;width:18px;height:18px;line-height:1;font:inherit;font-size:12px;cursor:pointer;padding:0;flex:none}',
      '.cc-pill-arrow:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}',
      '.cc-pill-who{font-size:11.5px;color:var(--dsw-alias-label-secondary);max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cc-pill-pos{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none}',
      '.cc-pill-row{display:flex;flex-direction:column;gap:4px}',
      '.cc-pill-row-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.cc-pill-percent{font-variant-numeric:tabular-nums;font-weight:600}',
      '.cc-pill-track{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}',
      '.cc-pill-fill{height:100%;border-radius:999px}',
      '.cc-pill-note,.cc-pill-at{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.cc-pill-at{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:8px}',
      '.cc-pill-fail{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.cc-pill-retry{border:0;background:0 0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11.5px;cursor:pointer;padding:0}',
      '.cc-pill-retry:hover{text-decoration:underline}',
      '.cc-model-hidden .cc-mono,.cc-model-hidden .cc-check{opacity:.55}',
    ].join('')

    const CSS_TAG = '@deepseek-ai/dsh-cline-connect/client.css'

    /**
     * Put this bundle's stylesheet into the head, and return the undo.
     *
     * Called from `apply`, never from the factory: a factory that has already
     * touched `document` has taken a side effect before the host has decided to
     * keep the plugin, and there is nothing to undo it with.
     *
     * The lookup compares CONTENT, not just the id. A rebuilt bundle replaces
     * the old one without a page reload: the host tears the old fiber down,
     * sweeps `style[data-plugin="dsh-cline-connect"]`, and only then
     * materializes the new factory. A node the sweep missed would keep the
     * previous revision's rules and the change would never show, so a tag whose
     * text already equals the current CSS is reused rather than duplicated, and
     * one that differs is replaced.
     */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const selector = 'style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']'
      const found = document.querySelector(selector)
      const reused = found !== null && found.textContent === CSS
      const tag = reused ? found : document.createElement('style')
      if (!reused) {
        // `data-plugin` is the attribute the host sweeps and inventories this
        // bundle's styles under; `data-plugin-css` is the content id above.
        tag.dataset.plugin = 'dsh-cline-connect'
        tag.dataset.pluginCss = CSS_TAG
        tag.textContent = CSS
        document.head.appendChild(tag)
        found?.remove()
      }
      return () => { tag.remove() }
    }

    //#endregion

    //#region copy

    const ZH = {
      title: 'Cline Connect',
      description: 'Cline 免费模型与订阅模型的接入配置',
      panelUnavailable: '浏览器通道不可用。',
      expand: '展开设置',
      collapse: '收起设置',
      keyOk: 'API Key 已配置',
      keyMissing: '尚未配置 API Key',
      keyValue: 'API Key',
      keyPlaceholder: 'sk_…',
      save: '保存',
      saveTest: '保存并测试',
      test: '测试',
      remove: '删除',
      accounts: '账号',
      accountsCount: '{n} 个账号',
      accountsActive: '当前',
      accountsSetActive: '设为当前',
      accountsKey: '密钥',
      accountsActions: '操作',
      accountsEnabled: '启用',
      accountsOff: '已停用',
      accountsPoolHint: '单账号：优先用「当前」账号；轮询：每次请求依次使用已启用账号。任一账号额度耗尽或被拒时，会自动改用池内其他账号，失败账号冷却一段时间。',
      accountsFirstRun: '配置 API Key 后，才会显示官方额度、订阅模型与请求记录。',
      accountsFor: '为「{name}」保存密钥',
      accountsFirst: '(首个可用)',
      keyNone: '未配置',
      accountMode: '账号模式',
      modeSingle: '单账号',
      modeRoundrobin: '轮询',
      active: '当前账号',
      addAccount: '添加',
      accountName: '账号名',
      models: '模型',
      modelsCount: '{n} 个模型',
      hiddenModels: '{n} 个已从选择列表隐藏',
      visible: '在模型选择列表中显示',
      hiddenTag: '已隐藏',
      freeBadge: 'FREE',
      freeBadgeHint: '免费模型：不产生费用，但用量计入同一账号配额。',
      freeModels: '{n} 个免费',
      selectAll: '全选',
      invertSelection: '反选',
      usageTitle: '官方额度',
      usageFiveHour: '5 小时',
      usageWeekly: '本周',
      usageMonthly: '本月',
      usageResetsIn: '{t}后重置',
      usageDays: '{n} 天',
      usageHours: '{n} 小时',
      usageMinutes: '{n} 分钟',
      usageRefresh: '刷新',
      usagePillTitle: 'Cline Connect 用量',
      usagePillUnavailable: '用量不可用',
      usagePillRetry: '重试',
      usagePillUpdatedAt: '更新于 {time}',
      // Brand-free on purpose: the pill prefixes the quota windows
      // ("额度 · 5h 42% · wk 10%"), and the old "Pass" was a leftover of the
      // previous product name sitting right beside a "Cline Connect" title.
      usagePillLabel: '额度',
      usagePillWeekly: '周',
      usageLoading: '正在读取官方额度…',
      usageUnavailable: '暂时读不到官方额度。',
      usageEmpty: '官方未返回额度窗口。',
      freeUsageTitle: '免费模型用量',
      freeUsageToday: '今日',
      freeUsageWeek: '近 7 天',
      freeUsageTokens: '{n} tokens',
      freeUsageModels: '{n} 个模型',
      freeUsageCost: '费用',
      freeUsageByModel: '今日按模型',
      // The shared-window fact is stated because the opposite is what a reader
      // assumes: three quota bars under a "free models" heading read as if the
      // bars excluded them. There is no free-only window upstream to show.
      freeUsageNote: '注意：账号的三个额度窗口（5 小时 / 本周 / 本月）由免费模型与订阅模型共用，上游没有单独的免费额度。',
      freeUsageRange: '{start} ~ {end}',
      freeUsageLoading: '正在读取免费模型用量…',
      freeUsageUnavailable: '暂时读不到免费模型用量。',
      freeUsageEmpty: '今日暂无免费模型调用。',
      usageAccount: '账号 {name}',
      usagePrev: '上一个账号',
      usageNext: '下一个账号',
      usagePosition: '第 {i} / {n} 个',
      historyWhen: '时间',
      historyModel: '模型',
      historyUpstream: '上游',
      historyLoad: '延迟',
      historyTokens: 'TOKEN',
      historyFirstChunk: '首字',
      historyTotal: '总耗时',
      historyRate: '输出速率',
      historyTokensHint: '↓输入 ↑输出 ⚡缓存 🧠推理；— 表示网关本次未返回用量',
      historyEffort: '推理强度',
      historyAuto: '(自动)',
      noChannels: '未探测渠道',
      pinned: '已钉住',
      auto: '自动路由',
      probe: '探测',
      validate: '校验',
      testPin: '测试',
      reset: '恢复自动',
      refresh: '刷新',
      channels: '渠道（点选＝钉住顺序，⊘＝排除）',
      history: '最近请求',
      noHistory: '暂无记录。',
      busy: '处理中…',
      settingsUnavailable: '设置服务不可用，改动无法保存。',
      toolsExpose: '开启工具注入（重启后生效）',
      retry: '重试',
      version: '版本与更新',
      versionInstalled: '已安装',
      versionLocked: '锁文件 commit',
      versionUpstream: '上游最新',
      versionUnknown: '未知',
      versionLatest: '已是最新',
      versionUpdate: '有更新',
      versionCheckFailed: '检查失败',
      versionPending: '未检查',
      versionStaleHost: '检查没有成功：如果刚升级过插件，宿主可能还是旧版本——重启 dsh 再试。',
      versionHint: '插件以 github: 安装时由锁文件钉住 commit；升级后用上面的命令，再重启 dsh 生效。',
      checkUpdate: '检查更新',
      copy: '复制命令',
      copied: '已复制',
    }
    const EN = {
      title: 'Cline Connect',
      description: 'Free and subscription Cline models for the harness',
      panelUnavailable: 'The browser channel is unavailable.',
      expand: 'Show settings',
      collapse: 'Hide settings',
      keyOk: 'API key configured',
      keyMissing: 'No API key',
      keyValue: 'API key',
      keyPlaceholder: 'sk_…',
      save: 'Save',
      saveTest: 'Save and test',
      test: 'Test',
      remove: 'Remove',
      accounts: 'Accounts',
      accountsCount: '{n} account(s)',
      accountsActive: 'active',
      accountsSetActive: 'Use',
      accountsKey: 'Key',
      accountsActions: 'Actions',
      accountsEnabled: 'Enabled',
      accountsOff: 'Disabled',
      accountsPoolHint: 'Single: prefers the "current" account; round-robin: each request uses the next enabled account. When one is out of quota or refused, the pool switches to another and stands the failed one down for a while.',
      accountsFirstRun: 'Quota, subscription models and request history appear once a key is stored.',
      accountsFor: 'Store a key for "{name}"',
      accountsFirst: '(first enabled)',
      keyNone: 'not set',
      accountMode: 'Mode',
      modeSingle: 'Single',
      modeRoundrobin: 'Round robin',
      active: 'Active',
      addAccount: 'Add',
      accountName: 'Name',
      models: 'Models',
      modelsCount: '{n} model(s)',
      hiddenModels: '{n} hidden from the pickers',
      visible: 'Show in the model pickers',
      hiddenTag: 'Hidden',
      freeBadge: 'FREE',
      freeBadgeHint: 'Free model: no cost, but its usage counts against the same account quota.',
      freeModels: '{n} free',
      selectAll: 'Check all',
      invertSelection: 'Invert',
      usageTitle: 'Official usage limits',
      usageFiveHour: '5-hour',
      usageWeekly: 'Weekly',
      usageMonthly: 'Monthly',
      usageResetsIn: 'resets in {t}',
      usageDays: '{n}d',
      usageHours: '{n}h',
      usageMinutes: '{n}m',
      usageRefresh: 'Refresh',
      usagePillTitle: 'Cline Connect usage',
      usagePillUnavailable: 'Usage unavailable',
      usagePillRetry: 'Retry',
      usagePillUpdatedAt: 'Updated {time}',
      usagePillLabel: 'Quota',
      usagePillWeekly: 'wk',
      usageLoading: 'Reading the official quota…',
      usageUnavailable: 'The official quota is unavailable right now.',
      usageEmpty: 'The gateway reported no quota windows.',
      freeUsageTitle: 'Free model usage',
      freeUsageToday: 'Today',
      freeUsageWeek: 'Last 7 days',
      freeUsageTokens: '{n} tokens',
      freeUsageModels: '{n} models',
      freeUsageCost: 'cost',
      freeUsageByModel: 'By model (today)',
      freeUsageNote: 'Note: the three quota windows (5-hour / weekly / monthly) are shared by free and subscription models; upstream publishes no free-only allowance.',
      freeUsageRange: '{start} ~ {end}',
      freeUsageLoading: 'Reading free-model usage…',
      freeUsageUnavailable: 'Free-model usage is unavailable right now.',
      freeUsageEmpty: 'No free-model calls today.',
      usageAccount: 'account {name}',
      usagePrev: 'Previous account',
      usageNext: 'Next account',
      usagePosition: '{i} of {n}',
      historyWhen: 'Time',
      historyModel: 'Model',
      historyUpstream: 'Upstream',
      historyLoad: 'Latency',
      historyTokens: 'Tokens',
      historyFirstChunk: 'first',
      historyTotal: 'total',
      historyRate: 'rate',
      historyTokensHint: '↓in ↑out ⚡cache 🧠reasoning; a dash means the gateway reported no usage',
      historyEffort: 'effort',
      historyAuto: '(auto)',
      noChannels: 'No channels probed',
      pinned: 'Pinned',
      auto: 'Auto',
      probe: 'Probe',
      validate: 'Validate',
      testPin: 'Test',
      reset: 'Back to auto',
      refresh: 'Refresh',
      channels: 'Channels (click = pin order, ⊘ = exclude)',
      history: 'Recent requests',
      noHistory: 'Nothing recorded.',
      busy: 'Working…',
      settingsUnavailable: 'Settings are read-only; changes will not persist.',
      toolsExpose: 'Expose the tools (takes effect after a restart)',
      retry: 'Retry',
      version: 'Version & updates',
      versionInstalled: 'Installed',
      versionLocked: 'Locked commit',
      versionUpstream: 'Upstream',
      versionUnknown: 'unknown',
      versionLatest: 'up to date',
      versionUpdate: 'update available',
      versionCheckFailed: 'check failed',
      versionPending: 'not checked',
      versionStaleHost: 'The check did not go through: if the plugin was just upgraded, the host half may still be the old build — restart dsh and retry.',
      versionHint: 'A github: install is pinned to one commit by the lockfile; run the command above, then restart dsh.',
      checkUpdate: 'Check for updates',
      copy: 'Copy command',
      copied: 'Copied',
    }

    //#endregion

    //#region store

    /**
     * A minimal uSES-safe external store.
     *
     * `getSnapshot` keeps returning the same reference until `set` replaces it,
     * which is what the slot hook contract requires.
     */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    //#endregion

    //#region helpers

    /** Format a byte-free duration for display. */
    function ms(value) {
      const n = Number(value ?? 0)
      if (!Number.isFinite(n) || n <= 0) return '-'
      return n >= 1000 ? (n / 1000).toFixed(1) + 's' : Math.round(n) + 'ms'
    }

    /**
     * A timestamp as a history row reads it: clock time for today, and the date
     * in front of it once an entry is no longer from today — a long-lived host
     * process would otherwise show times that look like they were all this hour.
     */
    function historyStamp(value) {
      const at = new Date(Number(value ?? 0))
      if (!Number.isFinite(at.getTime())) return '-'
      const pad = (part) => String(part).padStart(2, '0')
      const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
      if (at.toDateString() === new Date().toDateString()) return clock
      return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock.slice(0, 5)}`
    }

    /** Colour a channel verdict. */
    function verdictColor(status) {
      if (status === 'ok') return 'var(--dsw-alias-state-success-primary)'
      if (status === 'limited') return 'var(--dsw-alias-state-warn-primary)'
      if (status === 'unknown') return 'var(--dsw-alias-label-tertiary)'
      return 'var(--dsw-alias-state-error-primary)'
    }

    /** Interpolate `{n}`-style placeholders. */
    function fill(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) => (params?.[key] === undefined ? whole : String(params[key])))
    }

    /**
     * The three-step tone ramp a quota bar uses.
     *
     * A percentage is only alarming near the cap, so the ramp keeps the ordinary
     * reading green and reserves colour for the two states worth reacting to.
     */
    function usageColor(percent) {
      if (percent >= 90) return 'var(--dsw-alias-state-error-primary)'
      if (percent >= 70) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-success-primary)'
    }


    /**
     * One token count, bounded in width for the request table.
     *
     * Exact with separators while that still fits a narrow column, then one
     * decimal of k/M — the convention the reference request log uses too
     * ("4,239" beside "205.6K"). Every field is therefore at most six characters,
     * so four of them plus their markers cannot push a row taller than the three
     * latency lines already do. The exact digits stay in the tooltip.
     */
    function formatTokenCount(value) {
      const n = Math.max(0, Number(value ?? 0))
      if (n < 100_000) return n.toLocaleString('en-US')
      if (n < 1_000_000) {
        const k = (n / 1000).toFixed(1)
        // 999,999 rounds to "1000.0k" — a value the next unit already names.
        return Number(k) >= 1000 ? `${(n / 1_000_000).toFixed(1)}M` : `${k}k`
      }
      return `${(n / 1_000_000).toFixed(1)}M`
    }

    /**
     * The gateway states money in MICRO-USD, not dollars.
     *
     * Discovered by cross-check: the five-hour reading summed to 83,653,988 while
     * the plan's cap for the same window is 1,000,000,000 and the official
     * percentage was 8% — and 83.6M/1e9 = 8.4%. The weekly (288.8M / 2.5e9 =
     * 11.6% vs 11%) and monthly (288.8M / 5e9 = 5.8% vs 5%) readings agree, so
     * both the per-row `costUsd` and the caps are 1e-6 USD: $83.65 against a
     * $1000 window. The division happens here, at the one place money becomes
     * text, which leaves the transport a faithful copy of what was sent.
     */
    const MICRO_USD = 1_000_000


    /**
     * A USD figure, already in dollars.
     *
     * A nonzero amount under a cent is shown as `<$0.01` rather than rounded to
     * zero: "no usage" and "a sliver of usage" are different answers.
     */
    function formatUsd(value) {
      const n = Number(value ?? 0)
      if (!Number.isFinite(n) || n <= 0) return '$0.00'
      if (n < 0.01) return '<$0.01'
      if (n < 1000) return `$${n.toFixed(2)}`
      // A cap is read as a figure, so thousands get separators rather than a "k"
      // suffix that hides the digits making it recognizable.
      return `$${Math.round(n).toLocaleString('en-US')}`
    }

    /**
     * The free-model card's money, stated in the micro-USD the gateway sends.
     *
     * Four decimals is this reading's own resolution — 58,892 µUSD is $0.0589 —
     * but a real charge below that would round to the same "0" as no charge at
     * all, so a smaller one keeps two more digits. Zero stays a bare "0" rather
     * than "$0.0000": the free models usually cost nothing, and a column of
     * "$0.0000" would read as a measurement where this is an absence.
     */
    function formatMicroUsd(value) {
      const micro = Number(value ?? 0)
      if (!Number.isFinite(micro) || micro <= 0) return '0'
      const usd = micro / MICRO_USD
      return usd < 0.0001 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(4)}`
    }

    /**
     * A request's three latency figures, the way a request log reads them.
     *
     * - `first`: what the caller waited before anything appeared.
     * - `total`: what the whole call cost.
     * - `rate`: output tokens per second AFTER the first chunk — the speed of the
     *   answer itself. Dividing the total instead would fold the model's thinking
     *   into a "speed" and report a slow answer for a fast one that thought long.
     *
     * A moment that never came is a dash, not a zero: zero would read as "instant".
     */
    function latency(entry) {
      const stamp = (value) => (Number(value ?? 0) > 0 ? ms(value) : '—')
      const first = Number(entry.ttft ?? 0)
      const total = Number(entry.ms ?? 0)
      const out = entry.usageReported === true ? Number(entry.usage?.outputTokens ?? 0) : 0
      const streaming = total - first
      const rate = first > 0 && out > 0 && streaming > 0
        ? `${(out / (streaming / 1000)).toFixed(1)} t/s`
        : '—'
      return { first: stamp(first), total: stamp(total), rate }
    }

    /**
     * The four token counts of a request, or `null` when the gateway sent no
     * usage frame — which is not the same as a call that cost nothing.
     *
     * Returned as parts rather than a string so the same numbers can be rendered
     * two ways: bounded for the narrow cell, exact for its tooltip.
     */
    function tokenParts(entry) {
      if (entry.usageReported !== true) return null
      const usage = entry.usage
      const parts = [
        { key: 'in', icon: '↓', value: Number(usage.inputTokens ?? 0) },
        { key: 'out', icon: '↑', value: Number(usage.outputTokens ?? 0) },
      ]
      if (Number(usage.cacheReadTokens ?? 0) > 0) parts.push({ key: 'cache', icon: '⚡', value: Number(usage.cacheReadTokens) })
      if (Number(usage.reasoningTokens ?? 0) > 0) parts.push({ key: 'think', icon: '🧠', value: Number(usage.reasoningTokens) })
      return parts
    }

    /** The cell's rendering: width-bounded, so no count can reshape the row. */
    function tokenSummary(entry) {
      const parts = tokenParts(entry)
      if (parts === null) return '—'
      return parts.map((part) => `${part.icon}${formatTokenCount(part.value)}`).join(' ')
    }

    /** The tooltip's rendering: every digit, so nothing is only approximately known. */
    function tokenSummaryExact(entry) {
      const parts = tokenParts(entry)
      if (parts === null) return ''
      return parts.map((part) => `${part.icon}${part.value.toLocaleString('en-US')}`).join(' ')
    }

    /**
     * A coarse "3 天 4 小时" from an ISO instant.
     *
     * Coarse on purpose: a quota reset is read at a glance, and seconds of
     * precision would only make the panel re-render for nothing.
     * @returns the duration, or '' when the instant is absent or already past.
     */
    function countdown(t, iso) {
      const at = Date.parse(String(iso ?? ''))
      if (!Number.isFinite(at)) return ''
      const minutes = Math.round((at - Date.now()) / 60000)
      if (minutes <= 0) return ''
      const days = Math.floor(minutes / 1440)
      const hours = Math.floor((minutes % 1440) / 60)
      const mins = minutes % 60
      if (days > 0) return `${fill(t('usageDays'), { n: days })} ${fill(t('usageHours'), { n: hours })}`
      if (hours > 0) return `${fill(t('usageHours'), { n: hours })} ${fill(t('usageMinutes'), { n: mins })}`
      return fill(t('usageMinutes'), { n: Math.max(1, mins) })
    }

    //#endregion

    //#region controller

    /**
     * The panel's state and actions.
     *
     * One instance is shared by every registration this bundle makes, so the
     * Settings page, the Plugins card and the Models card all agree.
     */
    class PanelController {
      constructor(ctx) {
        this.ctx = ctx
        this.store = createStore({ status: 'loading', error: null, data: null, busy: null, notice: null, action: null })
        this.disposed = false
        this.localeDispose = undefined
        this.unsubscribe = undefined
        this.t = this.makeTranslate()
      }

      /**
       * Load the in-process request history.
       *
       * The payload is returned rather than advertised through `action`: `run`
       * publishes its own result there, so a second publish only wrote a shape
       * nothing read. The caller stores what it gets back.
       */
      /**
       * Bind this panel's copy to the active locale.
       *
       * The dictionaries register as soon as the locale service exists, but the
       * ACTIVE locale is read on every call rather than captured here: this
       * plugin does not declare `locale` as a dependency, so that service can
       * legitimately activate after this one, and a value captured at
       * construction would freeze the panel on its fallback language.
       */
      makeTranslate() {
        const locale = this.ctx.get('locale')
        if (locale !== undefined) {
          try { locale.register(NS, 'zh', ZH) } catch { /* a duplicate registration is harmless */ }
          try { locale.register(NS, 'en', EN) } catch { /* see above */ }
          this.localeDispose = locale.subscribe(() => this.publish())
        }
        return (key, params) => {
          let active
          try { active = this.ctx.get('locale')?.getLocale?.()?.active } catch { /* keep the default */ }
          const dict = active === 'en' ? EN : ZH
          return fill(dict[key] ?? EN[key] ?? key, params)
        }
      }

      /** Stop observing. */
      dispose() {
        this.disposed = true
        this.unsubscribe?.()
        this.localeDispose?.()
      }

      /** The face injected into a slot registration. */
      inject() {
        const controller = this
        return {
          // The host derives the hook name as `use${Capitalize(key)}`, so this
          // key and the `props.useClineConnect` calls below are one contract:
          // renaming either alone leaves the component calling an undefined
          // hook, which throws and takes the whole card down silently.
          hooks: { clineConnect: controller.store },
          refresh: () => controller.refresh(),
          setKey: (ref, value) => controller.setKey(ref, value),
          testKey: (ref, value) => controller.testKey(ref, value),
          saveAndTest: (ref, value) => controller.saveAndTest(ref, value),
          addAccount: (payload) => controller.addAccount(payload),
          removeAccount: (name) => controller.removeAccount(name),
          setAccountMode: (patch) => controller.setAccountMode(patch),
          setAccountEnabled: (name, enabled) => controller.setAccountEnabled(name, enabled),
          pinModel: (payload) => controller.pinModel(payload),
          setModelVisible: (model, visible) => controller.setModelVisible(model, visible),
          setToolsExposed: (value) => controller.setToolsExposed(value),
          setModelsVisibility: (mode) => controller.setModelsVisibility(mode),
          probeModel: (model) => controller.probeModel(model),
          validateModel: (model) => controller.validateModel(model),
          testModel: (model) => controller.testModel(model),
          resetModel: (model) => controller.resetModel(model),
          refreshModels: () => controller.refreshModels(),
          loadUsage: (explicit) => controller.loadUsage(explicit),
          loadFreeUsage: (explicit) => controller.loadFreeUsage(explicit),
          loadHistory: (limit) => controller.loadHistory(limit),
          checkVersion: (force) => controller.checkVersion(force),
          clearNotice: () => controller.clearNotice(),
        }
      }

      /** Publish the current snapshot. */
      publish(patch = {}) {
        if (this.disposed) return
        this.store.set({ ...this.store.getSnapshot(), ...patch })
      }

      /**
       * One panel round trip; rejects with the host's own diagnostic.
       *
       * A plain same-origin `fetch` to the exact route Connection already
       * guards: the session cookie rides along automatically, and the host
       * answers every action as `{ ok, value? , error? }` so one code path
       * covers success and refusal.
       */
      async call(endpoint, payload) {
        if (this.ctx.get('connection') === undefined) throw new Error(this.t('panelUnavailable'))
        let response
        try {
          response = await fetch(PANEL_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint, payload: payload ?? {} }),
          })
        } catch (error) {
          throw new Error(`${this.t('panelUnavailable')} (${String(error?.message ?? error)})`)
        }
        if (!response.ok) throw new Error(`the Cline Connect panel route answered HTTP ${response.status}`)
        const result = await response.json().catch(() => null)
        if (result?.ok === true) return result.value
        throw new Error(result?.error?.message ?? 'the Cline Connect panel refused this request')
      }

      /** Run one action with busy/notice bookkeeping. */
      async run(label, action) {
        this.publish({ busy: label, notice: null })
        try {
          const value = await action()
          this.publish({ busy: null, error: null, action: value ?? this.store.getSnapshot().action })
          return value
        } catch (error) {
          this.publish({ busy: null, error: String(error?.message ?? error), action: null })
          return undefined
        }
      }

      /**
       * Run one automatic read: the busy flag, and nothing else.
       *
       * These run on mount, unprompted, and they fail for reasons the user
       * cannot act on (a stale host, a flaky gateway, a missing endpoint). The
       * card's own "no reading yet" state already says what is known, and their
       * retry buttons are right there, so a panel-level warning on every open
       * would be noise the user cannot clear. A user-triggered read goes through
       * {@link run} instead, where the banner IS the answer they asked for.
       */
      async readQuietly(label, action) {
        this.publish({ busy: label, notice: null })
        try {
          const value = await action()
          this.publish({ busy: null, error: null })
          return value
        } catch (error) {
          // Visible only to whoever is debugging the panel itself.
          console.warn('[cline-connect] automatic read failed:', String(error?.message ?? error))
          this.publish({ busy: null })
          return undefined
        }
      }

      /** Merge a fresh host state into the snapshot. */
      applyState(value) {
        const data = value?.accounts === undefined && value?.provider === undefined ? this.store.getSnapshot().data : value
        if (data !== undefined && data !== null && data.provider !== undefined) this.publish({ data, status: 'ready', error: null })
        return value
      }

      /** Re-read the whole panel state. */
      async refresh() {
        try {
          const value = await this.call('state', {})
          this.applyState(value)
        } catch (error) {
          this.publish({ status: 'error', error: String(error?.message ?? error) })
        }
      }

      /** Clear the transient notice. */
      clearNotice() {
        this.publish({ notice: null, error: null, action: null })
      }

      /** Store the key. The status line and masked hint are the confirmation. */
      async setKey(ref, value) {
        const result = await this.run('key', async () => await this.call('key.set', { ref, value }))
        if (result !== undefined) this.applyState(result)
      }

      /** Test a key without storing it. */
      async testKey(ref, value) {
        return await this.run('key', async () => {
          const result = await this.call('key.test', { ref, value })
          this.publish({
            notice: result.ok === true
              ? { kind: 'ok', text: `${result.label} · ok · ${ms(result.ms)}` }
              : { kind: 'err', text: `${result.label} · ${result.error || 'failed'}` },
          })
          return result
        })
      }

      /** Save a key and test it in one gesture. */
      async saveAndTest(ref, value) {
        const probe = await this.testKey(ref, value)
        if (probe?.ok === true) await this.setKey(ref, value)
      }

      /** Add or update an account. */
      async addAccount(payload) {
        const result = await this.run('account', async () => await this.call('account.add', payload))
        if (result !== undefined) {
          this.applyState(result)
          this.publish({ notice: { kind: 'ok', text: `${result.name} · ${result.apiKeyEnv}${result.keyStored ? ' · key stored' : ''}` } })
        }
      }

      /** Remove an account. */
      async removeAccount(name) {
        const result = await this.run('account', async () => await this.call('account.remove', { name }))
        if (result !== undefined) this.applyState(result)
      }

      /** Take one account in or out of the pool. */
      async setAccountEnabled(name, enabled) {
        const result = await this.run('account', async () => await this.call('account.enable', { name, enabled }))
        if (result !== undefined) this.applyState(result)
        return result
      }

      /** Switch account mode or the active account. */
      async setAccountMode(patch) {
        const result = await this.run('account', async () => await this.call('account.mode', patch))
        if (result !== undefined) this.applyState(result)
      }

      /** Persist one model's pin. */
      async pinModel(payload) {
        const result = await this.run('pin', async () => await this.call('model.pin', payload))
        if (result !== undefined) this.applyState(result)
        return result
      }

      /**
       * Show or hide one model in every picker this route feeds.
       *
       * Hiding never touches the subscription list, so the checkbox in the panel
       * is the whole undo.
       */
      async setModelVisible(model, visible) {
        const result = await this.run('visibility', async () => await this.call('model.visibility', { model, visible }))
        if (result !== undefined) this.applyState(result)
        return result
      }

      /**
       * Turn the `cline_connect_*` tools on or off.
       *
       * The host reads the setting when the plugin activates, so this cannot
       * change the running plugin: a tool already registered cannot be pulled
       * back out of a conversation's tool list. The host says as much in its
       * reply, and the panel relays it rather than implying the switch already
       * took effect.
       */
      async setToolsExposed(value) {
        const result = await this.run('tools', async () => await this.call('tools.expose', { value }))
        if (result !== undefined) this.applyState(result)
        return result
      }

      /**
       * Show, hide or swap every subscription model at once.
       *
       * One write for the whole set, so a bulk change cannot half-apply.
       */
      async setModelsVisibility(mode) {
        const result = await this.run('visibility', async () => await this.call('models.visibility', { mode }))
        if (result !== undefined) this.applyState(result)
        return result
      }

      /** Probe one model and surface the discovered channels. */
      async probeModel(model) {
        const result = await this.run('probe', async () => await this.call('model.probe', { model }))
        await this.refresh()
        if (result !== undefined) {
          this.publish({
            action: { kind: 'probe', model, data: result.result },
            notice: result.result?.ok === true
              ? { kind: 'ok', text: `${model} · ${result.result.pipeline || 'pipeline?'} · ${(result.result.upstreams ?? []).length} channel(s)` }
              : { kind: 'err', text: `${model} · ${result.result?.error || 'probe failed'}` },
          })
        }
        return result
      }

      /** Validate every known channel of one model. */
      async validateModel(model) {
        const result = await this.run('validate', async () => await this.call('model.validate', { model }))
        if (result !== undefined) {
          this.applyState(result)
          const summary = result.summary ?? {}
          this.publish({
            action: { kind: 'validate', model, data: result },
            notice: {
              kind: (summary.ok ?? 0) > 0 ? 'ok' : 'warn',
              text: `${model} · available=${summary.ok ?? 0} rate-limited=${summary.limited ?? 0} not-pinnable=${summary.bad ?? 0} auth-failed=${summary.auth ?? 0} unknown=${summary.unknown ?? 0}`,
            },
          })
        }
        return result
      }

      /** Try the stored (or a supplied) pin once, without persisting it. */
      async testModel(model, upstreams) {
        const result = await this.run('test', async () => await this.call('model.test', { model, upstreams }))
        await this.refresh()
        if (result !== undefined) {
          this.publish({
            action: { kind: 'test', model, data: result },
            notice: result.ok === true
              ? { kind: 'ok', text: `${model} · served by ${result.actual || '(auto)'} · ${ms(result.ms)}` }
              : { kind: 'err', text: `${model} · ${result.error || 'failed'}` },
          })
        }
        return result
      }

      /**
       * Read the official quota. Quiet by default: the card asks on mount, and a
       * gateway that cannot answer leaves the last good reading in place rather
       * than turning the section into an error.
       */
      async loadUsage(explicit = false) {
        const call = async () => await this.call('usage', {})
        const result = explicit === true ? await this.run('usage', call) : await this.readQuietly('usage', call)
        if (result !== undefined) this.applyState(result)
        return result
      }

      /**
       * Read the free-model breakdown.
       *
       * Quiet by default for the same reason as the quota read: the card asks
       * once on mount, and a gateway that cannot answer leaves the section in
       * its own "no reading" state. The reply is not merged into the panel
       * snapshot the way the quota is — it carries no provider state, only the
       * per-account buckets — so the caller keeps what it gets back.
       */
      async loadFreeUsage(explicit = false) {
        const call = async () => await this.call('freeUsage', {})
        return explicit === true ? await this.run('freeUsage', call) : await this.readQuietly('freeUsage', call)
      }

      /** Rescan the official subscription list. */
      async refreshModels() {
        const result = await this.run('models', async () => await this.call('models.refresh', {}))
        if (result !== undefined) {
          const current = this.store.getSnapshot()
          const data = result?.accounts === undefined && result?.provider === undefined ? current.data : result
          const addedCount = (result.added ?? []).length
          const removedCount = (result.removed ?? []).length
          const changeText = removedCount > 0 ? `+${addedCount}/-${removedCount}` : `+${addedCount}`
          this.publish({
            data,
            status: 'ready',
            error: null,
            notice: { kind: 'ok', text: `${changeText} · ${(result.sources ?? []).join(', ')}` },
          })
        }
        return result
      }

      /** Drop every pin for one model, returning it to automatic routing. */
      async resetModel(model) {
        const result = await this.pinModel({ model, upstreams: [], exclude: [], sort: 'none' })
        if (result !== undefined) this.publish({ notice: { kind: 'ok', text: `${model} · ${this.t('auto')}` } })
        return result
      }

      async loadHistory(limit) {
        return await this.run('history', async () => await this.call('history', { limit: limit ?? 25 }))
      }

      /**
       * Ask the host whether a newer release of this plugin is published.
       *
       * Quiet on mount — the host caches the reading for ten minutes, so a reopened
       * panel costs one GitHub call at most — and loud when the user presses the
       * button, because "GitHub is unreachable" is the answer they asked for.
       */
      async checkVersion(force = false) {
        const call = async () => await this.call('version', { force: force === true })
        return force === true ? await this.run('version', call) : await this.readQuietly('version', call)
      }
    }

    //#endregion

    //#region components

    /** One inline notice line. */
    function Notice(props) {
      if (props.notice === undefined || props.notice === null) return null
      const kind = props.notice.kind === 'ok' ? 'cc-msg-ok' : props.notice.kind === 'warn' ? 'cc-msg-warn' : 'cc-msg-err'
      return h('div', { className: `cc-msg ${kind}`, role: 'status' }, props.notice.text)
    }

    /** A dependency-free coloured dot. */
    function Dot(props) {
      return h('span', { className: 'cc-dot', style: { background: props.color }, title: props.title })
    }

    /**
     * The disclosure chevron, drawn by this plugin.
     *
     * The host publishes an icon set, but it is not a module this bundle may
     * take. Its export was renamed between host releases — the 0.1.2–0.1.5 line
     * shipped `IconChevronDownOutline14`, 0.1.6+ the artwork / regular / medium
     * triple — and a name that resolves to `undefined` makes `h(undefined)`
     * throw, which blanks the whole card rather than just the chevron. The
     * artwork is one path of SVG, so it is copied here; the caller still passes
     * the `cc-` class that rotates it.
     */
    function Chevron(props) {
      return h('svg', {
        className: props.className,
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', {
        d: 'M4 6.5 8 10.5 12 6.5',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    /**
     * The API-key field, shared by the panel and the Models card.
     *
     * `inline` drops the card wrapper for callers that already sit inside one —
     * the accounts card draws the field as the last row of its own table.
     */
    function KeyField(props) {
      const { t, account, disabled, onSave, onTest, onSaveTest, busy, inline } = props
      const [value, setValue] = React.useState('')
      const entered = value.trim().length > 0
      const row = h('div', { key: 'row', className: 'cc-row' }, [
        h('input', {
          key: 'input',
          className: 'cc-input cc-grow',
          type: 'password',
          autoComplete: 'off',
          spellCheck: false,
          value,
          placeholder: t('keyPlaceholder'),
          'aria-label': t('keyValue'),
          disabled,
          onChange: (event) => setValue(event.target.value),
        }),
        // Least to most committal: check the value, store it as-is, or store it
        // only once a real request has proved it works.
        h('button', {
          key: 'test', type: 'button', className: 'cc-btn',
          disabled: disabled || !entered,
          onClick: () => onTest(value.trim()),
        }, t('test')),
        h('button', {
          key: 'saveOnly', type: 'button', className: 'cc-btn',
          disabled: disabled || !entered,
          onClick: () => { onSave(value.trim()); setValue('') },
        }, t('save')),
        h('button', {
          key: 'save', type: 'button', className: 'cc-btn cc-btn-primary',
          disabled: disabled || !entered,
          onClick: () => { onSaveTest(value.trim()); setValue('') },
        }, t('saveTest')),
        busy ? h('span', { key: 'b', className: 'cc-muted' }, t('busy')) : null,
      ])
      return inline === true ? row : h('div', { className: 'cc-card' }, [row])
    }

    /** The channel chooser for one model. */
    function ChannelPicker(props) {
      const { t, model, disabled, onPin } = props
      if (model.upstreams.length === 0) return h('div', { className: 'cc-muted' }, t('noChannels'))
      const verdicts = new Map((model.upstreamStatus ?? []).map((entry) => [entry.upstream, entry]))
      return h('div', { className: 'cc-row' }, [
        h('span', { key: 'label', className: 'cc-muted' }, t('channels')),
        h('span', { key: 'chips', className: 'cc-chips' }, model.upstreams.map((upstream) => {
          const pinned = model.pinned.includes(upstream)
          const excluded = model.excluded.includes(upstream)
          const verdict = verdicts.get(upstream)
          const detail = verdict === undefined
            ? ''
            : ` · ${VERDICT[verdict.status] ?? verdict.status}${verdict.note ? `\n${verdict.note}` : ''}`
          return h('span', { key: upstream, className: `cc-chip${pinned ? ' cc-chip-on' : ''}${excluded ? ' cc-chip-excluded' : ''}` }, [
            h('span', {
              key: 'pin',
              role: 'button',
              tabIndex: 0,
              title: `${upstream}${detail}`,
              onClick: () => {
                if (disabled) return
                const next = pinned ? model.pinned.filter((name) => name !== upstream) : [...model.pinned, upstream]
                onPin({ model: model.id, upstreams: next })
              },
            }, [
              h('span', { key: 'dot', style: { marginRight: 5 } }, h(Dot, { color: verdictColor(verdict?.status ?? 'unknown'), title: VERDICT[verdict?.status ?? 'unknown'] })),
              upstream,
            ]),
            h('span', {
              key: 'ex',
              role: 'button',
              tabIndex: 0,
              title: excluded ? 'un-exclude' : 'exclude',
              onClick: () => {
                if (disabled) return
                const next = excluded ? model.excluded.filter((name) => name !== upstream) : [...model.excluded, upstream]
                onPin({ model: model.id, exclude: next })
              },
            }, '⊘'),
          ])
        })),
      ])
    }

    /**
     * One model row.
     *
     * The default view is deliberately just identity, the checkbox that decides
     * whether any picker offers this model, and the one action that matters. The
     * finer pin actions and the channel list live behind the expander.
     *
     * Discover channels, validate them, and choose a pin explicitly. Validation
     * costs one real request per channel; it does not change the stored pin.
     */
    function ModelRow(props) {
      const { t, model, disabled, actions } = props
      const [open, setOpen] = React.useState(false)
      const hidden = model.hidden === true
      const pinnedLabel = model.pinned.length === 0 ? t('auto') : model.pinned.join(' › ')
      const action = (key, label, run) => h('button', {
        key, type: 'button', className: 'cc-btn', disabled, onClick: () => run(model.id),
      }, label)
      return h('div', { className: `cc-model${hidden ? ' cc-model-hidden' : ''}` }, [
        h('div', { key: 'head', className: 'cc-row' }, [
          h('input', {
            key: 'vis',
            type: 'checkbox',
            className: 'cc-check',
            checked: !hidden,
            disabled,
            title: t('visible'),
            'aria-label': `${t('visible')}: ${model.id}`,
            onChange: (event) => actions.setModelVisible(model.id, event.target.checked),
          }),
          h('span', { key: 'name', className: 'cc-mono cc-grow' }, model.id),
          // The badge is the point of this plugin, so it follows the host's own
          // verdict (`model.free`) instead of re-parsing the id in the render
          // layer: two prefix checks would eventually disagree.
          model.free === true ? h('span', { key: 'free', className: 'cc-chip cc-chip-free', title: t('freeBadgeHint') }, t('freeBadge')) : null,
          hidden ? h('span', { key: 'off', className: 'cc-muted' }, t('hiddenTag')) : null,
          h('span', { key: 'pin', className: 'cc-muted cc-mono' }, `${t('pinned')}: ${pinnedLabel}`),
          h('button', {
            key: 'more', type: 'button', className: 'cc-btn', title: t('channels'),
            onClick: () => setOpen(!open),
          }, open ? '▾' : '▸'),
        ]),
        open ? h('div', { key: 'detail', className: 'cc-panel' }, [
          h('div', { key: 'actions', className: 'cc-row' }, [
            action('probe', t('probe'), actions.probeModel),
            action('validate', t('validate'), actions.validateModel),
            action('test', t('testPin'), actions.testModel),
            action('reset', t('reset'), actions.resetModel),
          ]),
          model.upstreams.length > 0
            ? h(ChannelPicker, { key: 'channels', t, model, disabled, onPin: (payload) => actions.pinModel(payload) })
            : h('div', { key: 'none', className: 'cc-muted' }, t('noChannels')),
        ]) : null,
      ])
    }

    /**
     * One account row.
     *
     * Identity stacks name over credential reference: the reference is what a
     * user needs when the key is missing ("store it at …") and what tells two
     * accounts apart, but it is never the first thing being read.
     */
    function AccountRow(props) {
      const { t, account, disabled, active, pooled, removable, actions } = props
      const off = account.enabled === false
      return h('tr', { className: `cc-acct-row${off ? ' cc-acct-row-off' : ''}` }, [
        h('td', { key: 'state' }, h('span', { className: 'cc-acct-state' }, [
          // The checkbox is what decides whether the router may use this account;
          // the dot beside it still says whether its key is stored.
          h('input', {
            key: 'on',
            type: 'checkbox',
            className: 'cc-check',
            checked: !off,
            disabled,
            title: t('accountsEnabled'),
            'aria-label': `${t('accountsEnabled')}: ${account.key}`,
            onChange: (event) => actions.setAccountEnabled(account.key, event.target.checked),
          }),
          h(Dot, {
            key: 'dot',
            color: account.keyConfigured ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary)',
            title: account.keyConfigured ? t('keyOk') : t('keyMissing'),
          }),
        ])),
        h('td', { key: 'id' }, h('span', { className: 'cc-acct-id' }, [
          h('span', { key: 'name', className: 'cc-acct-name' }, [
            h('span', { key: 'text' }, account.displayName),
            off ? h('span', { key: 'off', className: 'cc-tag' }, t('accountsOff')) : null,
            active ? h('span', { key: 'tag', className: 'cc-tag' }, t('accountsActive')) : null,
          ]),
          h('span', { key: 'ref', className: 'cc-acct-ref', title: account.apiKeyEnv }, account.apiKeyEnv),
        ])),
        h('td', { key: 'hint', className: 'cc-acct-hint', title: account.keyHint }, account.keyConfigured ? account.keyHint : t('keyNone')),
        h('td', { key: 'actions' }, h('span', { className: 'cc-acct-actions' }, [
          h('button', {
            key: 'test', type: 'button', className: 'cc-btn', disabled,
            onClick: () => actions.testKey(account.apiKeyEnv, ''),
          }, t('test')),
          active || !pooled ? null : h('button', {
            key: 'use', type: 'button', className: 'cc-btn', disabled,
            onClick: () => actions.setAccountMode({ active: account.key }),
          }, t('accountsSetActive')),
          h('button', {
            key: 'remove', type: 'button', className: 'cc-btn cc-btn-danger',
            // Only an explicit account can be removed: a lone implicit account is
            // the top-level key and its `apiKeyEnv`, so there is no entry to
            // delete. Gating on the pool size instead left this dead for the
            // common single-account case.
            disabled: disabled || !removable,
            onClick: () => actions.removeAccount(account.key),
          }, t('remove')),
        ])),
      ])
    }

    /**
     * The accounts card.
     *
     * The key editor belongs to the account selected for editing. It stays put
     * while requests rotate or cool down; quota follows the effective account.
     *
     * It folds like every other section, with one exception: before an account is
     * usable this is the only thing left to act on, so it opens itself. A card
     * whose every section is folded and empty is a dead end.
     */
    function AccountsCard(props) {
      const { t, data, disabled, ready, actions } = props
      const [name, setName] = React.useState('')
      const [key, setKey] = React.useState('')
      const [open, setOpen] = React.useState(ready !== true)
      const pooled = data.accounts.length > 1
      const single = data.accountMode !== 'roundrobin'
      const fallback = data.accounts.find((account) => account.enabled)?.key ?? ''
      const activeKey = data.activeAccount === '' ? fallback : data.activeAccount
      // Editing is an explicit account choice, independent of request rotation.
      const target = data.accounts.find((account) => account.key === activeKey) ?? data.accounts[0]
      // A row can be deleted only when an explicit `accounts` entry stands behind
      // it; a lone implicit account is the top-level key, so deleting it would
      // mean deleting the route's own configuration.
      const removable = (account) => account.declared !== false
      return h('details', {
        className: 'cc-card',
        open,
        onToggle: (event) => setOpen(event.currentTarget.open),
      }, [
        foldHeader(`${t('accounts')} · ${fill(t('accountsCount'), { n: data.accounts.length })}`),
        // Everything else in this card is downstream of a stored key, so say so
        // here rather than leaving an unconfigured panel looking broken.
        ready === true ? null : h('div', { key: 'firstrun', className: 'cc-muted' }, t('accountsFirstRun')),
        // A pool of one account needs none of this; it appears with the second.
        pooled ? h('div', { key: 'mode', className: 'cc-row' }, [
          h('span', { key: 'ml', className: 'cc-muted' }, t('accountMode')),
          h('select', {
            key: 'ms', className: 'cc-select', value: data.accountMode, disabled,
            'aria-label': t('accountMode'),
            onChange: (event) => actions.setAccountMode({ mode: event.target.value }),
          }, [
            h('option', { key: 'single', value: 'single' }, t('modeSingle')),
            h('option', { key: 'rr', value: 'roundrobin' }, t('modeRoundrobin')),
          ]),
          single ? h('span', { key: 'al', className: 'cc-muted' }, t('active')) : null,
          single ? h('select', {
            key: 'as', className: 'cc-select', value: data.activeAccount, disabled,
            'aria-label': t('active'),
            onChange: (event) => actions.setAccountMode({ active: event.target.value }),
          }, [h('option', { key: '', value: '' }, t('accountsFirst'))].concat(
            data.accounts.map((account) => h('option', { key: account.key, value: account.key }, account.key)),
          )) : null,
          // How the pool picks an account is not visible from the row, so it is
          // written down rather than left to be inferred from the mode name.
          h('div', { key: 'hint', className: 'cc-muted' }, t('accountsPoolHint')),
        ]) : null,
        h('table', { key: 'table', className: 'cc-acct-table' }, [
          h('colgroup', { key: 'cols' }, [
            h('col', { key: 'dot', className: 'cc-acct-col-dot' }),
            h('col', { key: 'id' }),
            h('col', { key: 'hint', className: 'cc-acct-col-hint' }),
            h('col', { key: 'actions', className: 'cc-acct-col-actions' }),
          ]),
          h('thead', { key: 'head' }, h('tr', { key: 'r' }, [
            h('th', { key: 'dot' }, ''),
            h('th', { key: 'name' }, t('accountName')),
            h('th', { key: 'key' }, t('accountsKey')),
            h('th', { key: 'actions' }, t('accountsActions')),
          ])),
          h('tbody', { key: 'body' }, data.accounts.map((account) => h(AccountRow, {
            key: account.key,
            t,
            account,
            disabled,
            pooled,
            removable: removable(account),
            active: single && account.key === activeKey,
            actions,
          }))),
        ]),
        target === undefined ? null : h('div', { key: 'key', className: 'cc-row cc-acct-key' }, [
          h('span', { key: 'l', className: 'cc-muted' }, fill(t('accountsFor'), { name: target.displayName })),
          h(KeyField, {
            key: `field:${target.key}:${target.apiKeyEnv}`,
            t,
            account: target,
            disabled,
            busy: false,
            inline: true,
            onSave: (value) => actions.setKey(target.apiKeyEnv, value),
            onTest: (value) => actions.testKey(target.apiKeyEnv, value),
            onSaveTest: (value) => actions.saveAndTest(target.apiKeyEnv, value),
          }),
        ]),
        h('div', { key: 'add', className: 'cc-row cc-acct-add' }, [
          h('input', {
            key: 'n', className: 'cc-input cc-acct-newname', placeholder: t('accountName'), value: name, disabled,
            'aria-label': t('accountName'),
            onChange: (event) => setName(event.target.value),
          }),
          h('input', {
            key: 'k', className: 'cc-input cc-grow', type: 'password', autoComplete: 'off',
            placeholder: t('keyPlaceholder'), value: key, disabled,
            'aria-label': t('keyValue'),
            onChange: (event) => setKey(event.target.value),
          }),
          h('button', {
            key: 'add', type: 'button', className: 'cc-btn',
            disabled: disabled || name.trim().length === 0,
            onClick: () => { actions.addAccount({ name: name.trim(), key: key.trim() }); setName(''); setKey('') },
          }, t('addAccount')),
        ]),
      ])
    }

    /**
     * One fold-away section header.
     *
     * The chevron is explicit because the summary is laid out as a flex row,
     * which drops the browser's own disclosure marker — without it a folded
     * section looks like a plain card title, not something to open.
     */
    function foldHeader(title) {
      return h('summary', { key: 'sum', className: 'cc-card-title cc-fold' }, [
        h('span', { key: 'l' }, title),
        h(Chevron, { key: 'chevron', className: 'cc-chevron' }),
      ])
    }

    /**
     * The models card: a fold-away section, like the request history.
     *
     * It is the longest block in the panel and the one a user comes back to
     * least, so it folds; the count in its header is what keeps a folded section
     * informative.
     */
    function ModelsCard(props) {
      const { t, data, disabled, busy, actions } = props
      const hidden = Number(data.hiddenModels ?? 0)
      // The card folds, so the count is the only thing visible until it is opened.
      // Naming the free models here is what makes the plugin's selling point
      // visible at a glance rather than one click away.
      const free = data.models.filter((model) => model.free === true).length
      return h('details', { className: 'cc-card' }, [
        foldHeader(`${t('models')} · ${fill(t('modelsCount'), { n: data.models.length })}${free === 0 ? '' : ` · ${fill(t('freeModels'), { n: free })}`}${hidden === 0 ? '' : ` · ${fill(t('hiddenModels'), { n: hidden })}`}`),
        // The refresh and the bulk checkbox actions sit in the body, not the
        // header: a button inside a summary would also toggle the fold.
        h('div', { key: 'bar', className: 'cc-row' }, [
          h('button', {
            key: 'all', type: 'button', className: 'cc-btn', disabled,
            onClick: () => actions.setModelsVisibility('all'),
          }, t('selectAll')),
          h('button', {
            key: 'invert', type: 'button', className: 'cc-btn', disabled,
            onClick: () => actions.setModelsVisibility('invert'),
          }, t('invertSelection')),
          h('button', {
            key: 'r', type: 'button', className: 'cc-btn cc-grow-end', disabled,
            onClick: () => actions.refreshModels(),
          }, t('refresh')),
        ]),
        h('div', { key: 'rows', className: 'cc-table' }, data.models.map((model) => h(ModelRow, {
          key: model.id, t, model, disabled, busy, actions,
        }))),
      ])
    }

    /**
     * The rows one history entry contributes: the request itself, plus the
     * failure line when there was one.
     *
     * The columns are the four facts a user asks in order ("did the request I
     * just made work?"), and the whole row is a tooltip so a truncated model id
     * or error is still recoverable.
     *
     * @returns one `<tr>`, or two when the request failed.
     */
    function historyRows(t, entry, showAccount) {
      const failed = String(entry.error ?? '') !== ''
      const upstream = `${entry.provider || t('historyAuto')}${showAccount && entry.account !== '' ? ` · ${entry.account}` : ''}`
      // The route prefix is constant across every row of this list, so it is
      // carried in the tooltip instead of eating the width the model name needs
      // — centred text that overflows loses BOTH ends, not just the tail.
      const label = String(entry.model).replace(/^(?:cline-pass|cline-free)\//, '')
      const figures = latency(entry)
      const row = h('tr', {
        key: 'row',
        // The whole row restates itself on hover, including the figures the three
        // stacked lines already show, so a screenshot or a copy keeps the facts.
        title: [
          entry.model,
          `${upstream} · ${tokenSummary(entry)}`,
          `${t('historyFirstChunk')} ${figures.first} · ${t('historyTotal')} ${figures.total} · ${t('historyRate')} ${figures.rate}`,
          entry.effort === '' ? '' : `${t('historyEffort')} ${entry.effort}`,
          failed ? entry.error : '',
        ].filter((line) => line !== '').join('\n'),
      }, [
        h('td', { key: 'dot' }, h(Dot, {
          color: failed ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)',
          title: failed ? entry.error : 'ok',
        })),
        h('td', { key: 'when', className: 'cc-history-when' }, historyStamp(entry.ts)),
        // Model and its serving channel share a cell: the panel is ~480px wide and
        // a column of its own squeezed the model id — the one identifier a reader
        // scans for — down to a truncated stub.
        h('td', { key: 'model', className: 'cc-history-model-cell' }, h('div', { className: 'cc-history-model-stack' }, [
          h('span', { key: 'name', className: 'cc-history-model', title: entry.model }, label),
          h('span', { key: 'upstream', className: 'cc-history-meta' }, [
            h('span', { key: 'provider', className: 'cc-tag' }, entry.provider || t('historyAuto')),
            showAccount && entry.account !== '' ? h('span', { key: 'account', className: 'cc-tag cc-tag-quiet' }, entry.account) : null,
          ]),
        ])),
        // The tooltip carries the EXACT figures, not the bounded rendering: the cell
        // rounds "236,288" to "236.3k" to keep its width, so the tooltip is the
        // only place the real digits survive.
        h('td', {
          key: 'tokens',
          className: 'cc-history-tokens',
          title: `${tokenSummaryExact(entry)}\n${t('historyTokensHint')}`,
        }, tokenSummary(entry)),
        h('td', { key: 'load', className: 'cc-history-load' }, [
          h('span', { key: 'first', className: 'cc-history-load-row' }, [
            h('span', { key: 'k', className: 'cc-muted' }, t('historyFirstChunk')),
            h('span', { key: 'v' }, latency(entry).first),
          ]),
          h('span', { key: 'total', className: 'cc-history-load-row' }, [
            h('span', { key: 'k', className: 'cc-muted' }, t('historyTotal')),
            h('span', { key: 'v' }, latency(entry).total),
          ]),
          h('span', { key: 'rate', className: 'cc-history-load-row' }, [
            h('span', { key: 'k', className: 'cc-muted' }, t('historyRate')),
            h('span', { key: 'v' }, latency(entry).rate),
          ]),
        ]),
      ])
      if (!failed) return [row]
      // Two empty cells keep the message starting under the model column.
      return [row, h('tr', { key: 'error' }, [
        h('td', { key: 'a' }, ''),
        h('td', { key: 'b' }, ''),
        // From the model column to the end: model, upstream, tokens, latency.
        h('td', { key: 'message', className: 'cc-history-error', colSpan: 3, title: entry.error }, entry.error),
      ])]
    }

    /** The request-history body, rendered inside the panel's fold-away section. */
    function HistoryCard(props) {
      const { t, entries, disabled, actions, showAccount } = props
      return h('div', { className: 'cc-panel' }, [
        h('div', { key: 'bar', className: 'cc-row' }, [
          h('button', { key: 'r', type: 'button', className: 'cc-btn', disabled, onClick: () => actions.loadHistory(25) }, t('refresh')),
        ]),
        entries === null
          ? h('div', { key: 'empty', className: 'cc-muted' }, t('noHistory'))
          : h('div', { key: 'table', className: 'cc-history' }, h('table', { className: 'cc-history-table' }, [
            h('colgroup', { key: 'cols' }, [
              h('col', { key: 'dot', className: 'cc-history-col-dot' }),
              h('col', { key: 'when', className: 'cc-history-col-when' }),
              h('col', { key: 'model' }),
              h('col', { key: 'tokens', className: 'cc-history-col-tokens' }),
              h('col', { key: 'load', className: 'cc-history-col-load' }),
            ]),
            h('thead', { key: 'head' }, h('tr', { key: 'r' }, [
              h('th', { key: 'dot' }, ''),
              h('th', { key: 'when' }, t('historyWhen')),
              h('th', { key: 'model' }, `${t('historyModel')} / ${t('historyUpstream')}`),
              h('th', { key: 'tokens', className: 'cc-history-tokens' }, t('historyTokens')),
              h('th', { key: 'load', className: 'cc-history-load' }, t('historyLoad')),
            ])),
            h('tbody', { key: 'body' }, entries.flatMap((entry) => historyRows(t, entry, showAccount))),
          ])),
      ])
    }

    /** Select cached quota without substituting another account's reading. */
    function usageIndex(accounts, effectiveAccount, picked) {
      if (accounts.length === 0) return -1
      if (picked !== null) return Math.min(Math.max(picked, 0), accounts.length - 1)
      // Undefined is an older host; an explicit empty string means no account.
      if (effectiveAccount !== undefined) {
        if (effectiveAccount === '') return -1
        return accounts.findIndex((entry) => String(entry.account) === String(effectiveAccount))
      }
      const usable = accounts.findIndex((entry) => entry.ok === true)
      return Math.max(0, usable)
    }

    /**
     * The official quota card.
     *
     * The window list is whatever the gateway reported, in its order, so a window
     * Cline adds later shows up here without this file naming it — the three
     * known windows only contribute their localized labels.
     *
     * One reading per window: the official percentage, plus when it resets.
     */
    function UsageCard(props) {
      const { t, usage, disabled, actions, unavailable, activeAccount, accountMode, effectiveAccount } = props
      const fetched = Number(usage?.fetchedAt ?? 0) > 0
      const accounts = usage?.accounts ?? []
      // A pool is shown one account at a time. Stacking every account turned the
      // card into a wall of bars and pushed the one reading a user came for below
      // the fold, so the arrows — not a scroll — are what moves between accounts.
      //
      // `null` means "still following the account a request would use". Opening on
      // the first entry puts the reading a user came for behind an arrow, and the
      // reading is per account, so the first entry answers a question about a key
      // that may not be about to be spent. Once they page, their choice wins: the
      // cursor moving underneath must not yank the card away mid-review.
      const [picked, setPicked] = React.useState(null)
      // The selection is an index, so a shorter list — an account removed, or its
      // key deleted — can leave it past the end. Clamp instead of rendering nothing.
      const index = usageIndex(accounts, effectiveAccount, picked)
      const account = accounts[index]
      const step = (delta) => setPicked((accounts.length + index + delta) % accounts.length)
      const windowRow = (type, key, limit) => {
        const percent = Math.max(0, Math.min(100, Number(limit.percentUsed ?? 0)))
        const left = countdown(t, limit.resetsAt)
        // The percentage is the whole reading: it comes from the official quota
        // endpoint, is always populated, and needs no interpretation. The money
        // and token figures that used to sit under it were derived, unverifiable
        // and different from the gateway's own accounting, so they are gone.
        return h('div', { key: type, className: 'cc-usage-item' }, [
          h('div', { key: 'head', className: 'cc-usage-head' }, [
            h('span', { key: 'l', className: 'cc-usage-label' }, key === '' ? type : t(key)),
            h('span', { key: 'v', className: 'cc-usage-value' }, `${Math.round(percent)}%`),
          ]),
          h('div', { key: 'track', className: 'cc-usage-track' },
            h('div', { key: 'fill', className: 'cc-usage-fill', style: { width: `${percent}%`, background: usageColor(percent) } })),
          left === '' ? null : h('div', { key: 'note', className: 'cc-usage-note' }, fill(t('usageResetsIn'), { t: left })),
        ])
      }
      /**
       * One account's block: a name row that doubles as the account switcher,
       * then its windows.
       *
       * The arrows only exist in a pool. With a single account there is nowhere
       * to go, so they would be two controls that cannot do anything.
       */
      const accountGroup = (account, at) => {
        const limits = account.limits ?? []
        const known = new Map(limits.map((limit) => [String(limit.type), limit]))
        const windows = [
          ...USAGE_WINDOWS.filter(([type]) => known.has(type)).map(([type, key]) => [type, key, known.get(type)]),
          ...limits
            .filter((limit) => !USAGE_WINDOWS.some(([type]) => type === String(limit.type)))
            .map((limit) => [String(limit.type), '', limit]),
        ]
        const inner = account.ok !== true
          ? h('div', { key: 'err', className: 'cc-muted' }, `${t('usageUnavailable')}${account.error ? ` ${account.error}` : ''}`)
          : windows.length === 0
            ? h('div', { key: 'none', className: 'cc-muted' }, t('usageEmpty'))
            : h('div', { key: 'bars', className: 'cc-usage' }, windows.map(([type, key, limit]) => windowRow(type, key, limit)))
        const pooled = accounts.length > 1
        const label = account.displayName || account.account
        // Only a single-account pool has a "current" account: in round-robin every
        // request rotates, so a badge here would name a fact that keeps changing.
        const isActive = accountMode !== 'roundrobin' && activeAccount !== '' && account.account === activeAccount
        const head = pooled
          ? h('div', { key: 'name', className: 'cc-usage-pager' }, [
            // Switching accounts re-reads nothing: the whole pool was read in one
            // request, so paging is local and stays available while the panel is
            // busy or the settings service is read-only.
            h('button', {
              key: 'prev', type: 'button', className: 'cc-usage-nav',
              title: t('usagePrev'), 'aria-label': t('usagePrev'),
              onClick: () => step(-1),
            }, '‹'),
            h('div', { key: 'who', className: 'cc-usage-name' }, [
              h('span', { key: 'n', className: 'cc-usage-acct', title: label }, label),
              isActive ? h('span', { key: 'a', className: 'cc-usage-active' }, t('accountsActive')) : null,
              h('span', { key: 'p', className: 'cc-usage-pos' }, fill(t('usagePosition'), { i: at + 1, n: accounts.length })),
            ]),
            h('button', {
              key: 'next', type: 'button', className: 'cc-usage-nav',
              title: t('usageNext'), 'aria-label': t('usageNext'),
              onClick: () => step(1),
            }, '›'),
          ])
          : null
        return h('div', { key: String(account.account), className: 'cc-usage-group' }, [head, inner])
      }
      let body
      if (!fetched) body = h('div', { key: 'wait', className: 'cc-muted' }, unavailable === true ? t('usageUnavailable') : t('usageLoading'))
      else if (account === undefined && effectiveAccount !== undefined) {
        body = h('div', { key: 'wait', className: 'cc-muted' }, effectiveAccount === '' || unavailable === true ? t('usageUnavailable') : t('usageLoading'))
      }
      else if (accounts.length === 0) body = h('div', { key: 'none', className: 'cc-muted' }, t('usageEmpty'))
      // `index` is the account on screen; its own key remounts the block so the
      // windows never animate between two accounts' readings.
      else body = h('div', { key: 'groups', className: 'cc-usage-groups' }, accountGroup(account, index))
      const name = account?.account ?? effectiveAccount
      const title = accounts.length > 1
        ? `${t('usageTitle')} · ${fill(t('accountsCount'), { n: accounts.length })}`
        : `${t('usageTitle')}${name ? ` · ${fill(t('usageAccount'), { name })}` : ''}`
      return h('div', { className: 'cc-card' }, [
        h('div', { key: 'title', className: 'cc-card-title' }, [
          h('span', { key: 'l' }, title),
          h('span', { key: 'btns', className: 'cc-inline' }, [
            h('button', { key: 'r', type: 'button', className: 'cc-btn', disabled, onClick: () => actions.loadUsage(true) }, t('usageRefresh')),
          ]),
        ]),
        body,
      ])
    }

    /**
     * The free-model usage card.
     *
     * There is no free-tier percentage to draw, and this card does not pretend
     * otherwise: the gateway's three quota windows are account-wide, so a
     * free-only share of them cannot be derived. What the gateway does publish
     * is per-model usage, and `aiModelTypeName` separates `cline-free` from
     * `cline-pass`, so what the free models actually spent is measurable even
     * though the cap above them is not. The note at the foot of the card says
     * the shared-window part out loud, because a reader who is not told will
     * reasonably assume free calls do not count against the bars above.
     */
    function FreeUsageCard(props) {
      const { t, reading, unavailable, disabled, actions } = props
      const accounts = reading?.accounts ?? []
      const range = reading?.range ?? accounts[0]?.range
      /** One bucket as a tile. The token count is the reading; the rest annotates it. */
      const tile = (key, label, bucket) => h('div', { key, className: 'cc-usage-item' }, [
        h('div', { key: 'head', className: 'cc-usage-head' }, [
          h('span', { key: 'l', className: 'cc-usage-label' }, label),
          h('span', { key: 'c', className: 'cc-usage-tokens' }, `${t('freeUsageCost')} ${formatMicroUsd(bucket?.costUsd)}`),
        ]),
        h('div', { key: 'v', className: 'cc-usage-value' }, fill(t('freeUsageTokens'), { n: formatTokenCount(bucket?.tokens) })),
        h('div', { key: 'n', className: 'cc-usage-note' }, fill(t('freeUsageModels'), { n: Number(bucket?.models ?? 0) })),
      ])
      const breakdown = (bucket) => {
        // Only `today` carries a per-model split; the week bucket deliberately
        // arrives with an empty one, so it is never asked for here.
        const rows = bucket?.byModel ?? []
        if (rows.length === 0) return h('div', { key: 'none', className: 'cc-usage-note' }, t('freeUsageEmpty'))
        return h('div', { key: 'rows', className: 'cc-usage-model-rows' }, rows.map((row) => h('div', {
          key: String(row.model),
          className: 'cc-free-model-row',
          // The columns are bounded, so the exact figures stay in the tooltip.
          title: `${row.model} · ${Number(row.tokens ?? 0).toLocaleString('en-US')} tokens · ${formatMicroUsd(row.costUsd)}`,
        }, [
          h('span', { key: 'n', className: 'cc-free-model-name' }, String(row.model)),
          h('span', { key: 't', className: 'cc-free-model-tokens' }, formatTokenCount(row.tokens)),
          h('span', { key: 'c', className: 'cc-free-model-cost' }, formatMicroUsd(row.costUsd)),
        ])))
      }
      const group = (account) => {
        const label = account.displayName || account.account
        // A pool names each block; a single account needs no label at all.
        const head = accounts.length > 1
          ? h('div', { key: 'name', className: 'cc-usage-name' }, h('span', { key: 'n', className: 'cc-usage-acct', title: label }, label))
          : null
        const inner = account.ok !== true
          ? h('div', { key: 'err', className: 'cc-muted' }, `${t('freeUsageUnavailable')}${account.error ? ` ${account.error}` : ''}`)
          : h('div', { key: 'body', className: 'cc-usage-groups' }, [
            h('div', { key: 'tiles', className: 'cc-usage' }, [
              tile('today', t('freeUsageToday'), account.today),
              tile('week', t('freeUsageWeek'), account.week),
            ]),
            h('div', { key: 'models', className: 'cc-usage-models' }, [
              h('div', { key: 'sum', className: 'cc-usage-label' }, t('freeUsageByModel')),
              breakdown(account.today),
            ]),
          ])
        return h('div', { key: String(account.account), className: 'cc-usage-group' }, [head, inner])
      }
      let body
      if (reading === null) body = h('div', { key: 'wait', className: 'cc-muted' }, unavailable === true ? t('freeUsageUnavailable') : t('freeUsageLoading'))
      else if (accounts.length === 0) body = h('div', { key: 'none', className: 'cc-muted' }, t('freeUsageUnavailable'))
      else body = h('div', { key: 'groups', className: 'cc-usage-groups' }, accounts.map(group))
      return h('div', { className: 'cc-card' }, [
        h('div', { key: 'title', className: 'cc-card-title' }, [
          h('span', { key: 'l' }, range === undefined
            ? t('freeUsageTitle')
            : `${t('freeUsageTitle')} · ${fill(t('freeUsageRange'), { start: range.start, end: range.end })}`),
          h('span', { key: 'btns', className: 'cc-inline' }, [
            h('button', { key: 'r', type: 'button', className: 'cc-btn', disabled, onClick: () => actions.loadFreeUsage(true) }, t('usageRefresh')),
          ]),
        ]),
        body,
        // The caveat belongs to the card rather than to one account's block: it
        // is a fact about the gateway, and it is why no percentage is drawn.
        h('div', { key: 'note', className: 'cc-free-note' }, t('freeUsageNote')),
      ])
    }

    /**
     * Version and update card.
     *
     * The plugin is installed from `github:` and the profile's lockfile pins one
     * commit, so installing any other plugin can put the old code back without a
     * word. This card is the only place that says so: what is installed, what the
     * lock names, what the repository publishes now, and the exact command that
     * upgrades this profile — with the bundled pnpm path when it can be resolved,
     * because the system pnpm may use a different store and refuse outright.
     */
    function VersionCard(props) {
      const t = props.t
      const [reading, setReading] = React.useState(props.initial ?? null)
      const [copied, setCopied] = React.useState(false)
      // Set when the host answered nothing at all — the signature of a panel whose
      // browser half is newer than the host half it is talking to, which happens
      // after an install that has not been followed by a restart yet.
      const [failed, setFailed] = React.useState(false)
      const asked = React.useRef(false)
      const accept = (result) => {
        if (result !== undefined && result !== null && result.version !== undefined) {
          setReading(result.version)
          setFailed(false)
        } else {
          setFailed(true)
        }
      }
      React.useEffect(() => {
        if (asked.current) return
        asked.current = true
        void props.actions.checkVersion(false).then(accept)
      }, [])
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(String(reading?.command ?? ''))
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }
      const value = reading ?? {}
      const upstream = value.upstream ?? null
      const checkFailed = failed || value.ok === false
      const status = checkFailed
        ? t('versionCheckFailed')
        : value.updateAvailable === true
          ? t('versionUpdate')
          : value.ok === true ? t('versionLatest') : t('versionPending')
      const upstreamText = upstream !== null
        ? `${upstream.version || '?'}${upstream.commit ? ` · ${String(upstream.commit).slice(0, 7)}` : ''}`
        : checkFailed ? t('versionUnknown') : t('versionPending')
      const row = (key, label, body) => h('div', { key, className: 'cc-row' }, [
        h('span', { key: 'k', className: 'cc-muted' }, label),
        h('span', { key: 'v', className: 'cc-grow' }, body),
      ])
      return h('div', { key: 'body' }, [
        row('installed', t('versionInstalled'), value.installedVersion || t('versionUnknown')),
        row('locked', t('versionLocked'), value.lockedCommit ? String(value.lockedCommit).slice(0, 7) : t('versionUnknown')),
        row('upstream', t('versionUpstream'), upstreamText),
        h('div', { key: 'status', className: 'cc-row' }, [
          h(Dot, {
            key: 'd',
            color: value.updateAvailable === true
              ? 'var(--dsw-alias-state-warn-primary)'
              : value.ok === true ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)',
            title: status,
          }),
          h('span', { key: 's', className: 'cc-grow' }, status),
          h('button', {
            key: 'b',
            type: 'button',
            className: 'cc-btn',
            onClick: () => {
              void props.actions.checkVersion(true).then(accept)
            },
          }, t('checkUpdate')),
        ]),
        checkFailed
          ? h('div', { key: 'err', className: 'cc-msg cc-msg-warn' }, value.error ? String(value.error) : t('versionStaleHost'))
          : null,
        checkFailed && value.error
          ? h('div', { key: 'stale', className: 'cc-msg cc-msg-warn' }, t('versionStaleHost'))
          : null,
        h('div', { key: 'cmd', className: 'cc-row' }, [
          h('code', { key: 'c', className: 'cc-mono cc-grow' }, String(value.command ?? '')),
          h('button', { key: 'cp', type: 'button', className: 'cc-btn', onClick: copy }, copied ? t('copied') : t('copy')),
        ]),
        h('div', { key: 'hint', className: 'cc-muted' }, t('versionHint')),
      ])
    }

    /**
     * The full panel: the Settings page body, and the collapsed card's content.
     *
     * `hideTitle` drops the panel's own heading where the surrounding chrome
     * already names the provider — the Plugins card's header does.
     */
    function Panel(props) {
      const t = props.t
      const state = props.useClineConnect((snapshot) => snapshot)
      /** The last history read: `{ entries, total }`, or null before the first. */
      const [history, setHistory] = React.useState(null)
      const usageAsked = React.useRef(false)
      const planAsked = React.useRef(false)
      /** Set once an automatic quota read has failed, so the card stops saying "loading". */
      const [readFailed, setReadFailed] = React.useState(false)
      /** The window measurement already requested in this mount: one attempt each. */
      const windowsAsked = React.useRef(-1)
      /** The last free-model reading, or null before the first. */
      const [freeUsage, setFreeUsage] = React.useState(null)
      const freeAsked = React.useRef(false)
      /** Set once an automatic free-usage read has failed, so the card stops saying "loading". */
      const [freeFailed, setFreeFailed] = React.useState(false)

      // Read once on mount, while there is nothing to render. The dependency is
      // the loaded data itself, not the status: a failed read leaves `data`
      // null, so the effect does not re-run in a loop, and a successful one
      // stops asking. A later failure keeps the last good snapshot on screen.
      React.useEffect(() => {
        if (state.data === null) props.refresh()
      }, [state.data])

      // Quota is one request per mount, not per render: the reading is cached
      // host-side, so reopening the card shows the last one immediately. A route
      // with no usable key behind it has nothing to read, so it is not asked.
      React.useEffect(() => {
        if (usageAsked.current || state.data === null || state.data.ready !== true) return
        usageAsked.current = true
        void props.loadUsage().then((result) => setReadFailed(result === undefined))
      }, [state.data])

      // The free breakdown is a second, independent read: it comes from the
      // gateway's daily aggregation rather than the quota endpoint, so a host
      // that cannot answer one can still answer the other. Same once-per-mount
      // rule as the quota above, and the same "keep the last good reading"
      // behaviour when a later read fails.
      React.useEffect(() => {
        if (freeAsked.current || state.data === null || state.data.ready !== true) return
        freeAsked.current = true
        void props.loadFreeUsage().then((result) => {
          if (result === undefined) setFreeFailed(true)
          else setFreeUsage(result)
        })
      }, [state.data])

      // Revisions keep advancing when retained rows have reached the cap.
      // Older hosts expose only the retained count.
      React.useEffect(() => {
        if (state.data === null) return
        let cancelled = false
        void props.loadHistory(25).then((result) => {
          if (cancelled || result === undefined) return
          setHistory({ entries: result.entries ?? [], total: Number(result.total ?? 0) })
        })
        return () => { cancelled = true }
      }, [state.data?.historyRevision ?? state.data?.historySize])

  
  
      const rememberHistory = (result) => {
        if (result !== undefined) setHistory({ entries: result.entries ?? [], total: Number(result.total ?? 0) })
        return result
      }

      /**
       * Remember a free-usage read.
       *
       * `undefined` means the route could not answer: the failure flag is set,
       * but a reading already on screen is left alone rather than replaced by
       * an error — the same choice the quota card makes.
       */
      const rememberFreeUsage = (result) => {
        if (result === undefined) setFreeFailed(true)
        else {
          setFreeFailed(false)
          setFreeUsage(result)
        }
        return result
      }

      const actions = {
        refresh: props.refresh,
        setKey: props.setKey,
        testKey: props.testKey,
        saveAndTest: props.saveAndTest,
        addAccount: props.addAccount,
        removeAccount: props.removeAccount,
        setAccountMode: props.setAccountMode,
        setAccountEnabled: props.setAccountEnabled,
        pinModel: props.pinModel,
        setModelVisible: props.setModelVisible,
        setToolsExposed: props.setToolsExposed,
        setModelsVisibility: props.setModelsVisibility,
        probeModel: props.probeModel,
        validateModel: props.validateModel,
        testModel: props.testModel,
        resetModel: props.resetModel,
        refreshModels: props.refreshModels,
        loadUsage: (explicit) => props.loadUsage(explicit),
        loadFreeUsage: async (explicit) => rememberFreeUsage(await props.loadFreeUsage(explicit)),
        loadHistory: async (limit) => rememberHistory(await props.loadHistory(limit)),
        checkVersion: async (force) => await props.checkVersion(force),
      }

      const data = state.data
      const disabled = state.busy !== null || (data !== null && data.settingsAvailable === false)
      const ready = data?.ready === true
      const total = Number(data?.historySize ?? history?.total ?? 0)

      return h('div', { className: 'cc-panel' }, [
        props.hideTitle === true ? null : h('h2', { key: 'title', className: 'cc-title' }, t('title')),
        // One status line replaces the old route/baseURL block: the endpoint is
        // not something a user sets, so showing it was pure noise.
        h('div', { key: 'status', className: 'cc-row cc-muted' }, [
          h(Dot, { key: 'd', color: ready ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary)', title: ready ? t('keyOk') : t('keyMissing') }),
          h('span', { key: 's' }, ready ? t('keyOk') : t('keyMissing')),
        ]),
        data !== null && data.settingsAvailable === false
          ? h('div', { key: 'unavailable', className: 'cc-msg cc-msg-warn' }, t('settingsUnavailable'))
          : null,
        state.error !== null ? h('div', { key: 'err', className: 'cc-msg cc-msg-err' }, state.error) : null,
        h(Notice, { key: 'notice', notice: state.notice }),
        state.status === 'loading' && data === null
          ? h('div', { key: 'loading', className: 'cc-muted' }, t('busy'))
          : null,
        // Accounts first, quota second: the account is what has to be set up
        // before any window reading means anything, and a quota card with no key
        // behind it has nothing to say.
        data === null ? null : h(AccountsCard, { key: 'accounts', t, data, disabled, ready, actions }),
        data === null || !ready ? null : h(UsageCard, {
          key: 'usage',
          t,
          usage: data.usage,
          // Which account the pool would use. The host resolves it, so round-robin
          // is covered too: `activeAccount` only decides single mode, and the badge
          // claims to mark the account a request would actually spend. The fallback
          // covers a state read from a host that predates the field.
          activeAccount: data.effectiveAccount !== undefined && data.effectiveAccount !== ''
            ? data.effectiveAccount
            : (data.activeAccount !== ''
              ? data.activeAccount
              : (data.accounts.find((account) => account.enabled)?.key ?? '')),
          effectiveAccount: data.effectiveAccount,
          accountMode: data.accountMode,
          unavailable: readFailed,
          disabled,
          actions,
        }),
        // Directly under the official quota, because the two answer the same
        // question — what has this account spent — and the caveat on this card
        // is about the bars above it.
        data === null || !ready ? null : h(FreeUsageCard, {
          key: 'freeUsage',
          t,
          reading: freeUsage,
          unavailable: freeFailed,
          disabled,
          actions,
        }),
        // Everything below the accounts card reads through the key that card
        // stores, so none of it exists until there is one.
        data === null || !ready ? null : h(ModelsCard, { key: 'models', t, data, disabled, busy: state.busy, actions }),
        // Route-wide switches last: they are not about one model or account, and
        // nothing below them depends on their value.
        data === null ? null : h('div', { key: 'tools', className: 'cc-card' }, [
          h('label', { key: 'head', className: 'cc-row cc-tools-label' }, [
            h('input', {
              key: 'on',
              type: 'checkbox',
              className: 'cc-check',
              checked: data.exposeTools !== false,
              disabled,
              onChange: (event) => actions.setToolsExposed(event.target.checked),
            }),
            h('span', { key: 'l' }, t('toolsExpose')),
          ]),
        ]),
        // Release freshness: it describes the plugin rather than the route, and a
        // reader only needs it when a capability looks missing.
        data === null ? null : h('details', { key: 'version', className: 'cc-card' }, [
          foldHeader(`${t('version')}${data.version?.updateAvailable === true ? ` · ${t('versionUpdate')}` : ''}`),
          h(VersionCard, { key: 'body', t, initial: data.version ?? null, actions }),
        ]),
        // Diagnostic detail, so it stays folded away until asked for.
        data === null || !ready ? null : h('details', { key: 'history', className: 'cc-card' }, [
          foldHeader(`${t('history')} · ${total}`),
          h(HistoryCard, {
            key: 'body',
            t,
            entries: history?.entries ?? null,
            disabled: state.busy !== null,
            // Which account served a request only means something in a pool.
            showAccount: Number(data?.accounts?.length ?? 0) > 1,
            actions,
          }),
        ]),
      ])
    }

    /**
     * The Plugins settings tab: the same panel, folded away behind a header row.
     *
     * The section that owns `settings.plugins.tab` mounts each contribution
     * inside a `div[role=tabpanel]` rather than a card list, so this renders a
     * `div` — an `li` outside a `ul` would be invalid there.
     *
     * Disclosure is card-local state, re-read on every mount, exactly like the
     * host's own cards — and because the panel only mounts once opened, a folded
     * card costs no round trip.
     */
    function PluginSettingsCard(props) {
      const t = props.t
      const [open, setOpen] = React.useState(false)
      const title = t('title')
      return h('div', { className: `cc-set-card${open ? ' cc-set-card-open' : ''}` }, [
        h('button', {
          key: 'head',
          type: 'button',
          className: 'cc-set-header',
          'aria-expanded': open,
          'aria-label': `${t(open ? 'collapse' : 'expand')}: ${title}`,
          onClick: () => setOpen(!open),
        }, [
          h('span', { key: 'text', className: 'cc-set-head-text' }, [
            h('span', { key: 'name', className: 'cc-set-name' }, title),
            h('span', { key: 'desc', className: 'cc-set-desc' }, t('description')),
          ]),
          h(Chevron, {
            key: 'chevron',
            className: `cc-set-chevron${open ? ' cc-set-chevron-open' : ''}`,
          }),
        ]),
        open
          ? h('div', { key: 'body', className: 'cc-set-body' }, h(Panel, { ...props, hideTitle: true }))
          : null,
      ])
    }

    /** The compact card the Models page renders for this provider. */
    function QuickCard(props) {
      const t = props.t
      const state = props.useClineConnect((snapshot) => snapshot)
      React.useEffect(() => {
        if (state.data === null) props.refresh()
      }, [state.data])
      const data = state.data
      const account = data?.accounts?.[0]
      return h('div', { className: 'cc-panel' }, [
        h('div', { key: 'head', className: 'cc-row' }, [
          h(Dot, { key: 'd', color: data?.ready === true ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary)', title: data?.ready === true ? t('keyOk') : t('keyMissing') }),
          h('span', { key: 'n', className: 'cc-grow' }, data?.ready === true ? t('keyOk') : t('keyMissing')),
        ]),
        account === undefined ? null : h(KeyField, {
          key: `key:${account.key}:${account.apiKeyEnv}`,
          t,
          account,
          disabled: state.busy !== null || data?.settingsAvailable === false,
          busy: state.busy !== null,
          onSave: (value) => props.setKey(account.apiKeyEnv, value),
          onTest: (value) => props.testKey(account.apiKeyEnv, value),
          onSaveTest: (value) => props.saveAndTest(account.apiKeyEnv, value),
        }),
        h(Notice, { key: 'notice', notice: state.notice }),
        state.error !== null ? h('div', { key: 'err', className: 'cc-msg cc-msg-err' }, state.error) : null,
        state.data === null
          ? h('div', { key: 'retry', className: 'cc-row' }, [
            h('button', { key: 'b', type: 'button', className: 'cc-btn', onClick: () => props.refresh() }, t('retry')),
          ])
          : null,
      ])
    }

    //#endregion

    //#region usage pill

    /**
     * The Cline Connect quota, next to the model selector.
     *
     * Only mounted while the selected model belongs to this provider: the
     * decision the pill informs is "should I use this model right now, and how
     * much of the window is left", and for any other model the reading is
     * irrelevant and the request would be wasted. The gate is the whole reason
     * this is a pill rather than a permanent widget.
     */
    function UsagePill(props) {
      const state = React.useSyncExternalStore(props.directory.subscribe, props.directory.getSnapshot, props.directory.getSnapshot)
      const current = state.current
      if (current === null || current === undefined || String(current.provider) !== String(props.route())) return null
      return h(UsagePillActive, props)
    }

    /** The pill itself: a compact reading, expanding into the window breakdown. */
    function UsagePillActive(props) {
      const t = props.t
      // The panel's live snapshot, which an account switch updates at once. The
      // reading below arrives on a timer, so the account is taken from here: a
      // pill keyed to its own reading would keep naming the previous account for
      // up to a minute after the user changed it.
      const panel = React.useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot)
      const [snapshot, setSnapshot] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [open, setOpen] = React.useState(false)
      // Which account the popover reads. `null` keeps following the account a
      // request would use; paging sets it and wins while the popover is open.
      const [picked, setPicked] = React.useState(null)
      const root = React.useRef(null)
      // Kept across renders so the timer's callback always sees the latest one.
      const read = React.useRef(() => {})

      // Closing forgets the page, so the next look starts from the account a
      // request would use — which is what someone reopening after switching
      // accounts expects to see, rather than the page they left behind.
      React.useEffect(() => {
        if (!open) setPicked(null)
      }, [open])

      React.useEffect(() => {
        let alive = true
        let busy = false
        /**
         * One reading, shared by the first paint, the timer and the retry.
         *
         * A hidden tab is skipped rather than served: a background poll keeps a
         * request alive for a number nobody is looking at, and the visibility
         * handler below refreshes the moment the tab comes back.
         */
        const load = async (manual) => {
          if (busy) return
          if (manual !== true && typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          busy = true
          try {
            const value = await props.readUsage()
            if (alive) { setSnapshot({ value, at: Date.now() }); setFailed(false) }
          } catch {
            // The last good reading stays on screen — a failed poll is not worth
            // blanking a number that was true a minute ago.
            if (alive) setFailed(true)
          } finally {
            busy = false
          }
        }
        read.current = () => { void load(true) }
        void load(true)
        const timer = setInterval(() => { void load(false) }, 60000)
        const onVisible = () => { if (document.visibilityState === 'visible') void load(false) }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          alive = false
          read.current = () => {}
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [props.readUsage])

      // A click anywhere else closes the popover, which is what a one-shot
      // disclosure is expected to do; the listener only exists while it is open.
      React.useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [open])

      const accounts = snapshot?.value?.usage?.accounts ?? []
      // The account a request would use, not merely the first one that answered.
      // Quota is per account, so showing a healthy reading from an account the
      // next request will not touch is worse than showing nothing: it answers a
      // question about a key that is not about to be spent. The host names the
      // effective account because only it knows the cursor. A reading missing
      // that account must not borrow another key's quota.
      //
      // The account is read from the panel's snapshot, not from this reading: a
      // switch lands there at once, while a reading only arrives on a timer. The
      // reading's own copy is the fallback for a state taken before the store had
      // one.
      //
      // The selection is by index so the arrows can move it, and a cursor that
      // advances underneath only moves the reading while the popover is closed:
      // once the user pages, their choice holds for as long as it is open.
      const effectiveAccount = panel?.data?.effectiveAccount !== undefined
        ? panel.data.effectiveAccount
        : snapshot?.value?.effectiveAccount
      const index = usageIndex(accounts, effectiveAccount, picked)
      const account = accounts[index]
      const step = (delta) => setPicked((accounts.length + index + delta) % accounts.length)
      const limits = account?.ok === true ? account.limits ?? [] : []
      const byType = new Map(limits.map((limit) => [String(limit.type), limit]))
      const percentOf = (type) => {
        const limit = byType.get(type)
        return limit === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(limit.percentUsed ?? 0))))
      }
      const five = percentOf('five_hour')
      const weekly = percentOf('weekly')

      // The collapsed reading names the two windows a user paces against; a
      // missing one is dropped rather than shown as an empty slot.
      const parts = []
      if (five !== null) parts.push(`${t('usageFiveHour')} ${five}%`)
      if (weekly !== null) parts.push(`${t('usagePillWeekly')} ${weekly}%`)
      const summary = [t('usagePillLabel'), ...parts].join(' · ')

      const rows = limits.length === 0 ? null : USAGE_WINDOWS
        .map(([type, key]) => [type, key, byType.get(type)])
        .filter(([, , limit]) => limit !== undefined)
        .concat(limits
          .filter((limit) => !USAGE_WINDOWS.some(([type]) => type === String(limit.type)))
          .map((limit) => [String(limit.type), '', limit]))

      const body = failed && snapshot === null
        ? h('div', { key: 'fail', className: 'cc-pill-fail' }, [
          h('span', { key: 'm' }, t('usagePillUnavailable')),
          h('button', { key: 'r', type: 'button', className: 'cc-pill-retry', onClick: () => read.current() }, t('usagePillRetry')),
        ])
        : h('div', { key: 'card', className: 'cc-pill-card' }, [
          h('div', { key: 'head', className: 'cc-pill-head' }, [
            h('span', { key: 't', className: 'cc-pill-title' }, t('usagePillTitle')),
            // A pool is read one account at a time, the way the settings card reads
            // it: the quota is per account, so the arrows move between them rather
            // than stacking every window at once. Absent with a single account,
            // where there is nowhere to go.
            accounts.length <= 1 || account === undefined ? null : h('span', { key: 'nav', className: 'cc-pill-nav' }, [
              h('button', {
                key: 'prev', type: 'button', className: 'cc-pill-arrow',
                title: t('usagePrev'), 'aria-label': t('usagePrev'), onClick: () => step(-1),
              }, '‹'),
              h('span', { key: 'who', className: 'cc-pill-who', title: account?.displayName ?? account?.account ?? '' },
                account?.displayName ?? account?.account ?? ''),
              h('span', { key: 'pos', className: 'cc-pill-pos' }, `${index + 1} / ${accounts.length}`),
              h('button', {
                key: 'next', type: 'button', className: 'cc-pill-arrow',
                title: t('usageNext'), 'aria-label': t('usageNext'), onClick: () => step(1),
              }, '›'),
            ]),
          ]),
          rows === null
            ? h('div', { key: 'empty', className: 'cc-pill-fail' }, t('usagePillUnavailable'))
            : rows.map(([type, key, limit]) => {
              const percent = Math.max(0, Math.min(100, Number(limit.percentUsed ?? 0)))
              const left = countdown(t, limit.resetsAt)
              return h('div', { key: type, className: 'cc-pill-row' }, [
                h('div', { key: 'head', className: 'cc-pill-row-head' }, [
                  h('span', { key: 'l' }, key === '' ? type : t(key)),
                  h('span', { key: 'v', className: 'cc-pill-percent' }, `${Math.round(percent)}%`),
                ]),
                h('div', { key: 'track', className: 'cc-pill-track' },
                  h('div', { key: 'fill', className: 'cc-pill-fill', style: { width: `${percent}%`, background: usageColor(percent) } })),
                left === '' ? null : h('div', { key: 'note', className: 'cc-pill-note' }, fill(t('usageResetsIn'), { t: left })),
              ])
            }),
          snapshot === null ? null : h('div', { key: 'at', className: 'cc-pill-at' }, [
            h('span', { key: 's' }, fill(t('usagePillUpdatedAt'), { time: stamp(snapshot.at) })),
            h('button', { key: 'r', type: 'button', className: 'cc-pill-retry', onClick: () => read.current() }, t('usageRefresh')),
          ]),
        ])

      return h('div', { key: 'pill', ref: root, className: 'cc-pill' }, [
        h('button', {
          key: 'btn',
          type: 'button',
          className: 'cc-pill-btn',
          'aria-expanded': open,
          onClick: () => setOpen((was) => !was),
        }, snapshot === null ? t('usagePillTitle') : summary === '' ? t('usagePillTitle') : summary),
        open ? h('div', { key: 'pop', className: 'cc-pill-pop' }, body) : null,
      ])
    }

    /** A local timestamp, matching the panel's own reading of "updated at". */
    function stamp(ms) {
      const at = new Date(Number(ms ?? 0))
      if (!Number.isFinite(at.getTime())) return '-'
      const pad = (n) => String(n).padStart(2, '0')
      return `${at.getFullYear()}/${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
    }

    //#endregion

    //#region plugin

    /**
     * The slot registry and the browser RPC transport — the two services every
     * mount surface below needs.
     *
     * Deliberately NOT `modelDirectories`: Cordis holds `apply` back until
     * every name here is ready, so listing a service only one surface uses
     * would make a rename of that service take the whole plugin down — including
     * the panel a user needs to enter their API key. The usage pill waits for it
     * on its own instead.
     */
    const inject = ['slots', 'connection']

    /**
     * Mount the Cline Connect configuration surface.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      // The stylesheet is an effect, not a factory side effect: it is registered
      // here and torn down with the plugin.
      ctx.effect(() => installStyles(), 'cline-connect: stylesheet')
      const controller = new PanelController(ctx)
      ctx.effect(() => () => controller.dispose(), 'cline-connect: panel controller')
      const face = () => controller.inject()
      /**
       * The translate function every registration and component uses.
       *
       * The shared locale registry is preferred, but a namespace lookup that
       * resolves nothing ECHOES THE KEY BACK instead of throwing, so a bare
       * `try/catch` around it is not enough — an unresolved key would render as
       * `keyMissing` rather than as copy. Any result that merely repeats the
       * key therefore falls through to this bundle's own dictionary, which is
       * resolved against the active locale and always has the key.
       */
      const translate = (key, params) => {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          try {
            const translated = locale.bind(NS)(key, params)
            if (typeof translated === 'string' && translated !== key) return translated
          } catch { /* fall through to the bundled dictionary */ }
        }
        return controller.t(key, params)
      }

      const renderPluginCard = (props) => h(PluginSettingsCard, { ...props, ...face, t: translate })
      const renderQuick = (props) => h(QuickCard, { ...props, ...face, t: translate })

      // 1. The one configuration surface: a tab inside the Plugins settings
      //    section, which already enumerates this namespace. No
      //    `settings.section` alongside it — a second page in the Settings nav
      //    would only duplicate this panel, and the nav is for surfaces that are
      //    not already listed there.
      //
      //    `settings.plugins.tab` is a list slot: its key is `id`, its position
      //    is `order` (the host's own inventory tab sits at 10), and its tab
      //    label is a thunk so it follows the active locale.
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: NS,
        order: 20,
        label: () => translate('title'),
        locale: NS,
        inject: face,
      }, renderPluginCard))

      // 2. A compact key card on the Models page, right where the missing key
      //    for this route is reported.
      ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
        name: 'settings.models.provider-card',
        key: NS,
        locale: NS,
        inject: face,
      }, renderQuick))

      // 3. The quota reading beside the model selector. It mounts for every
      //    session but renders nothing unless the selected model is this
      //    provider's, so no other model pays for a usage request.
      const registerUsage = (usageCtx) => usageCtx.slots.inject('conversation.input.right', () => usageCtx.slots.register({
        name: 'conversation.input.right',
        id: `${NS}-usage`,
        order: 100,
        inject: (sessionId) => ({
          directory: usageCtx.modelDirectories.directoryFor(sessionId).store,
          // The route name is configuration, so it is only known once a state
          // read has landed. Read it at render time rather than capturing it:
          // the pill can mount before the first read completes.
          route: () => controller.store.getSnapshot().data?.provider ?? NS,
          // The panel's own snapshot. Switching accounts is a panel action that
          // updates this store at once, whereas a usage reading is only taken on
          // mount and on a timer — so the account is read from here, and a pill
          // keyed to its own reading names the previous account until the poll.
          store: controller.store,
          readUsage: async () => {
            const value = await controller.call('usage', {})
            // Keep the panel's snapshot as fresh as this reading, so whatever the
            // host has just named is visible everywhere without waiting a minute.
            controller.applyState(value)
            return value
          },
          t: translate,
        }),
      }, UsagePill))

      // The pill is the only surface that reads `modelDirectories` (the store
      // naming the model this session selected), so it waits for that service
      // here rather than in `inject` above. A rename upstream then costs the
      // pill alone, while the panel and the model card keep working.
      ctx.inject(['modelDirectories'], (usageCtx) => {
        // Newer Cordis service methods execute in the consumer's context. The
        // directory resolver reads remote.session, so give this slot its explicit
        // dependency without requiring that newer service on legacy hosts.
        if (usageCtx.get('remote.session') !== undefined) usageCtx.inject(['remote.session'], registerUsage)
        else registerUsage(usageCtx)
      })

      // The first read is lazy (each component asks for it), because the RPC
      // transport only exists once Connection has activated.
      void controller.refresh()
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
