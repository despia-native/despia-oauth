# Despia OAuth

**`@despia/oauth`** — zero runtime dependencies. Opens OAuth in Despia’s secure browser (`oauth://?url=…`), returns to your WebView with `{scheme}://oauth/…` (the `oauth/` segment is required).

**Entry points**

| Import | Use for |
|--------|---------|
| `@despia/oauth` | `oauth`, parsers, `openOAuth`, `handleNativeCallback`, types |
| `@despia/oauth/web-components` | Registers `<despia-oauth-callback>` and `<despia-oauth-tokens>` on import |
| `@despia/oauth/web-components/manual` | Same components; you call `defineDespiaOAuthElements()` yourself |
| `@despia/oauth/server/apple-form-post` | Apple `form_post` → 302 to static callback (Node/Deno/Workers, Web `Request`/`Response`) |

**UMD (no bundler):** `dist/umd/despia-oauth.min.js` → `window.DespiaOAuth`, `dist/umd/web-components.min.js` → `window.DespiaOAuthWebComponents`.

```bash
npm install @despia/oauth
```

---

## Flow

1. `oauth.signIn` / `oauth.apple` / `oauth.tiktok` → secure browser (or `openOAuth` with your own URL).
2. IdP redirects to `/native-callback` (query, `#fragment`, or `?code=`).
3. `<despia-oauth-callback>` or `handleNativeCallback()` → `{scheme}://oauth/auth?…`.
4. WebView loads `/auth?…`; `<despia-oauth-tokens>` or `parseCallback` / `watchCallbackUrl`.

**Apple `form_post` (Android):** Apple POSTs a body your static HTML cannot read. Handle POST server-side → **302** to `/native-callback.html?…` → steps 3–4 unchanged (`@despia/oauth/server/apple-form-post`).

---

## `oauth` (high level)

```ts
import { oauth } from '@despia/oauth'

oauth.signIn({ ... })   // any authorize URL you built
await oauth.apple({ ... })  // iOS/web: Apple JS popup → OauthAppleIOSResult; Android: redirect → OpenOAuthResult
oauth.tiktok({ ... })   // TikTok authorize + code in state for exchange
oauth.isIOSNative()     // boolean
```

