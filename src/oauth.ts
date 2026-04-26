import { openOAuth, type OpenOAuthResult } from './open.js'
import { detectRuntime, isDespiaIOS } from './runtime.js'
import { encodeState, type TokenLocation, type TokenSpec } from './deeplink.js'
import { DespiaOAuthError } from './types.js'

/**
 * Three helpers for the three real OAuth situations:
 *
 *   oauth.signIn({ url, ... })   — generic. Pass any authorize URL inline.
 *   oauth.apple({ ... })         — Apple JS popup on iOS, redirect on Android.
 *   oauth.tiktok({ ... })        — TikTok with backend code exchange.
 *
 * Apple has its own helper because iOS native MUST use the JS SDK popup
 * (Face ID inside WKWebView) — the redirect flow shows a blank screen and
 * gets the app rejected from the App Store. The platform branching has to
 * live somewhere; it's here, not on the caller.
 *
 * TikTok has its own helper because TikTok's URL format is fiddly —
 * `client_key` (not `client_id`), comma-separated scopes, mandatory
 * server-side code exchange (Client Secret never leaves the server). The
 * helper builds the URL and registers the exchange endpoint in `state` so
 * the callback page knows what to do. TikTok is common enough that this
 * convenience is worth the dedicated helper.
 *
 * Everything else — Google, GitHub, Discord, Auth0, Clerk, Supabase Auth,
 * Convex, Firebase, your own backend — is `oauth.signIn({ url, ... })`.
 * Build the URL inline, pass it. We append `state` (carrying the deeplink
 * scheme + token-parsing config) and trigger the native bridge.
 */

interface BaseConfig {
  /** Despia > Publish > Deeplink. Always required, never defaulted. */
  deeplinkScheme: string
  /** HTTPS origin of your web app, e.g. `https://yourapp.com`. */
  appOrigin: string
  /** Path that handles the OAuth return on your domain. Defaults to `/auth`. */
  authPath?: string
}

const DEFAULT_AUTH_PATH = '/auth'
const DEFAULT_EXIT_PATH = '/native-callback.html'

// ============================================================================
// signIn — generic
// ============================================================================

export interface OauthSignInConfig extends BaseConfig {
  /**
   * The full authorize URL. Build it inline:
   *
   *     oauth.signIn({
   *       url: `https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=${
   *         encodeURIComponent('https://yourapp.com/native-callback.html')
   *       }`,
   *       deeplinkScheme: 'myapp',
   *       appOrigin:      'https://yourapp.com',
   *       tokenLocation:  'fragment',
   *     })
   */
  url: string
  /**
   * Where the IdP returns tokens.
   *   • `'fragment'` — `#access_token=…` (Supabase implicit, OIDC implicit)
   *   • `'query'`    — `?access_token=…`
   *   • `'both'`     — check both, query wins (default — works for most)
   *   • `'code'`     — `?code=…`, callback POSTs to `exchangeEndpoint`
   */
  tokenLocation?: TokenLocation
  /**
   * Required when `tokenLocation: 'code'`. Pass an absolute URL when your
   * callback page is on a different origin than your backend. For
   * same-origin setups, prefer server-rendering the callback with
   * `?session_token=…` already in the URL — see README.
   */
  exchangeEndpoint?: string
}

function signIn(config: OauthSignInConfig): OpenOAuthResult {
  if (!config.url) {
    throw new DespiaOAuthError('missing_url', 'oauth.signIn requires `url`.')
  }
  if (!config.deeplinkScheme) {
    throw new DespiaOAuthError(
      'missing_deeplink_scheme',
      '`deeplinkScheme` is required. Find yours at Despia > Publish > Deeplink.',
    )
  }
  const tokenLocation = config.tokenLocation ?? 'both'
  if (tokenLocation === 'code' && !config.exchangeEndpoint) {
    throw new DespiaOAuthError(
      'missing_exchange_endpoint',
      'tokenLocation: "code" requires `exchangeEndpoint`.',
    )
  }
  const authPath = config.authPath ?? DEFAULT_AUTH_PATH

  const spec: TokenSpec = { loc: tokenLocation, ap: authPath }
  if (config.exchangeEndpoint) spec.ex = config.exchangeEndpoint

  // Append state to the user's URL. We don't touch any other params.
  const url = new URL(config.url)
  url.searchParams.set('state', encodeState({ scheme: config.deeplinkScheme, spec }))

  return openOAuth(url.toString())
}

// ============================================================================
// apple — JS popup on iOS, redirect on Android
// ============================================================================

export interface OauthAppleConfig extends BaseConfig {
  /** Apple Services ID, e.g. `com.yourcompany.yourapp.webauth`. */
  servicesId: string
  /** Scopes — `name` and/or `email`. Default: both. */
  scopes?: ('name' | 'email')[]
  /** Where Android redirects land. Defaults to `/native-callback.html`. */
  exitPath?: string
  /**
   * Android only. `fragment` (default) → `#id_token=…` returned to
   * `exitPath`. `form_post` → Apple POSTs to `formPostHandlerUrl`.
   */
  responseMode?: 'fragment' | 'form_post'
  /** Required when `responseMode='form_post'`. Absolute URL. */
  formPostHandlerUrl?: string
  /**
   * iOS-only. Where the JS-SDK popup redirects to. Must EXACTLY match
   * the URI registered in your Apple Services ID config (Apple does
   * exact string matching). Defaults to `appOrigin + '/'`.
   */
  iosRedirectURI?: string
}

