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

## Provider metadata & examples

Quick map:

| Provider | Client API | You configure (IdP) | Callback page | Server usually does |
|----------|------------|----------------------|-----------------|----------------------|
| **Generic** | `oauth.signIn({ url, … })` | Whatever URL you put in `url` | `redirect_uri` in that URL → `/native-callback.html` | Optional code → tokens |
| **Google** | Same — build Google’s authorize URL (or use Supabase/Auth0/etc.) | [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) client id + **Authorized redirect URIs** | Exact HTTPS URL you registered | Code exchange → Google token endpoint |
| **Apple** | `oauth.apple({ … })` | [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/) Services ID + Return URLs | iOS/web: popup redirect URI; Android: `appOrigin` + `exitPath` or `formPostHandlerUrl` | `form_post` → small POST handler (below) |
| **TikTok** | `oauth.tiktok({ … })` | [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-web/) client key + redirect URL in portal | Native: `appOrigin + exitPath`; Web: `appOrigin + authPath` | **Required** — Client Secret never in the app |

Always use **`https://` `appOrigin`** for redirect targets Despia’s secure browser can load.

### Generic OAuth (`oauth.signIn`)

You own the full authorize URL. This package only appends `state` (CSRF + deeplink scheme + token spec) and opens the URL.

```ts
oauth.signIn({
  url: authorizeUrl, // must already include client_id, redirect_uri, scope, …
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'both', // or 'query' | 'fragment' | 'code'
  exchangeEndpoint: 'https://api.yourapp.com/auth/exchange', // only if tokenLocation === 'code'
})
```

Set **`redirect_uri`** (inside `url`) to the same origin/path you actually host for `/native-callback` (often `https://yourapp.com/native-callback.html`). The WebView return path is still driven by encoded `state`, not by guessing from Google.

### Google Sign-In (via `oauth.signIn`)

There is no separate `oauth.google` — build [Google’s authorization request](https://developers.google.com/identity/protocols/oauth2/web-server#creatinganauthorizationrequest) (or your IdP’s Google button URL) and pass it to `oauth.signIn`.

**Metadata**

| Item | Typical value |
|------|----------------|
| Authorize | `https://accounts.google.com/o/oauth2/v2/auth` |
| `redirect_uri` | `https://yourapp.com/native-callback.html` (must match Google Cloud **Authorized redirect URIs** exactly) |
| `response_type` | `code` (recommended) → `tokenLocation: 'code'` + `exchangeEndpoint`; legacy implicit → `tokenLocation: 'fragment'` or `'both'` |
| `scope` | e.g. `openid email profile` |

```ts
const redirectUri = `${appOrigin}/native-callback.html`
const q = new URLSearchParams({
  client_id: GOOGLE_WEB_CLIENT_ID,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid email profile',
  access_type: 'offline',
  prompt: 'consent',
})
oauth.signIn({
  url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`,
  deeplinkScheme: 'myapp',
  appOrigin,
  tokenLocation: 'code',
  exchangeEndpoint: `${API_ORIGIN}/auth/google/exchange`,
})
```

**Supabase-style Google** (same idea: correct `redirect_to` + provider):

```ts
const redirectTo = encodeURIComponent(`${appOrigin}/native-callback.html`)
oauth.signIn({
  url: `https://<project>.supabase.co/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`,
  deeplinkScheme: 'myapp',
  appOrigin,
  tokenLocation: 'fragment', // or 'both' — match how Supabase returns tokens
})
```

### Apple Sign-In (`oauth.apple`)

| Surface | Behavior |
|---------|----------|
| Despia **iOS** native + **web** | [Apple JS SDK](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js) popup — load `https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`, then `await oauth.apple({ … })` returns `{ kind: 'apple-popup', id_token, code, user? }`. |
| Despia **Android** native | Redirect to `appleid.apple.com`; default `response_mode: 'fragment'` → tokens land on `exitPath`. Use `response_mode: 'form_post'` + `formPostHandlerUrl` if Apple is configured that way → **server** must POST→302 (see below). |

```html
<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
```

```ts
const result = await oauth.apple({
  servicesId: 'com.example.web',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  // Android only when using form_post:
  // responseMode: 'form_post',
  // formPostHandlerUrl: 'https://yourapp.com/api/apple/callback',
})
if (result.kind === 'apple-popup') {
  // send result.id_token / result.code to your backend
}
```

### TikTok Login (`oauth.tiktok`)

Uses `client_key`, comma-separated scopes, and **always** encodes a code flow + `exchangeEndpoint` in `state` for `<despia-oauth-callback>` to POST to your server.

| Item | Notes |
|------|--------|
| Authorize | `https://www.tiktok.com/v2/auth/authorize/` (built for you) |
| Redirect (native) | `appOrigin + exitPath` (default `/native-callback.html`) — register that URL in TikTok portal |
| Exchange | Your `exchangeEndpoint` receives JSON `{ code, redirect_uri, state }`; respond with JSON `{ access_token, refresh_token? }` (any subset of token fields you need). |

