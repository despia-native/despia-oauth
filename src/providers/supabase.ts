import { encodeState } from '../deeplink.js'
import { detectRuntime } from '../runtime.js'
import { DespiaOAuthError } from '../types.js'
import type { BaseOAuthConfig } from '../types.js'

/**
 * Build a Supabase Auth `/authorize` URL for any OAuth provider Supabase
 * supports (Google, GitHub, Apple, Discord, Spotify, Twitch, Slack, etc.).
 *
 * Why this exists: the Despia docs walk through a Supabase Edge Function that
 * builds this URL on the server. That works, but the URL is fully public —
 * the SUPABASE_URL is public, the provider name is public, the redirect_to
 * is public — so there's no real reason to round-trip through an Edge
 * Function. Building it on the client side eliminates one server hop and
 * one set of cold-start latency.
 *
 * Use this when:
 *   • You use Supabase Auth as your session provider AND
 *   • The IdP (e.g. Google) is set up inside Supabase Auth > Providers AND
 *   • You want the implicit flow (Supabase handles the code exchange)
 *
 * Don't use this when you're talking to the IdP directly (e.g., a custom
 * Google PKCE flow with no Supabase). Use the provider-specific builder
 * (`buildGoogleAuthUrl` etc.) for that.
 */
export interface SupabaseConfig extends BaseOAuthConfig {
  /**
   * Your Supabase project URL, e.g. `https://abcdefg.supabase.co`.
   * Public — safe to ship to the client.
   */
  supabaseUrl: string
  /**
   * The provider as registered with Supabase. Common values: `google`,
   * `github`, `apple`, `discord`, `spotify`, `twitch`, `slack`, `azure`.
   * See https://supabase.com/docs/guides/auth/social-login for the full list.
   */
  provider: string
  /** Space-separated scopes for the underlying provider. Provider-dependent. */
  scopes?: string
  /** Native callback path on your app. Defaults to `/native-callback.html`. */
  nativeCallbackPath?: string
  /** Web callback path on your app. Defaults to `/auth`. */
  webCallbackPath?: string
  /**
   * Flow type. `implicit` (default) returns tokens in the URL fragment.
   * `pkce` returns a code that Supabase exchanges via the SDK; if you use
   * `pkce` you'll handle the code on the WebView side via supabase.auth.exchangeCodeForSession.
   */
  flowType?: 'implicit' | 'pkce'
}

export function buildSupabaseAuthUrl(config: SupabaseConfig): string {
  if (!config.supabaseUrl) {
    throw new DespiaOAuthError('missing_supabase_url', 'supabaseUrl is required.')
  }
  if (!config.provider) {
    throw new DespiaOAuthError('missing_provider', 'provider is required (e.g. "google").')
  }

  const runtime = detectRuntime()
  // Native flows have to land on `/native-callback.html` so it can fire the
  // close-and-navigate deeplink. Web flows land directly on `/auth`.
  const redirectTo =
    runtime.kind === 'native'
      ? `${config.appOrigin}${config.nativeCallbackPath ?? '/native-callback.html'}`
      : `${config.appOrigin}${config.webCallbackPath ?? '/auth'}`

  const params = new URLSearchParams({
    provider: config.provider,
    redirect_to: redirectTo,
    flow_type: config.flowType ?? 'implicit',
    state: encodeState(config.deeplinkScheme),
  })
  if (config.scopes) params.set('scopes', config.scopes)

  // Strip any trailing slash from supabaseUrl so we don't end up with `//auth/v1`.
  const base = config.supabaseUrl.replace(/\/$/, '')
  return `${base}/auth/v1/authorize?${params.toString()}`
}
