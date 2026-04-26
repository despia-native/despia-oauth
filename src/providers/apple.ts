import { encodeState } from '../deeplink.js'
import { detectRuntime } from '../runtime.js'
import { DespiaOAuthError } from '../types.js'
import type { BaseOAuthConfig } from '../types.js'

/**
 * Configuration for Sign In with Apple.
 *
 * Apple is the one provider where the runtime split actually matters in the
 * client code, because:
 *
 *   - On iOS native, the Apple JS SDK with `usePopup: true` opens the native
 *     Face ID / Apple ID sheet directly inside WKWebView. No `oauth://` bridge,
 *     no `native-callback.html`. The id_token comes back through the JS SDK
 *     callback. This is what Apple *requires* — using a redirect flow on iOS
 *     causes a blank white page during auth and leads to App Store rejection.
 *
 *   - On Android native, the Apple JS SDK does *not* trigger a native dialog,
 *     so you have to use the standard `oauth://` bridge → Chrome Custom Tabs.
 *
 *   - On web, the Apple JS SDK popup works the same as on iOS native.
 *
 * This module covers the URL-building side for Android. The iOS popup side is
 * a thin wrapper around the global `AppleID.auth.signIn()` and is exposed
 * separately (see `signInWithAppleIOS`).
 */
export interface AppleConfig extends BaseOAuthConfig {
  /**
   * Apple Services ID (e.g. `com.yourcompany.yourapp.webauth`). Set up in
   * Apple Developer Console > Identifiers > Services IDs.
   */
  servicesId: string
  /**
   * Scopes. Apple supports `name` and `email`. Default: both. Note that
   * Apple only sends the user's name on the *very first* sign-in — capture
   * it in your backend POST handler immediately, you won't get another chance.
   */
  scopes?: ('name' | 'email')[]
  /**
   * Response mode. `fragment` is simplest (Apple redirects to your callback
   * with `#id_token=...` in the hash). `form_post` is more secure (Apple
   * POSTs the token to your backend, which then redirects to the callback).
   * Default: `fragment`.
   *
   * `query` is *not* allowed when requesting an id_token, and Apple will
   * reject the request — we throw early below if you try.
   */
  responseMode?: 'fragment' | 'form_post'
  /** Native callback path. Defaults to `/native-callback.html`. */
  nativeCallbackPath?: string
  /**
   * For `form_post` mode: path on your *backend* that receives Apple's POST.
   * Required only when responseMode is `form_post`.
   */
  formPostHandlerPath?: string
}

/**
 * Build the Apple OAuth authorize URL for the Android native flow.
 *
 * Do NOT use this on iOS — on iOS, use `AppleID.auth.signIn({ usePopup: true })`
 * directly. The runtime check below will throw if you accidentally call this
 * on iOS native, so misuse is loud rather than silent.
 */
export function buildAppleAuthUrl(config: AppleConfig): string {
  if (!config.servicesId) {
    throw new DespiaOAuthError('missing_services_id', 'Apple servicesId is required.')
  }

  const runtime = detectRuntime()
  if (runtime.kind === 'native' && runtime.platform === 'ios') {
    // Catching this at build time rather than letting it silently 404 in the
    // browser session saves a lot of debugging.
    throw new DespiaOAuthError(
      'wrong_platform',
      'On iOS native, use the Apple JS SDK directly with `usePopup: true`. The redirect flow causes a blank screen and App Store rejection.',
    )
  }

  const responseMode = config.responseMode ?? 'fragment'
  const scopes = (config.scopes ?? ['name', 'email']).join(' ')

  const redirectUri =
    responseMode === 'form_post'
      ? config.formPostHandlerPath
        ? `${config.appOrigin}${config.formPostHandlerPath}`
        : (() => {
            throw new DespiaOAuthError(
              'missing_form_post_handler',
              'responseMode "form_post" requires `formPostHandlerPath` pointing to your backend handler.',
            )
          })()
      : `${config.appOrigin}${config.nativeCallbackPath ?? '/native-callback.html'}`

  const params = new URLSearchParams({
    client_id: config.servicesId,
    redirect_uri: redirectUri,
    // `code id_token` is what Apple wants for the authorization-code+id_token
    // hybrid flow. `code` alone returns no id_token; `id_token` alone returns
    // no code (and you usually want both — code for refresh, id_token for
    // identity).
    response_type: 'code id_token',
    scope: scopes,
    response_mode: responseMode,
    state: encodeState(config.deeplinkScheme),
  })

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`
}

/**
 * Sign in with Apple using the Apple JS SDK popup.
 *
 * Works on iOS native (opens the native Face ID sheet) and on web (opens a
 * popup window). On Android native, throws — use the redirect flow there.
 *
 * The Apple JS SDK must already be loaded on the page:
 *   <script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
 */
export interface AppleJSSignInResult {
  authorization: {
    code: string
    id_token: string
    state?: string
  }
  user?: {
    name?: { firstName?: string; lastName?: string }
    email?: string
  }
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string
          scope: string
          redirectURI: string
          state?: string
          usePopup: boolean
        }) => void
        signIn: () => Promise<AppleJSSignInResult>
      }
    }
  }
}

export async function signInWithAppleJS(config: {
  servicesId: string
  scopes?: ('name' | 'email')[]
  /**
   * The redirect URI must match the **origin** of the page running the SDK,
   * including trailing slash. Apple does exact string matching, and a missing
   * slash is the single most common reason this fails silently in production.
   */
  redirectURI: string
}): Promise<AppleJSSignInResult> {
  const runtime = detectRuntime()
  if (runtime.kind === 'native' && runtime.platform === 'android') {
    throw new DespiaOAuthError(
      'wrong_platform',
      'On Android native, use buildAppleAuthUrl() + openOAuth() instead. The Apple JS SDK does not trigger a native dialog on Android.',
    )
  }
  if (typeof window === 'undefined' || !window.AppleID?.auth) {
    throw new DespiaOAuthError(
      'apple_sdk_not_loaded',
      'Apple JS SDK is not loaded. Add <script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script> before your app script.',
    )
  }

  window.AppleID.auth.init({
    clientId: config.servicesId,
    scope: (config.scopes ?? ['name', 'email']).join(' '),
    redirectURI: config.redirectURI,
    usePopup: true,
  })

  return window.AppleID.auth.signIn()
}
