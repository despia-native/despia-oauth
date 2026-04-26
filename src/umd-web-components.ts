/**
 * UMD entry point that auto-registers the `<despia-oauth-callback>` and
 * `<despia-oauth-tokens>` custom elements.
 *
 * For the truly Duplo CDN setup:
 *
 *   <!-- in your /native-callback.html -->
 *   <despia-oauth-callback></despia-oauth-callback>
 *   <script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
 *
 * After this script loads, the elements are registered. The callback page
 * reads its config from the OAuth `state` parameter (encoded by the
 * `oauth.*()` helpers when the URL was built), so attribute config is
 * usually unnecessary.
 */
export {
  DespiaOAuthCallbackElement,
  DespiaOAuthTokensElement,
  defineDespiaOAuthElements,
} from './web-components/auto-register.js'
