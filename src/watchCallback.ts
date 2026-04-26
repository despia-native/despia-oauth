import { parseCallback, hasCallbackData } from './callback.js'
import type { ParsedCallback } from './types.js'

/**
 * Framework-agnostic engine that watches the URL and fires `onCallback`
 * exactly once per unique URL. Used internally by the React/Vue/Svelte
 * adapters — same logic everywhere, single place to fix bugs.
 *
 * This is exported for power users who want to wire up their own framework
 * (Solid, Qwik, Web Components, plain JS) without reimplementing the
 * already-mounted-page workaround.
 *
 * Returns a cleanup function that removes the listeners. Always call it
 * when your component unmounts; otherwise you'll leak listeners across
 * mount/unmount cycles.
 *
 * Why both popstate and hashchange:
 *   • popstate fires for History API navigations (back/forward, router pushes).
 *   • hashchange fires for fragment-only changes — Apple's `response_mode=fragment`
 *     flow puts the id_token in the hash, and a router that ignores fragment
 *     changes (most do) won't trigger popstate for that update.
 *
 * Why the dedupe ref:
 *   • React 18 Strict Mode double-invokes effects in dev. Without dedupe,
 *     a code-flow exchange would run twice in dev, which usually fails on
 *     the second try since the code is single-use.
 */
export interface CallbackWatcherOptions {
  /** Fire the callback even when the URL contains no token data. Default false. */
  fireOnEmpty?: boolean
  /**
   * Override window for environments that mock it (jsdom, happy-dom, custom
   * test setups). Defaults to the global `window`.
   */
  win?: Window
}

export type CallbackHandler = (parsed: ParsedCallback) => void | Promise<void>

export function watchCallbackUrl(
  onCallback: CallbackHandler,
  options: CallbackWatcherOptions = {},
): () => void {
  const win = options.win ?? (typeof window !== 'undefined' ? window : undefined)
  if (!win) return () => {} // SSR: noop

  const fireOnEmpty = options.fireOnEmpty ?? false
  let lastProcessed: string | null = null

  const run = () => {
    const href = win.location.href
    if (lastProcessed === href) return

    const parsed = parseCallback(href)
    if (!fireOnEmpty && !hasCallbackData(parsed)) return

    lastProcessed = href
    Promise.resolve(onCallback(parsed)).catch((err) => {
      // Reset so a transient failure can be retried by a subsequent URL
      // change (e.g. user retries sign-in).
      lastProcessed = null
      // eslint-disable-next-line no-console
      console.error('[despia-oauth] callback handler threw:', err)
    })
  }

  run()
  win.addEventListener('popstate', run)
  win.addEventListener('hashchange', run)

  return () => {
    win.removeEventListener('popstate', run)
    win.removeEventListener('hashchange', run)
  }
}
