import { handleNativeCallback } from '../handleNativeCallback.js'
import { parseCallback } from '../callback.js'

/**
 * `<despia-oauth-callback>` — drop-in custom element for the
 * `/native-callback` page.
 *
 * Reads the OAuth callback URL on connect, optionally exchanges an
 * authorization code via your backend, and fires the close-and-navigate
 * deeplink. The element renders a minimal "Completing sign in…" message
 * which you can override with your own children.
 *
 * Most config is auto-derived from the `state` parameter encoded by the
 * `oauth.*()` helpers — the exit path, the token location, the exchange
 * endpoint all travel through `state`. The attributes below are escape
 * hatches for callers building OAuth URLs by hand.
 *
 * ## When you need `exchange-endpoint`
 *
 * Only when **your callback page is served by a different origin than your
 * backend**. Two common topologies:
 *
 *   STATIC FRONTEND, SEPARATE API (use exchange-endpoint with absolute URL)
 *
 *     yourapp.com (CDN)            api.yourapp.com (server)
 *       /native-callback.html  ──►  POST /auth/exchange
 *                                    └─ exchanges code, returns tokens
 *
 *     <despia-oauth-callback exchange-endpoint="https://api.yourapp.com/auth/exchange">
 *     </despia-oauth-callback>
 *
 *   SAME-ORIGIN BACKEND (skip exchange-endpoint entirely — better pattern)
 *
 *     yourapp.com (server)
 *       GET /native-callback?code=xxx
 *        ├─ exchanges code with IdP server-side
 *        └─ responds with HTML containing ?session_token=xxx in the URL
 *
 *     The web component just reads ?session_token from the URL and fires the
 *     deeplink. No fetch back to the same backend, no double round trip.
 *
 *     <despia-oauth-callback></despia-oauth-callback>
 *
 *   IMPLICIT FLOW (Supabase, Apple fragment) — also no exchange-endpoint
 *
 *     The IdP redirects to /native-callback.html with #access_token=xxx
 *     already in the URL. Web component reads it, fires deeplink. Done.
 *
 *     <despia-oauth-callback></despia-oauth-callback>
 *
 * If you set `exchange-endpoint` to a same-origin relative path, the
 * component still works — but you're paying for an extra round trip that
 * your backend could have skipped by exchanging during the GET that served
 * this very page. We log a console warning in that case.
 *
 * @example Override the WebView destination
 *
 *   <despia-oauth-callback auth-path="/welcome"></despia-oauth-callback>
 *
 * Attributes:
 *   • `auth-path`           — where the WebView should land. Default `/auth`,
 *                             or whatever `state.spec.ap` carries.
 *   • `exchange-endpoint`   — **absolute URL** of your backend's code-exchange
 *                             endpoint. Only needed when the callback page
 *                             is on a different origin than your backend.
 *                             Default `state.spec.ex`. POSTs
 *                             `{code, redirect_uri, state}`, expects
 *                             `{access_token, refresh_token?}`.
 *   • `fallback-scheme`     — deeplink scheme to use if `state` didn't carry
 *                             one. Last-resort escape hatch.
 *
 * Events:
 *   • `oauth-success` — fires just before the deeplink navigation. Detail
 *                       is the parsed token bag. Useful for logging.
 *   • `oauth-error`   — fires when the callback URL contained an error or
 *                       the exchange failed. Detail is `{ code, message }`.
 */
export class DespiaOAuthCallbackElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['auth-path', 'exchange-endpoint', 'fallback-scheme']
  }

  // We connect once and run once. If the element is moved or re-attached
  // we don't want to re-fire — at that point the deeplink is already in
  // flight and re-firing would double-navigate.
  private fired = false

  connectedCallback(): void {
    if (this.fired) return
    this.fired = true

    // Render a default loading message only if the user didn't put their
    // own children inside. This keeps the component invisible-by-default
    // for users who want a custom loading UI.
    if (this.childNodes.length === 0) {
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #888;
            font-size: 14px;
          }
        </style>
        <p>Completing sign in…</p>
      `
    }

    // The work happens after the next paint so a "Completing…" frame shows
    // even on slow code-exchange round-trips. Without this, very fast
    // exchanges flash nothing visible at all.
    requestAnimationFrame(() => void this.run())
  }

  private async run(): Promise<void> {
    const parsed = parseCallback(window.location.href)

    // Pull config from the encoded state spec; let attributes override.
    const authPath =
      this.getAttribute('auth-path') ?? parsed.spec?.ap ?? '/auth'
    const exchangeEndpoint =
      this.getAttribute('exchange-endpoint') ?? parsed.spec?.ex ?? null
    const fallbackScheme = this.getAttribute('fallback-scheme') ?? undefined

    // If a same-origin relative endpoint is used, the user is paying for an
    // extra round trip — their backend served this page and could have
    // exchanged the code during the GET request. Warn loudly so they at
    // least know about the better pattern. We don't refuse though: it's a
    // valid choice for users who want all the auth logic in JS for some
    // reason (single edge function handling everything, etc).
    if (
      exchangeEndpoint &&
      !exchangeEndpoint.startsWith('http://') &&
      !exchangeEndpoint.startsWith('https://')
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[despia-oauth] exchange-endpoint "${exchangeEndpoint}" is a relative path, ` +
          `which means your backend is serving this callback page AND running the ` +
          `exchange. You can skip the round trip by exchanging the code during the ` +
          `GET request that serves /native-callback, then rendering the page with ` +
          `?session_token=… already in the URL. See ` +
          `https://github.com/despia/oauth#server-rendered-callback`,
      )
    }

    const result = await handleNativeCallback({
      authPath,
      fallbackScheme,
      exchangeCode: exchangeEndpoint
        ? async ({ code, redirectUri, state }) => {
            // Resolve relative endpoint against current origin.
            const url = exchangeEndpoint.startsWith('http')
              ? exchangeEndpoint
              : new URL(exchangeEndpoint, window.location.origin).toString()
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
              credentials: 'include',
            })
            if (!res.ok) {
              throw new Error(
                `Exchange endpoint returned ${res.status} ${res.statusText}`,
              )
            }
            return res.json()
          }
        : undefined,
    })

    if (result.status === 'error') {
      this.dispatchEvent(
        new CustomEvent('oauth-error', { detail: result.error, bubbles: true }),
      )
    } else if (result.error) {
      // The deeplink was fired with an error payload — still useful to
      // surface to listeners on this element for logging.
      this.dispatchEvent(
        new CustomEvent('oauth-error', { detail: result.error, bubbles: true }),
      )
    } else {
      this.dispatchEvent(
        new CustomEvent('oauth-success', {
          detail: { tokens: parsed.tokens },
          bubbles: true,
        }),
      )
    }
  }
}

