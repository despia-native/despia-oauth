/**
 * Public types for @despia/oauth.
 *
 * @despia/oauth handles OAuth flows in Despia apps that require native
 * ASWebAuthenticationSession (iOS) or Chrome Custom Tabs (Android) — the
 * trusted browser sessions App Store and Play Store require for sign-in
 * with Google, Apple, TikTok, and most major IdPs.
 *
 * Zero runtime dependencies. The native bridge is a single
 * `window.despia = "oauth://?url=..."` assignment that the Despia
 * runtime intercepts at the OS URL-scheme level. The deeplink back into
 * the WebView (`{scheme}://oauth/auth?...`) is intercepted the same way.
 *
 * The package is framework-agnostic at its core, with optional adapters
 * for React, Vue, and Svelte, plus drop-in custom elements. MIT licensed.
 */

/** Detected runtime — Despia native (with platform), web browser, or SSR. */
export type Runtime =
  | { kind: 'native'; platform: 'ios' | 'android' }
  | { kind: 'web' }
  | { kind: 'ssr' }

/** Subset of OAuth `response_type` values this package recognises. */
export type ResponseType = 'code' | 'token' | 'id_token' | 'code id_token'

/** OAuth `response_mode` — controls how the IdP returns tokens. */
export type ResponseMode = 'query' | 'fragment' | 'form_post'

/**
 * Tokens that may be present after a callback URL is parsed. Every field is
 * optional because different providers and flows return different subsets.
 *
 *   • Implicit flow            → access_token (+ refresh_token, expires_in)
 *   • Apple id_token flow      → id_token
 *   • Authorization code flow  → code (server-side exchange required)
 *   • Custom backend session   → session_token (opaque, app-specific)
 */
export interface OAuthCallbackTokens {
  access_token?: string
  refresh_token?: string
  id_token?: string
  code?: string
  /** Opaque session token from a custom backend (e.g. Apple form_post flow). */
  session_token?: string
  /** Lifetime in seconds, when provided by the IdP. */
  expires_in?: number
  /** OAuth `state`. May contain `csrf|deeplink_scheme` if encodeState() was used. */
  state?: string
  /** Granted scopes, when echoed back. */
  scope?: string
  /** Provider-reported error code. */
  error?: string
  /** Provider-reported human-readable error description. */
  error_description?: string
}

/** Result of parsing a URL during the OAuth callback. */
export interface ParsedCallback {
  tokens: OAuthCallbackTokens
  /** `deeplink_scheme` extracted from `state` if encoded with encodeState. */
  deeplinkScheme: string | null
  /** Original CSRF token (state with the scheme/spec suffix stripped). */
  cleanState: string | null
  /** Token-parsing spec carried through state, if any. */
  spec: import('./deeplink.js').TokenSpec | null
}

/**
 * Configuration accepted by every provider URL builder. Individual providers
 * extend this with their own required fields.
 *
 * The `deeplinkScheme` is **required and user-provided** — find yours at
 * Despia > Publish > Deeplink. We deliberately don't ship a default; using
 * the wrong scheme silently breaks the callback, so we make you supply it.
 */
export interface BaseOAuthConfig {
  /**
   * The deeplink scheme registered for your Despia app. Find it at
   * **Despia > Publish > Deeplink**. Used to construct the
   * `{scheme}://oauth/...` URL that closes the secure browser session.
   *
   * Pass the bare scheme (e.g. `myapp`), not a URL.
   */
  deeplinkScheme: string
  /**
   * HTTPS origin of your web app, e.g. `https://yourapp.com`. Used as the
   * base for the `redirect_uri`. Must be HTTPS — Despia's secure browser
   * will not load `http://localhost`.
   */
  appOrigin: string
}

/** Errors raised by this package. */
export class DespiaOAuthError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DespiaOAuthError'
    this.code = code
  }
}
