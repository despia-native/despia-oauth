import { encodeState } from '../deeplink.js'
import { detectRuntime } from '../runtime.js'
import { DespiaOAuthError } from '../types.js'
import type { BaseOAuthConfig } from '../types.js'

/**
 * Configuration for Google OAuth.
 *
 * Note this is for *direct* Google OAuth (you implementing the authorization
 * code + PKCE flow yourself). If you're using Supabase, Firebase, or another
 * auth provider as the front for Google, use that provider's authorize URL
 * instead and pass it directly to `openOAuth()` — the docs cover this case
 * separately.
 */
export interface GoogleConfig extends BaseOAuthConfig {
  /** Google OAuth 2.0 Client ID. Public, safe to ship to the client. */
  clientId: string
  /**
   * OAuth scopes to request. Defaults to the standard `openid email profile`
   * which is what most apps want.
   */
  scopes?: string[]
  /**
   * The path on your backend where the authorization code is exchanged for
   * tokens. Required for native; on web you typically don't need this since
   * Supabase/Firebase/etc. handle the round-trip for you.
   */
  backendCallbackPath?: string
  /** Path on your app for the WebView's `/native-callback`. Defaults to `/native-callback.html`. */
  nativeCallbackPath?: string
  /** Path on your app where the web flow lands. Defaults to `/auth`. */
  webCallbackPath?: string
  /**
   * Pre-generated PKCE code challenge (base64url-encoded SHA-256 of the verifier).
   * Required when running native: the verifier itself stays server-side and
   * the challenge ships in the URL. Generate both with `pkceChallenge()` from
   * a PKCE helper, store the verifier in your backend session, and pass the
   * challenge here.
   */
  pkceChallenge?: string
}

/**
 * Build the Google OAuth authorize URL.
 *
 * On the web you usually don't call this — your auth provider's SDK builds
 * the URL itself and handles the redirect. The native flow is where you need
 * a custom URL because the redirect has to point at `/native-callback.html`
 * on your domain (so it can fire the deeplink) rather than at your auth
 * provider's hosted callback.
 */
export function buildGoogleAuthUrl(config: GoogleConfig): string {
  if (!config.clientId) {
    throw new DespiaOAuthError('missing_client_id', 'Google clientId is required.')
  }

  const runtime = detectRuntime()
  const scopes = (config.scopes ?? ['openid', 'email', 'profile']).join(' ')

  // The redirect URI logic: native goes to `/native-callback.html` on your
  // domain (which then fires the deeplink), web goes to `/auth` directly.
  // Both must be registered in the Google Cloud Console.
  const redirectUri =
    runtime.kind === 'native'
      ? `${config.appOrigin}${config.nativeCallbackPath ?? '/native-callback.html'}`
      : `${config.appOrigin}${config.webCallbackPath ?? '/auth'}`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: encodeState(config.deeplinkScheme),
    // `access_type=offline` + `prompt=consent` is what gets you a refresh
    // token from Google. Without these, you only get an access_token that
    // expires in an hour, which is a footgun in a mobile app.
    access_type: 'offline',
    prompt: 'consent',
  })

  if (config.pkceChallenge) {
    params.set('code_challenge', config.pkceChallenge)
    params.set('code_challenge_method', 'S256')
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