### `oauth.signIn(config: OauthSignInConfig): OpenOAuthResult`

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `url` | `string` | yes | Full `https://…` authorize URL. `state` is appended (CSRF + scheme + token spec). |
| `deeplinkScheme` | `string` | yes | Bare scheme, e.g. `myapp` (Despia Publish → Deeplink). |
| `appOrigin` | `string` | yes | `https://yourapp.com` |
| `authPath` | `string` | no | WebView path after return. Default `/auth`. |
| `tokenLocation` | `TokenLocation` | no | Default `'both'`. See [Token locations](#token-locations). |
| `exchangeEndpoint` | `string` | if `tokenLocation === 'code'` | Absolute URL if callback origin ≠ API. |

Returns `{ kind: 'opened-native' }` or `{ kind: 'navigating-web' }`.

### `oauth.apple(config: OauthAppleConfig)`

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `servicesId` | `string` | yes | Apple Services ID (client id). |
| `deeplinkScheme` | `string` | yes | |
| `appOrigin` | `string` | yes | |
| `authPath` | `string` | no | Default `/auth`. |
| `scopes` | `('name' \| 'email')[]` | no | Default `['name','email']`. |
| `exitPath` | `string` | no | Android redirect URI path. Default `/native-callback.html`. |
| `responseMode` | `'fragment' \| 'form_post'` | no | Android. Default `'fragment'`. |
| `formPostHandlerUrl` | `string` | if `responseMode === 'form_post'` | Absolute URL of your POST handler. |
| `iosRedirectURI` | `string` | no | iOS/web popup; must match Apple portal. Default `appOrigin + '/'`. |

- **iOS native** or **web:** uses Apple JS SDK (`window.AppleID`). You must load Apple’s script. Resolves to `OauthAppleIOSResult`: `{ kind: 'apple-popup', id_token, code, user? }`.
- **Android native:** redirect to Apple; resolves to `OpenOAuthResult` like `signIn`.

### `oauth.tiktok(config: OauthTikTokConfig): OpenOAuthResult`

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `clientKey` | `string` | yes | TikTok public client key. |
| `exchangeEndpoint` | `string` | yes | Callback POSTs `{ code, redirect_uri, state }`; response JSON becomes tokens. |
| `deeplinkScheme` | `string` | yes | |
| `appOrigin` | `string` | yes | |
| `authPath` | `string` | no | Default `/auth`. |
| `scopes` | `string[]` | no | Default `['user.info.basic']`; joined with **commas** for TikTok. |
| `exitPath` | `string` | no | Default `/native-callback.html`. Native redirect URI = `appOrigin + exitPath`. |

---

## `openOAuth` & runtime

```ts
import { openOAuth, detectRuntime, isDespia, isDespiaIOS, isDespiaAndroid } from '@despia/oauth'
```

**`openOAuth(oauthUrl: string, options?: { runtime?: Runtime }): OpenOAuthResult`**

- `oauthUrl` must be absolute `http:` / `https:`.
- Native: sets `window.despia = 'oauth://?url=' + encodeURIComponent(oauthUrl)`.
- Web: `window.location.href = oauthUrl`.

**`detectRuntime(): Runtime`**

- `{ kind: 'native', platform: 'ios' | 'android' }` — `navigator.userAgent` contains `despia` (case-insensitive).
- `{ kind: 'web' }` — browser, not Despia.
- `{ kind: 'ssr' }` — no `navigator` (do not treat as web for URL building).

**`isDespia()` / `isDespiaIOS()` / `isDespiaAndroid()`** — convenience booleans.

---

## State, deeplinks, parsing

### Token locations

`TokenLocation`: `'query' | 'fragment' | 'both' | 'code'`.

- **`both`** (default): read query and fragment; query wins.
- **`code`**: read `code` from query; exchange server-side (callback helper or your code).

### `encodeState` / `decodeState`

```ts
encodeState({ scheme, csrf?, spec? }) // recommended
encodeState(scheme: string, csrfToken?: string) // legacy: scheme string + optional csrf
```

**`EncodeStateInput`:** `scheme`, optional `csrf` (auto-generated if omitted), optional **`spec: TokenSpec`**:

| `TokenSpec` field | Meaning |
|-------------------|--------|
| `loc` | `TokenLocation` — where to read tokens on callback |
| `ex` | Code-exchange URL (when `loc === 'code'`) |
| `ap` | Auth path in WebView (default `/auth`) |

**`decodeState(state)` → `DecodedState`:** `csrfToken`, `deeplinkScheme`, `spec`.

### `buildDeeplink(scheme, path, params?)`

Builds `{scheme}://oauth/{path}?…`. `scheme` must be bare (no `:` / `/`). Drops empty param values.

### `parseCallback(url?)` / `hasCallbackData(parsed)`

**`parseCallback`** — `url` optional; defaults to `window.location.href`. If no `window`, returns empty tokens.

Returns **`ParsedCallback`:**

- `tokens` — **`OAuthCallbackTokens`:** `access_token?`, `refresh_token?`, `id_token?`, `code?`, `session_token?`, `expires_in?` (number), `state?`, `scope?`, `error?`, `error_description?`
- `deeplinkScheme`, `cleanState` (CSRF part), `spec`

**`hasCallbackData`** — true if any of `access_token`, `id_token`, `code`, `session_token`, or `error` is set.

### `watchCallbackUrl(onCallback, options?)`

Listens to `popstate` and `hashchange`, runs `onCallback(parseCallback())` **once per distinct `location.href`**. Options: `fireOnEmpty?`, `win?` (for tests). Returns **cleanup `()`** — call on unmount.

---

## `handleNativeCallback` (programmatic `/native-callback`)

```ts
import { handleNativeCallback } from '@despia/oauth'

await handleNativeCallback({
  authPath: '/auth',
  fallbackScheme: 'myapp',
  exchangeCode: async ({ code, state, redirectUri }) => ({ access_token: '…' }),
  navigate: (url) => { window.location.href = url },
})
```

| Option | Type | Notes |
|--------|------|--------|
| `authPath` | `string` | Default `/auth`. |
| `fallbackScheme` | `string` | Used if scheme missing from `state`; also supports `?deeplink_scheme=` on URL. |
| `exchangeCode` | `ExchangeCodeFn` | If set, runs for code flow before deeplink. Returns partial `OAuthCallbackTokens`. |
| `navigate` | `(url: string) => void \| Promise<void>` | Default assigns `location.href`. |

Returns **`NativeCallbackResult`:** `{ status: 'fired-deeplink', deeplinkUrl? }` or `{ status: 'error', error: { code, message } }`.

---

## Web components

**Register**

```ts
import '@despia/oauth/web-components'
```

**Manual register**

```ts
import { defineDespiaOAuthElements } from '@despia/oauth/web-components/manual'
defineDespiaOAuthElements()
```

### `<despia-oauth-callback>`

Runs once on connect. Uses `parseCallback` + `handleNativeCallback` (with optional fetch to `exchange-endpoint`).

| Attribute | Purpose |
|-----------|--------|
| `auth-path` | WebView path (overrides `state` spec `ap`). Default `/auth`. |
| `exchange-endpoint` | Absolute URL preferred. POST JSON `{ code, redirect_uri, state }` → JSON tokens. Overrides `state` spec `ex`. |
| `fallback-scheme` | If `state` has no scheme. |

**Events:** `oauth-success` (detail: `{ tokens }`), `oauth-error` (detail: `{ code, message }`).

### `<despia-oauth-tokens>`

Watches URL (popstate + hashchange). Fires when token-ish params appear.

| Attribute | Purpose |
|-----------|--------|
| `redirect-on-success` | If set, `location.href` after `tokens` (deferred `setTimeout(0)`). |

**Events:** `tokens` (detail: `OAuthCallbackTokens`), `oauth-error` (detail: `{ code, description }`).

---

## Server: Apple `form_post`

```ts
import {
  handleAppleFormPostRequest,
  parseAppleFormPostBody,
  buildAppleFormPostRedirectUrl,
  type AppleFormPostFields,
} from '@despia/oauth/server/apple-form-post'
```

| Export | Role |
|--------|------|
| `handleAppleFormPostRequest(req, opts)` | `POST` + `application/x-www-form-urlencoded` → `302` to `new URL(nativeCallbackPath, appOrigin)`. |
| `parseAppleFormPostBody(bodyText)` | `URLSearchParams` → `AppleFormPostFields`. |
| `buildAppleFormPostRedirectUrl(fields, opts)` | Build Location URL without handling a full `Request`. |

**`HandleAppleFormPostRequestOptions`:** `appOrigin`, `nativeCallbackPath`, optional `sessionToken`, optional **`mintSessionToken(fields)`** (if set, redirect uses `session_token` and skips raw token query params).

---

## Types & errors (from `@despia/oauth`)

Exported types include: `OauthSignInConfig`, `OauthAppleConfig`, `OauthAppleIOSResult`, `OauthTikTokConfig`, `OpenOAuthOptions`, `OpenOAuthResult`, `TokenLocation`, `TokenSpec`, `EncodeStateInput`, `DecodedState`, `CallbackWatcherOptions`, `CallbackHandler`, `HandleNativeCallbackOptions`, `NativeCallbackResult`, `ExchangeCodeFn`, `Runtime`, `ResponseType`, `ResponseMode`, `OAuthCallbackTokens`, `ParsedCallback`, `BaseOAuthConfig`.

**`DespiaOAuthError`** — subclass of `Error` with readonly **`code`** (`string`). Thrown for missing fields, invalid URL, Apple SDK missing, etc.

---

## Gotchas

- Deeplink must be `myapp://oauth/...`, not `myapp://auth/...`.
- `deeplinkScheme` is always required on helpers; not defaulted.
- `exchange-endpoint` on the callback element: relative same-origin works but triggers a console warning (extra round trip vs exchanging on GET).

## License

MIT — [`LICENSE`](./LICENSE).
