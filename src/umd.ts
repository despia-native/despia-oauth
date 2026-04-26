/**
 * UMD entry. Bundled as `dist/umd/despia-oauth.min.js` and exposed as
 * `window.DespiaOAuth` for `<script>`-tag users (unpkg, jsdelivr).
 *
 * **CDN setup — single tag, no other dependencies:**
 *
 *   <script src="https://unpkg.com/@despia/oauth"></script>
 *
 *   <script>
 *     DespiaOAuth.oauth.signIn({
 *       url:            'https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fyourapp.com%2Fnative-callback.html',
 *       deeplinkScheme: 'myapp',
 *       appOrigin:      'https://yourapp.com',
 *     })
 *   </script>
 *
 * Same API for any OAuth provider — pass any authorize URL (Supabase,
 * Auth0, Clerk, your own backend, anything). Apple Sign In has its own
 * helper because of the iOS popup vs Android redirect split:
 *
 *     await DespiaOAuth.oauth.apple({
 *       servicesId:     'com.example.web',
 *       deeplinkScheme: 'myapp',
 *       appOrigin:      'https://yourapp.com',
 *     })
 *
 * The native bridge is a single `window.despia = "oauth://?url=..."`
 * assignment that the Despia runtime intercepts at the OS URL-scheme
 * level. No external library, no command queue, no peer dependency.
 *
 * Framework adapters (React, Vue, Svelte) are NOT in this bundle. CDN
 * users typically work with the DOM directly. For drop-in custom
 * elements use the separate web-components UMD:
 *
 *   <script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
 */

export { oauth } from './oauth.js'
export type {
  OauthSignInConfig,
  OauthAppleConfig,
  OauthAppleIOSResult,
  OauthTikTokConfig,
} from './oauth.js'

export {
  detectRuntime,
  isDespia,
  isDespiaIOS,
  isDespiaAndroid,
} from './runtime.js'

export { buildDeeplink, encodeState, decodeState } from './deeplink.js'
export type { TokenLocation, TokenSpec } from './deeplink.js'

export { parseCallback, hasCallbackData } from './callback.js'

export { watchCallbackUrl } from './watchCallback.js'

export { openOAuth } from './open.js'

export { handleNativeCallback } from './handleNativeCallback.js'

export { DespiaOAuthError } from './types.js'