export interface OauthAppleIOSResult {
  kind: 'apple-popup'
  id_token: string
  code: string
  user?: {
    name?: { firstName?: string; lastName?: string }
    email?: string
  }
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (c: {
          clientId: string
          scope: string
          redirectURI: string
          state?: string
          usePopup: boolean
        }) => void
        signIn: () => Promise<{
          authorization: { code: string; id_token: string; state?: string }
          user?: { name?: { firstName?: string; lastName?: string }; email?: string }
        }>
      }
    }
  }
}

async function apple(
  config: OauthAppleConfig,
): Promise<OpenOAuthResult | OauthAppleIOSResult> {
  if (!config.servicesId) {
    throw new DespiaOAuthError('missing_services_id', 'Apple servicesId is required.')
  }
  if (!config.deeplinkScheme) {
    throw new DespiaOAuthError(
      'missing_deeplink_scheme',
      '`deeplinkScheme` is required.',
    )
  }

  const runtime = detectRuntime()

  // iOS native + web → JS SDK popup. Redirect on iOS = blank screen + App
  // Store rejection.
  if (
    (runtime.kind === 'native' && runtime.platform === 'ios') ||
    runtime.kind === 'web'
  ) {
    if (typeof window === 'undefined' || !window.AppleID?.auth) {
      throw new DespiaOAuthError(
        'apple_sdk_not_loaded',
        'Apple JS SDK not loaded. Add to your HTML: ' +
          '<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>',
      )
    }
    window.AppleID.auth.init({
      clientId: config.servicesId,
      scope: (config.scopes ?? ['name', 'email']).join(' '),
      redirectURI: config.iosRedirectURI ?? `${config.appOrigin}/`,
      usePopup: true,
    })
    const response = await window.AppleID.auth.signIn()
    return {
      kind: 'apple-popup',
      id_token: response.authorization.id_token,
      code: response.authorization.code,
      user: response.user,
    }
  }

  // Android native → redirect flow.
  const exitPath = config.exitPath ?? DEFAULT_EXIT_PATH
  const authPath = config.authPath ?? DEFAULT_AUTH_PATH
  const responseMode = config.responseMode ?? 'fragment'

  let redirectUri: string
  if (responseMode === 'form_post') {
    if (!config.formPostHandlerUrl) {
      throw new DespiaOAuthError(
        'missing_form_post_handler',
        '`responseMode: "form_post"` requires `formPostHandlerUrl`.',
      )
    }
    redirectUri = config.formPostHandlerUrl
  } else {
    redirectUri = `${config.appOrigin}${exitPath}`
  }

  const url =
    'https://appleid.apple.com/auth/authorize?' +
    new URLSearchParams({
      client_id: config.servicesId,
      redirect_uri: redirectUri,
      response_type: 'code id_token',
      scope: (config.scopes ?? ['name', 'email']).join(' '),
      response_mode: responseMode,
      state: encodeState({
        scheme: config.deeplinkScheme,
        spec: { loc: 'fragment', ap: authPath },
      }),
    }).toString()

  return openOAuth(url, { runtime })
}

// ============================================================================
// tiktok — server-side code exchange
// ============================================================================

export interface OauthTikTokConfig extends BaseConfig {
  /** TikTok Login Kit Client Key (public). */
  clientKey: string
  /**
   * Backend endpoint that exchanges the authorization code for tokens.
   * The callback page POSTs `{ code, redirect_uri, state }` and expects
   * `{ access_token, refresh_token? }` back.
   *
   * Pass an absolute URL when your callback page and backend are on
   * different origins. For same-origin setups, prefer server-rendering
   * the callback with the session token already in the URL.
   */
  exchangeEndpoint: string
  /** Scopes (TikTok uses comma-separated). Default: `['user.info.basic']`. */
  scopes?: string[]
  /** Where TikTok redirects land. Defaults to `/native-callback.html`. */
  exitPath?: string
}

function tiktok(config: OauthTikTokConfig): OpenOAuthResult {
  if (!config.clientKey) {
    throw new DespiaOAuthError('missing_client_key', 'TikTok clientKey is required.')
  }
  if (!config.exchangeEndpoint) {
    throw new DespiaOAuthError(
      'missing_exchange_endpoint',
      'TikTok requires `exchangeEndpoint` — Client Secret stays server-side.',
    )
  }
  if (!config.deeplinkScheme) {
    throw new DespiaOAuthError(
      'missing_deeplink_scheme',
      '`deeplinkScheme` is required.',
    )
  }

  const exitPath = config.exitPath ?? DEFAULT_EXIT_PATH
  const authPath = config.authPath ?? DEFAULT_AUTH_PATH
  const runtime = detectRuntime()
  const redirectUri =
    runtime.kind === 'native'
      ? `${config.appOrigin}${exitPath}`
      : `${config.appOrigin}${authPath}`

  const url =
    'https://www.tiktok.com/v2/auth/authorize/?' +
    new URLSearchParams({
      client_key: config.clientKey,
      response_type: 'code',
      // TikTok wants commas, not spaces. Not RFC-compliant but TikTok.
      scope: (config.scopes ?? ['user.info.basic']).join(','),
      redirect_uri: redirectUri,
      state: encodeState({
        scheme: config.deeplinkScheme,
        spec: { loc: 'code', ex: config.exchangeEndpoint, ap: authPath },
      }),
    }).toString()

  return openOAuth(url, { runtime })
}

// ============================================================================
// Public namespace
// ============================================================================

export const oauth = {
  /** Generic OAuth — pass any authorize URL inline. */
  signIn,
  /** Apple Sign In. JS SDK popup on iOS, redirect on Android. */
  apple,
  /** TikTok with server-side code exchange. */
  tiktok,
  /** True when the current runtime is Despia iOS native. */
  isIOSNative: isDespiaIOS,
}

export type { OpenOAuthResult }
