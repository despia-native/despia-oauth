# @despia/oauth

OAuth for **Despia** apps: open the IdP in the secure browser, return to your WebView with `myapp://oauth/auth?…` (the **`oauth/`** path is required). No runtime dependencies.

```bash
npm install @despia/oauth
```

**Imports you might use**

- `import { oauth, DespiaOAuthError, openOAuth, parseCallback, handleNativeCallback } from '@despia/oauth'`
- `import '@despia/oauth/web-components'` — registers `<despia-oauth-callback>` and `<despia-oauth-tokens>`
- `import { handleAppleFormPostRequest } from '@despia/oauth/server/apple-form-post'` — Apple `form_post` only
- **UMD (CDN):** `dist/umd/despia-oauth.min.js` → `window.DespiaOAuth`, `dist/umd/web-components.min.js` → web components

---

## Starter layout

Put these next to your real app origin and deeplink scheme (Despia → Publish → Deeplink).

```
public/
  native-callback.html   ← runs inside the secure browser tab
  auth.html              ← WebView after sign-in (path can be /auth instead)
src/
  sign-in.ts             ← your button calls into here
```

Replace `https://yourapp.com` and `myapp` everywhere below.

---

## 1. `public/native-callback.html`

This page runs **inside ASWebAuth / Custom Tabs**. It reads the URL, then opens your app again via `myapp://oauth/auth?…`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing in…</title>
  </head>
  <body>
    <despia-oauth-callback></despia-oauth-callback>
    <script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
  </body>
</html>
```

**Code flow** (Google `response_type=code`, TikTok, etc.): either host an API that exchanges the code (see §4), or set `exchange-endpoint` on the element:

```html
<despia-oauth-callback
  exchange-endpoint="https://api.yourapp.com/oauth/exchange"
></despia-oauth-callback>
<script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
```

The callback POSTs JSON: `{ "code", "redirect_uri", "state" }`. Your API returns JSON with at least `access_token` (and optionally `refresh_token`, `id_token`, `session_token`).

---

## 2. `public/auth.html`

This page runs **in your WebView** after Despia sends the user back with tokens on the query string.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Finishing sign-in…</title>
  </head>
  <body>
    <despia-oauth-tokens redirect-on-success="/"></despia-oauth-tokens>
    <script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
    <script>
      document.querySelector('despia-oauth-tokens').addEventListener('tokens', async (e) => {
        const tokens = e.detail
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokens),
          credentials: 'include',
        })
      })
      document.querySelector('despia-oauth-tokens').addEventListener('oauth-error', (e) => {
        console.error(e.detail)
      })
    </script>
  </body>
</html>
```

---

## 3. `src/sign-in.ts` — wire the button

Use **one** of these patterns (or combine). Constants:

```ts
const APP_ORIGIN = 'https://yourapp.com'
const DEEPLINK_SCHEME = 'myapp' // bare scheme, no ://
const NATIVE_CALLBACK = `${APP_ORIGIN}/native-callback.html`
```

### 3a. Any provider (Supabase, Auth0, hand-built URL) — `oauth.signIn`

```ts
import { oauth, DespiaOAuthError } from '@despia/oauth'

function signInWithGoogle() {
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: 'YOUR_CLIENT_ID',
      redirect_uri: NATIVE_CALLBACK,
      response_type: 'code',
      scope: 'openid email',
      prompt: 'consent',
    }).toString()

  try {
    oauth.signIn({
      url,
      deeplinkScheme: DEEPLINK_SCHEME,
      appOrigin: APP_ORIGIN,
      tokenLocation: 'code',
      exchangeEndpoint: 'https://api.yourapp.com/oauth/google/exchange',
      requireDespiaNative: true,
    })
  } catch (e) {
    if (e instanceof DespiaOAuthError && e.code === 'not_despia_native') {
      oauth.signIn({
        url,
        deeplinkScheme: DEEPLINK_SCHEME,
        appOrigin: APP_ORIGIN,
        tokenLocation: 'code',
        exchangeEndpoint: 'https://api.yourapp.com/oauth/google/exchange',
      })
      return
    }
    throw e
  }
}
```

**Supabase** (adjust project ref and paths):

```ts
import { oauth } from '@despia/oauth'

oauth.signIn({
  url: `https://abcdefgh.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(NATIVE_CALLBACK)}`,
  deeplinkScheme: DEEPLINK_SCHEME,
  appOrigin: APP_ORIGIN,
  tokenLocation: 'fragment',
})
```

### 3b. Apple — `oauth.apple`

In HTML that shows the Apple button, load Apple’s script once:

```html
<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
```

```ts
import { oauth, DespiaOAuthError } from '@despia/oauth'