```ts
oauth.tiktok({
  clientKey: TIKTOK_CLIENT_KEY,
  exchangeEndpoint: 'https://api.yourapp.com/auth/tiktok/exchange',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})
```

### Server examples (code exchange + Apple POST)

**1) OAuth code exchange** (Google generic code flow, TikTok, or any IdP where the callback element POSTs JSON)

`<despia-oauth-callback>` POSTs:

```http
POST /auth/google/exchange
Content-Type: application/json

{"code":"<auth code>","redirect_uri":"https://yourapp.com/native-callback.html","state":"<opaque>"}
```

Your handler should validate `state` / CSRF if you store it, exchange `code` at Google’s token endpoint (or TikTok’s), then return JSON with any of: `access_token`, `refresh_token`, `id_token`, `session_token` — those keys are forwarded on the `{scheme}://oauth/auth?…` deeplink.

```ts
// Example shape (Deno / Cloudflare Workers / Node 18+ with Request)
export async function postJsonExchange(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const { code, redirect_uri } = await req.json()
  // const tokens = await exchangeWithGoogleOrTikTok(code, redirect_uri)
  const tokens = { access_token: '…', refresh_token: '…' }
  return Response.json(tokens)
}
```

**2) Apple `form_post` bridge** (Android): POST from Apple → 302 to static HTML with query params.

```ts
import { handleAppleFormPostRequest } from '@despia/oauth/server/apple-form-post'

export default async function handler(req: Request): Promise<Response> {
  return handleAppleFormPostRequest(req, {
    appOrigin: 'https://yourapp.com',
    nativeCallbackPath: '/native-callback.html',
    // mintSessionToken: async (fields) => 'opaque-session-id',
  })
}
```

Register **`https://yourapp.com/api/apple/callback`** (or whatever route serves `handler`) in Apple’s Services ID **Return URLs** — not the `.html` file itself when using `form_post`.

---

## `oauth` (high level)

```ts
import { oauth } from '@despia/oauth'

oauth.signIn({ ... })   // any authorize URL you built
await oauth.apple({ ... })  // iOS/web: Apple JS popup → OauthAppleIOSResult; Android: redirect → OpenOAuthResult
oauth.tiktok({ ... })   // TikTok authorize + code in state for exchange
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
import { openOAuth, detectRuntime } from '@despia/oauth'
```

**`openOAuth(oauthUrl: string, options?: { runtime?: Runtime }): OpenOAuthResult`**

- `oauthUrl` must be absolute `http:` / `https:`.
- Native: sets `window.despia = 'oauth://?url=' + encodeURIComponent(oauthUrl)`.
- Web: `window.location.href = oauthUrl`.

**`detectRuntime(): Runtime`** — what this library uses internally (`oauth.apple`, `openOAuth`, etc.). Same UA rules as below.

| Return value | Meaning |
|--------------|---------|
| `{ kind: 'native', platform: 'ios' \| 'android' }` | `userAgent` contains `despia` (any case); iOS if UA matches iPhone/iPad/iPod. |
| `{ kind: 'web' }` | Browser, not Despia. |
| `{ kind: 'ssr' }` | No `navigator` — don’t build native OAuth URLs on the server. |

**Your own checks (start of flow)** — we don’t ship `isDespia` / `isDespiaIOS` / `isDespiaAndroid` on the package; use `userAgent` in your app if you need to branch before OAuth:

```ts
// Detect if running in Despia
const isDespia = navigator.userAgent.toLowerCase().includes('despia')

// Detect iOS in Despia
const isDespiaIOS =
  isDespia &&
  (navigator.userAgent.toLowerCase().includes('iphone') ||
    navigator.userAgent.toLowerCase().includes('ipad'))

// Detect Android in Despia
const isDespiaAndroid = isDespia && navigator.userAgent.toLowerCase().includes('android')
```

`detectRuntime()` uses the same `despia` substring and also treats **iPod** as iOS (`/ipod/i`). Add `|| navigator.userAgent.toLowerCase().includes('ipod')` to the iOS check if you want identical behavior.

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
import {
  defineDespiaOAuthElements,
  DespiaOAuthCallbackElement,
  DespiaOAuthTokensElement,
} from '@despia/oauth/web-components/manual'

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
