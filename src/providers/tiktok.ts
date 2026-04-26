import { encodeState } from '../deeplink.js'
import { detectRuntime } from '../runtime.js'
import { DespiaOAuthError } from '../types.js'
import type { BaseOAuthConfig } from '../types.js'

/**
 * Configuration for TikTok Login Kit.
 *
 * TikTok always requires authorization-code flow with a backend exchange,
 * so unlike Google there's no "Supabase handles it" shortcut. You'll always
 * need both this client-side URL builder *and* a backend code-exchange
 * endpoint that calls TikTok's `/v2/oauth/token/`.
 */
export interface TikTokConfig extends BaseOAuthConfig {
  /** TikTok Login Kit Client Key. Public, safe to ship to the client. */
  clientKey: string
  /**
   * OAuth scopes. Defaults to `user.info.basic` which gets you `open_id`,
   * `display_name`, and `avatar_url` — enough to identify and welcome a
   * returning user.
   */
  scopes?: string[]
  /** Path on your app for the WebView's `/native-callback`. Defaults to `/native-callback`. */
  nativeCallbackPath?: string
  /** Path on your app where the web flow lands. Defaults to `/auth`. */
  webCallbackPath?: string
}

/**
 * Build the TikTok OAuth authorize URL.
 *
 * The redirect URI changes based on runtime: native points at
 * `/native-callback` (no `.html` for TikTok per the docs — they're inconsistent
 * with Google here, but it's whatever you registered in the Developer Portal),
 * web points at `/auth` directly. Both must be registered.
 */
export function buildTikTokAuthUrl(config: TikTokConfig): string {
  if (!config.clientKey) {
    throw new DespiaOAuthError('missing_client_key', 'TikTok clientKey is required.')
  }

  const runtime = detectRuntime()
  const scopes = (config.scopes ?? ['user.info.basic']).join(',')

  const redirectUri =
    runtime.kind === 'native'
      ? `${config.appOrigin}${config.nativeCallbackPath ?? '/native-callback'}`
      : `${config.appOrigin}${config.webCallbackPath ?? '/auth'}`

  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: 'code',
    scope: scopes,
    redirect_uri: redirectUri,
    // TikTok uses commas not spaces between scopes (yes, really — they're not
    // RFC-compliant) and the `client_key` parameter name instead of `client_id`.
    state: encodeState(config.deeplinkScheme),
  })

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
}