async function signInWithApple() {
  try {
    const result = await oauth.apple({
      servicesId: 'com.yourcompany.yourserviceid',
      deeplinkScheme: DEEPLINK_SCHEME,
      appOrigin: APP_ORIGIN,
      requireDespiaNative: true,
    })
    if (result.kind === 'apple-popup') {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: result.id_token,
          code: result.code,
        }),
        credentials: 'include',
      })
      return
    }
  } catch (e) {
    if (e instanceof DespiaOAuthError && e.code === 'not_despia_native') {
      await oauth.apple({
        servicesId: 'com.yourcompany.yourserviceid',
        deeplinkScheme: DEEPLINK_SCHEME,
        appOrigin: APP_ORIGIN,
      })
      return
    }
    throw e
  }
}
```

On **Android**, if Apple uses `form_post`, point Apple at a **server route** that redirects to `native-callback.html?…` (§4b).

### 3c. TikTok — `oauth.tiktok`

```ts
import { oauth } from '@despia/oauth'

oauth.tiktok({
  clientKey: 'YOUR_TIKTOK_CLIENT_KEY',
  exchangeEndpoint: 'https://api.yourapp.com/oauth/tiktok/exchange',
  deeplinkScheme: DEEPLINK_SCHEME,
  appOrigin: APP_ORIGIN,
})
```

Register redirect `https://yourapp.com/native-callback.html` in the TikTok developer portal (native path).

---

## 4. Server snippets (copy when you need them)

### 4a. Code exchange (Google / generic / TikTok)

The `<despia-oauth-callback>` element POSTs:

```json
{ "code": "...", "redirect_uri": "https://yourapp.com/native-callback.html", "state": "..." }
```

Respond with JSON the app can put on the deeplink, for example:

```json
{ "access_token": "...", "refresh_token": "..." }
```

Minimal **Deno / Workers / Node 18** handler shape:

```ts
export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = await req.json()
    // const tokens = await exchangeCodeWithGoogleOrTikTok(body)
    const tokens = { access_token: 'REPLACE_ME' }
    return Response.json(tokens)
  },
}
```

### 4b. Apple `form_post` → your static callback

Apple POSTs a form body; static HTML cannot read it. One handler:

```ts
import { handleAppleFormPostRequest } from '@despia/oauth/server/apple-form-post'

export default async function handler(req: Request): Promise<Response> {
  return handleAppleFormPostRequest(req, {
    appOrigin: APP_ORIGIN,
    nativeCallbackPath: '/native-callback.html',
  })
}
```

Register this route’s **HTTPS URL** in Apple’s Services ID return URLs (not the `.html` file directly).

---

## Checklist before you ship

1. **Redirect / return URL** in your IdP matches the real URL of `native-callback.html` (same origin, `https`).
2. Deeplink back uses **`myapp://oauth/auth`** (not `myapp://auth`).
3. **`deeplinkScheme`** matches Despia Publish → Deeplink (bare `myapp`).
4. Apple iOS/web: **Apple JS script** on the page; `servicesId` and redirect URI match the Apple developer portal.

---

## Reference (short)

- **`oauth.signIn({ url, deeplinkScheme, appOrigin, tokenLocation?, exchangeEndpoint?, authPath?, requireDespiaNative? })`** — appends `state` to `url` then opens it.
- **`await oauth.apple({ servicesId, deeplinkScheme, appOrigin, … })`** — popup on iOS native + browser; redirect on Android native.
- **`oauth.tiktok({ clientKey, exchangeEndpoint, deeplinkScheme, appOrigin, … })`** — TikTok authorize URL + code exchange in state.
- **`requireDespiaNative: true`** — throws `DespiaOAuthError` with `code === 'not_despia_native'` on normal web / SSR so you can catch and call again without the flag (full-page fallback).
- **`openOAuth(url, options?)`**, **`detectRuntime()`**, **`parseCallback()`**, **`handleNativeCallback()`**, **`encodeState` / `decodeState`**, **`buildDeeplink`**, **`watchCallbackUrl`** — escape hatches; full signatures in **`dist/index.d.ts`** in the published package.
- **Web components:** `<despia-oauth-callback auth-path="/auth" exchange-endpoint="..." fallback-scheme="myapp">` · `<despia-oauth-tokens redirect-on-success="/">` · events `tokens`, `oauth-error`, `oauth-success`.

## License

MIT — [`LICENSE`](./LICENSE).