/**
 * `<despia-oauth-tokens>` — drop-in custom element for the `/auth` page.
 *
 * Watches the URL for OAuth tokens (handling the already-mounted-page bug
 * via popstate + hashchange) and dispatches a `tokens` CustomEvent so your
 * page code can call `supabase.auth.setSession()`, `signInWithCredential()`,
 * `convex.action()`, or whatever your auth provider needs.
 *
 * Why a separate element from `<despia-oauth-callback>`: this one runs
 * *inside* the WebView after the deeplink has fired and re-opened the app
 * at `/auth?access_token=…`. The other one runs inside the secure browser
 * session at `/native-callback`. They have different jobs.
 *
 * @example
 *
 *   <despia-oauth-tokens></despia-oauth-tokens>
 *   <script type="module">
 *     import 'https://unpkg.com/@despia/oauth/web-components'
 *
 *     document.querySelector('despia-oauth-tokens').addEventListener('tokens', async (e) => {
 *       const { access_token, refresh_token } = e.detail
 *       await supabase.auth.setSession({
 *         access_token, refresh_token: refresh_token ?? '',
 *       })
 *       window.location.href = '/'
 *     })
 *   </script>
 *
 * Attributes:
 *   • `redirect-on-success` — if set, navigate here after dispatching
 *                              `tokens`. Useful for declarative setups.
 *
 * Events:
 *   • `tokens` — detail is the parsed token bag.
 *   • `oauth-error` — detail is `{ code, description }`.
 */
export class DespiaOAuthTokensElement extends HTMLElement {
  private cleanup: (() => void) | null = null
  private lastFired: string | null = null

  connectedCallback(): void {
    // Default loading UI if no children supplied.
    if (this.childNodes.length === 0 && !this.shadowRoot) {
      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #888;
            font-size: 14px;
          }
        </style>
        <p>Signing you in…</p>
      `
    }

    const onChange = () => {
      const href = window.location.href
      if (this.lastFired === href) return
      const parsed = parseCallback(href)
      const t = parsed.tokens
      const hasUsable =
        t.access_token || t.id_token || t.session_token || t.code || t.error
      if (!hasUsable) return

      this.lastFired = href

      if (t.error) {
        this.dispatchEvent(
          new CustomEvent('oauth-error', {
            detail: { code: t.error, description: t.error_description },
            bubbles: true,
          }),
        )
        return
      }

      this.dispatchEvent(
        new CustomEvent('tokens', { detail: t, bubbles: true }),
      )

      const redirectOnSuccess = this.getAttribute('redirect-on-success')
      if (redirectOnSuccess) {
        // Defer slightly so listeners (which may be async) get a chance to
        // run before the page navigates away. This is best-effort — if a
        // listener does an await without preventing default behaviour,
        // they'd need to handle the redirect themselves.
        setTimeout(() => {
          window.location.href = redirectOnSuccess
        }, 0)
      }
    }

    onChange()
    window.addEventListener('popstate', onChange)
    window.addEventListener('hashchange', onChange)
    this.cleanup = () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener('hashchange', onChange)
    }
  }

  disconnectedCallback(): void {
    this.cleanup?.()
    this.cleanup = null
  }
}

/**
 * Register the custom elements. Idempotent — safe to call multiple times,
 * safe to import this module multiple times. Custom Elements registry
 * throws on duplicate `define`, so we guard explicitly.
 */
export function defineDespiaOAuthElements(): void {
  if (typeof customElements === 'undefined') return
  if (!customElements.get('despia-oauth-callback')) {
    customElements.define('despia-oauth-callback', DespiaOAuthCallbackElement)
  }
  if (!customElements.get('despia-oauth-tokens')) {
    customElements.define('despia-oauth-tokens', DespiaOAuthTokensElement)
  }
}

// Auto-registration lives in `./auto-register.ts` so importers who want the
// classes without the side effect can import from `@despia/oauth/web-components/no-register`.
