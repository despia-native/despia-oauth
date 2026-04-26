import { DespiaOAuthError } from './types.js'

/**
 * Build a Despia close-and-navigate deeplink.
 *
 * The `oauth/` prefix is critical — Despia intercepts URLs whose authority
 * is exactly `oauth` and treats everything after as a path to push onto the
 * WebView. Forgetting it leaves users stuck in the browser tab silently;
 * the docs flag it with a Danger callout on every provider page.
 *
 * @example
 * buildDeeplink('myapp', '/auth', { access_token: 'xxx' })
 * // → 'myapp://oauth/auth?access_token=xxx'
 */
export function buildDeeplink(
  scheme: string,
  path: string,
  params: Record<string, string | undefined | null> = {},
): string {
  if (!scheme) {
    throw new DespiaOAuthError(
      'invalid_scheme',
      'Deeplink scheme is required. Find yours at Despia > Publish > Deeplink.',
    )
  }
  // Reject URLs-disguised-as-schemes early. Accepting `myapp://` here would
  // produce `myapp://://oauth/...` which silently fails to navigate.
  if (scheme.includes(':') || scheme.includes('/')) {
    throw new DespiaOAuthError(
      'invalid_scheme',
      `Deeplink scheme should be the bare scheme name (e.g. "myapp"), not a URL. Got: ${scheme}`,
    )
  }

  const normalisedPath = path.startsWith('/') ? path.slice(1) : path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return `${scheme}://oauth/${normalisedPath}${query ? `?${query}` : ''}`
}

/**
 * Spec for where the IdP returns tokens in the callback URL.
 *
 *   • `query`    → tokens in `?access_token=…&refresh_token=…`
 *   • `fragment` → tokens in `#access_token=…&refresh_token=…` (implicit flow)
 *   • `both`     → check both, query wins on conflict (default — covers
 *                  almost every provider including the Despia deeplink path
 *                  which converts hash → query)
 *
 * `code` means the IdP returns an authorization code that needs server-side
 * exchange; the callback page POSTs to your backend and forwards the
 * exchanged tokens via the deeplink.
 */
export type TokenLocation = 'query' | 'fragment' | 'both' | 'code'

/**
 * Token-parsing config carried through the OAuth `state` parameter to the
 * `/native-callback` page. Lets the same callback page handle any provider
 * without per-provider hardcoding — the page reads `state`, learns where to
 * look, and parses accordingly.
 */
export interface TokenSpec {
  /** Where the tokens live in the callback URL. */
  loc?: TokenLocation
  /**
   * Backend endpoint for code exchange (only meaningful when loc='code').
   * Relative to the page's origin or absolute. The callback page POSTs
   * `{ code, redirect_uri, state }` and expects `{ access_token, … }` back.
   */
  ex?: string
  /**
   * Path on the WebView side to navigate to after the browser session
   * closes. Defaults to '/auth'.
   */
  ap?: string
}

/**
 * Encoded state structure: `csrf|scheme|spec` where `spec` is optional and,
 * when present, base64url-encoded JSON. Picked over a longer separator
 * scheme because `|` cannot appear in standard CSRF tokens (UUIDs, base64),
 * keeping parsing dead simple. The base64url encoding avoids `&`, `=`, `+`,
 * `/`, `#` chars that would confuse URLSearchParams or URL parsing.
 */
export interface EncodeStateInput {
  /** Your deeplink scheme (Despia > Publish > Deeplink). */
  scheme: string
  /** Optional CSRF token. Auto-generated if omitted. */
  csrf?: string
  /** Optional token-parsing config for the callback page. */
  spec?: TokenSpec
}

export function encodeState(input: string | EncodeStateInput, csrfToken?: string): string {
  // Back-compat: the old signature was `encodeState(scheme, csrfToken?)`. Keep
  // that working so existing call sites don't break.
  const params: EncodeStateInput =
    typeof input === 'string' ? { scheme: input, csrf: csrfToken } : input

  const csrf = params.csrf ?? generateCsrf()
  const base = `${csrf}|${params.scheme}`
  if (!params.spec || isEmptySpec(params.spec)) return base
  return `${base}|${base64UrlEncode(JSON.stringify(params.spec))}`
}

/** Decode a `state` value that was produced by `encodeState`. */
export interface DecodedState {
  csrfToken: string | null
  deeplinkScheme: string | null
  spec: TokenSpec | null
}

export function decodeState(state: string | null | undefined): DecodedState {
  if (!state) return { csrfToken: null, deeplinkScheme: null, spec: null }

  // Manual split-3 (not state.split('|')) because we want the scheme to be
  // the *last* segment if there are only 2, and the spec to be the third
  // when present. This is robust against schemes that contain `|` (unlikely
  // but possible under user error — better to preserve verbatim).
  const i1 = state.indexOf('|')
  if (i1 === -1) return { csrfToken: state, deeplinkScheme: null, spec: null }
  const csrf = state.slice(0, i1)

  const rest = state.slice(i1 + 1)
  const i2 = rest.indexOf('|')
  if (i2 === -1) {
    return { csrfToken: csrf, deeplinkScheme: rest || null, spec: null }
  }
  const scheme = rest.slice(0, i2) || null
  const specEncoded = rest.slice(i2 + 1)

  let spec: TokenSpec | null = null
  if (specEncoded) {
    try {
      const parsed = JSON.parse(base64UrlDecode(specEncoded)) as TokenSpec
      spec = parsed
    } catch {
      // Malformed spec: ignore, treat as if no spec was sent. The callback
      // page can fall back to default behaviour (parse both query+fragment).
      spec = null
    }
  }
  return { csrfToken: csrf, deeplinkScheme: scheme, spec }
}

// --- internal helpers ---

function isEmptySpec(s: TokenSpec): boolean {
  return !s.loc && !s.ex && !s.ap
}

function generateCsrf(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * base64url encode (RFC 4648 §5). Standard base64 uses `+`, `/`, and `=`
 * which all collide with URL-encoding. URL-safe base64 swaps in `-` and `_`
 * and drops `=` padding.
 */
function base64UrlEncode(s: string): string {
  // btoa expects Latin-1; the UTF-8 → percent → unescape → Latin-1 dance is
  // the standard browser route. Our input is JSON-stringified objects with
  // ASCII keys, so this is safe.
  let b64: string
  if (typeof btoa !== 'undefined') {
    b64 = btoa(unescape(encodeURIComponent(s)))
  } else {
    // Node fallback. Cast through unknown so we don't require @types/node.
    const g = globalThis as unknown as {
      Buffer?: { from(x: string, enc: string): { toString(enc: string): string } }
    }
    if (!g.Buffer) throw new Error('No base64 encoder available')
    b64 = g.Buffer.from(s, 'utf-8').toString('base64')
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(b64)))
  }
  const g = globalThis as unknown as {
    Buffer?: { from(x: string, enc: string): { toString(enc: string): string } }
  }
  if (!g.Buffer) throw new Error('No base64 decoder available')
  return g.Buffer.from(b64, 'base64').toString('utf-8')
}
