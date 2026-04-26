/**
 * @despia/oauth — OAuth for Despia apps. Native ASWebAuthenticationSession
 * (iOS) and Chrome Custom Tabs (Android) via the Despia URL-scheme bridge.
 * Zero runtime dependencies. MIT licensed.
 *
 * Recommended high-level API:
 *
 *   import { oauth } from '@despia/oauth'
 *
 *   oauth.google({ supabaseUrl, deeplinkScheme, appOrigin })
 *   await oauth.apple({ servicesId, deeplinkScheme, appOrigin })  // async on iOS only
 *   oauth.tiktok({ clientKey, exchangeEndpoint, deeplinkScheme, appOrigin })
 *   oauth.custom({ url, tokenLocation, deeplinkScheme, appOrigin })
 *
 * Drop-in web components for the callback pages:
 *
 *   import '@despia/oauth/web-components'
 *
 *   <despia-oauth-callback></despia-oauth-callback>      ← in /native-callback.html
 *   <despia-oauth-tokens></despia-oauth-tokens>          ← in /auth
 *
 * Lower-level building blocks (escape hatch):
 *
 *   detectRuntime, openOAuth, parseCallback, buildDeeplink,
 *   encodeState, decodeState, watchCallbackUrl, handleNativeCallback
 *
 * The native bridge: `window.despia = "oauth://?url=..."` is observed by
 * the Despia runtime at the OS URL-scheme level. No external library, no
 * peer dependency. We never sniff `window.despia` as a runtime branching
 * condition — UA is the canonical signal for "are we inside Despia."
 */

// Recommended high-level API
export { oauth } from './oauth.js'
export type {
  OauthSignInConfig,
  OauthAppleConfig,
  OauthAppleIOSResult,
  OauthTikTokConfig,
} from './oauth.js'

// Runtime detection
export { detectRuntime, isDespia, isDespiaIOS, isDespiaAndroid } from './runtime.js'

// Deeplink construction & state encoding
export { buildDeeplink, encodeState, decodeState } from './deeplink.js'
export type { TokenLocation, TokenSpec, EncodeStateInput, DecodedState } from './deeplink.js'

// Callback parsing
export { parseCallback, hasCallbackData } from './callback.js'

// Framework-agnostic URL watcher (web components, plain JS, Solid, Qwik)
export { watchCallbackUrl } from './watchCallback.js'
export type { CallbackHandler, CallbackWatcherOptions } from './watchCallback.js'

// Low-level open
export { openOAuth } from './open.js'
export type { OpenOAuthResult, OpenOAuthOptions } from './open.js'

// Drop-in handler for the /native-callback page (when using a framework
// route instead of the web component)
export { handleNativeCallback } from './handleNativeCallback.js'
export type {
  HandleNativeCallbackOptions,
  NativeCallbackResult,
  ExchangeCodeFn,
} from './handleNativeCallback.js'

// Types & errors
export { DespiaOAuthError } from './types.js'
export type {
  Runtime,
  ResponseType,
  ResponseMode,
  OAuthCallbackTokens,
  ParsedCallback,
  BaseOAuthConfig,
} from './types.js'
