import { decodeState } from './deeplink.js'
import type { OAuthCallbackTokens, ParsedCallback } from './types.js'

/** Token-bearing keys we recognise. Keep in sync with OAuthCallbackTokens. */
const TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'session_token',
  'expires_in',
  'state',
  'scope',
  'error',
  'error_description',
] as const

/**
 * Parse a callback URL into a structured token bag.
 *
 * Defaults to checking BOTH the query string and the URL fragment, with
 * query winning on conflict. This default works for every provider this
 * package knows about because the Despia deeplink path turns whatever was
 * in the fragment into query params anyway, so by the time the WebView's
 * `/auth` page runs, tokens are in the query.
 *
 * If the encoded `state` includes a `spec.loc` ('query' / 'fragment' /
 * 'both' / 'code'), we honour it. This lets the same parser work for
 * custom OAuth providers without per-provider hardcoding — the URL builder
 * encodes "tokens are in the fragment", the callback page reads the spec
 * and looks there.
 *
 * `expires_in` is parsed to a number; everything else stays a string. Empty
 * strings are treated as absent so callers can do `if (tokens.access_token)`.
 */
export function parseCallback(url?: string | URL): ParsedCallback {
  const source =
    url ?? (typeof window !== 'undefined' ? window.location.href : null)
  if (!source) {
    return { tokens: {}, deeplinkScheme: null, cleanState: null, spec: null }
  }
  const u =
    typeof source === 'string' ? new URL(source, 'https://placeholder.invalid') : source

  // Decode state first so we know whether the IdP put tokens in fragment,
  // query, or somewhere else.
  const stateValue = u.searchParams.get('state') ?? new URLSearchParams(u.hash.replace(/^#/, '')).get('state')
  const decoded = decodeState(stateValue)

  const fragmentParams = new URLSearchParams(u.hash.startsWith('#') ? u.hash.slice(1) : u.hash)
  const queryParams = u.searchParams

  const loc = decoded.spec?.loc ?? 'both'
  const tokens: OAuthCallbackTokens = {}

  for (const key of TOKEN_KEYS) {
    let value: string | null = null
    if (loc === 'query' || loc === 'code') {
      value = queryParams.get(key)
    } else if (loc === 'fragment') {
      value = fragmentParams.get(key)
    } else {
      // 'both' — query wins on conflict
      value = queryParams.get(key) ?? fragmentParams.get(key)
    }
    if (value === null || value === '') continue

    if (key === 'expires_in') {
      const n = Number(value)
      if (!Number.isNaN(n)) tokens.expires_in = n
    } else {
      ;(tokens as Record<string, string>)[key] = value
    }
  }

  return {
    tokens,
    deeplinkScheme: decoded.deeplinkScheme,
    cleanState: decoded.csrfToken,
    spec: decoded.spec,
  }
}

/**
 * True when at least one token-bearing or error field is present. Use this
 * inside an `/auth` page handler to early-return when the URL has nothing
 * for us to act on (e.g. user landed on /auth directly).
 */
export function hasCallbackData(parsed: ParsedCallback): boolean {
  const t = parsed.tokens
  return Boolean(
    t.access_token || t.id_token || t.code || t.session_token || t.error,
  )
}
