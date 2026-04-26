/**
 * Side-effect entry point that auto-registers `<despia-oauth-callback>`
 * and `<despia-oauth-tokens>` as custom elements.
 *
 * Most users want this — drop a `<script>` tag and forget. The exported
 * names are also available so power users can grab the classes directly:
 *
 *   import 'https://unpkg.com/@despia/oauth/web-components'
 *   // ↑ that's it. The elements are now registered.
 *
 * For environments where you want the classes WITHOUT auto-registration
 * (e.g. you're embedding inside another web-component-based library), use
 * `@despia/oauth/web-components/manual` instead and call
 * `defineDespiaOAuthElements()` yourself.
 */
import {
  DespiaOAuthCallbackElement,
  DespiaOAuthTokensElement,
  defineDespiaOAuthElements,
} from './index.js'

defineDespiaOAuthElements()

export {
  DespiaOAuthCallbackElement,
  DespiaOAuthTokensElement,
  defineDespiaOAuthElements,
}
