import { parseCallback } from './callback.js'
import { buildDeeplink } from './deeplink.js'
import { DespiaOAuthError } from './types.js'
import type { OAuthCallbackTokens } from './types.js'

/**
 * Result of `handleNativeCallback`. Tells you whether a deeplink was fired
 * and, if so, where to. Mostly useful for testing — in real usage the page
 * navigates immediately after the deeplink fires.
 */
export interface NativeCallbackResult {
  status: 'fired-deeplink' | 'error'
  deeplinkUrl?: string
  error?: { code: string; message: string }
}

/**
 * Optional hook for converting an authorization `code` into tokens before
 * the deeplink fires. This runs inside the secure browser session, so it can
 * make authenticated POSTs to your backend without involving the WebView.
 *
 * Return whatever you want passed back to the WebView via the deeplink — at
 * minimum, an `access_token` or `session_token` so the `/auth` page has
 * something to set the session with.
 */
export type ExchangeCodeFn = (args: {
  code: string
  state: string | null
  redirectUri: string
}) => Promise<Partial<OAuthCallbackTokens>>

export interface HandleNativeCallbackOptions {
  /**
   * Fallback deeplink scheme, used only when `state` did not encode one.
   * In practice you should always encode the scheme into `state` (the
   * provider builders in this package do that for you), but giving callers
   * a fallback makes the flow more debuggable.
   */
  fallbackScheme?: string
  /**
   * Path to navigate the WebView to after the browser session closes.
   * Defaults to `/auth`, matching the Despia docs.
   */
  authPath?: string
  /**
   * Called for the authorization-code flow. If omitted, the `code` is
   * forwarded to `/auth` unchanged and the WebView is expected to do the
   * exchange itself. Most apps want the opposite — exchange here, then send
   * the resulting tokens to the WebView.
   */
  exchangeCode?: ExchangeCodeFn
  /**
   * Called instead of `window.location.href = ...`. Mostly for tests.
   * Returning a Promise is fine; the function awaits it.
   */
  navigate?: (url: string) => void | Promise<void>
}

/**
 * Drop-in handler for your `/native-callback` page.
 *
 * Reads tokens from the URL (fragment or query, both flows supported),
 * optionally exchanges an authorization code for tokens via your backend,
 * then fires `{scheme}://oauth{authPath}?...tokens` to close the browser
 * session and pass the tokens through to the WebView.
 *
 * This is what most users will copy-paste into their `public/native-callback.html`,
 * so the implementation has to handle the long list of edge cases the docs
 * call out: missing scheme, missing token, exchange failure, network error.
 */
export async function handleNativeCallback(
  options: HandleNativeCallbackOptions = {},
): Promise<NativeCallbackResult> {
  const {
    fallbackScheme,
    authPath = '/auth',
    exchangeCode,
    navigate = (url: string) => {
      window.location.href = url
    },
  } = options

  const parsed = parseCallback(window.location.href)
  const scheme =
    parsed.deeplinkScheme ??
    // Allow `?deeplink_scheme=myapp` as a backup for providers/backends that
    // can't be coaxed into round-tripping `state` (rare, but Apple form_post
    // configs sometimes do this).
    new URLSearchParams(window.location.search).get('deeplink_scheme') ??
    fallbackScheme ??
    null

  if (!scheme) {
    const err = new DespiaOAuthError(
      'no_deeplink_scheme',
      'Could not determine deeplink scheme. Encode it into `state` when building the OAuth URL, or pass `fallbackScheme`.',
    )
    return { status: 'error', error: { code: err.code, message: err.message } }
  }

  // Provider-reported errors are forwarded straight to the WebView, where
  // the `/auth` page is responsible for showing them. Doing it here would
  // mean two places to update error UI.
  if (parsed.tokens.error) {
    const url = buildDeeplink(scheme, authPath, {
      error: parsed.tokens.error,
      error_description: parsed.tokens.error_description,
    })
    await navigate(url)
    return { status: 'fired-deeplink', deeplinkUrl: url }
  }

  // Code flow: exchange the code (if a callback was provided), then forward.
  if (parsed.tokens.code && exchangeCode) {
    try {
      const result = await exchangeCode({
        code: parsed.tokens.code,
        state: parsed.cleanState,
        redirectUri: window.location.origin + window.location.pathname,
      })
      const url = buildDeeplink(scheme, authPath, {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        id_token: result.id_token,
        session_token: result.session_token,
      })
      await navigate(url)
      return { status: 'fired-deeplink', deeplinkUrl: url }
    } catch (e) {
      // Exchange failures are common (mismatched redirect_uri, expired code,
      // wrong client secret), so route them through the same error pipe as
      // provider-reported errors — the user just sees a normal error screen
      // in the app, no half-open browser tab.
      const url = buildDeeplink(scheme, authPath, {
        error: 'exchange_failed',
        error_description: e instanceof Error ? e.message : 'Code exchange failed',
      })
      await navigate(url)
      return {
        status: 'fired-deeplink',
        deeplinkUrl: url,
        error: {
          code: 'exchange_failed',
          message: e instanceof Error ? e.message : 'Code exchange failed',
        },
      }
    }
  }

  // No exchange callback: forward whatever we got. This covers:
  //   - implicit flow (access_token already present)
  //   - Apple id_token flow
  //   - code flow where the WebView wants to handle the exchange itself
  //   - form_post flow where the backend already swapped code → session_token
  //     before redirecting here
  const t = parsed.tokens
  const hasAnyToken = t.access_token || t.id_token || t.code || t.session_token
  if (!hasAnyToken) {
    const url = buildDeeplink(scheme, authPath, {
      error: 'no_tokens',
      error_description: 'Callback URL contained no tokens or code.',
    })
    await navigate(url)
    return {
      status: 'fired-deeplink',
      deeplinkUrl: url,
      error: { code: 'no_tokens', message: 'Callback URL contained no tokens or code.' },
    }
  }

  const url = buildDeeplink(scheme, authPath, {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    id_token: t.id_token,
    code: t.code,
    session_token: t.session_token,
  })
  await navigate(url)
  return { status: 'fired-deeplink', deeplinkUrl: url }
}
