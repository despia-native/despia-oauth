````md
# @despia/oauth

> **OAuth for Despia apps. Native ASWebAuthenticationSession (iOS) and Chrome Custom Tabs (Android). Zero runtime dependencies.**

[![npm](https://img.shields.io/npm/v/@despia/oauth.svg)](https://www.npmjs.com/package/@despia/oauth)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

OAuth providers refuse to authenticate inside an embedded WebView — App Store and Play Store rules require a trusted browser session. Despia handles that natively at the OS level. This package wraps the URL building, state encoding, callback parsing, and deeplink construction.

## Three helpers

```ts
import { oauth } from '@despia/oauth'

// Generic — pass any authorize URL inline
oauth.signIn({
  url: `https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=${
    encodeURIComponent('https://yourapp.com/native-callback.html')
  }`,
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})

// Apple — JS popup on iOS, redirect on Android (handled automatically)
await oauth.apple({
  servicesId: 'com.yourcompany.yourapp.webauth',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})

// TikTok — backend code exchange (Client Secret stays server-side)
oauth.tiktok({
  clientKey: 'YOUR_TIKTOK_CLIENT_KEY',
  exchangeEndpoint: 'https://api.yourapp.com/auth/tiktok/exchange',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})
```

That's the whole API. MIT licensed. No runtime deps.

---

## Install

```bash
npm install @despia/oauth      # or pnpm / yarn
```

### CDN (no build tool)

Same API, just under `DespiaOAuth.oauth.*`:

```html
<script src="https://unpkg.com/@despia/oauth"></script>

<script>
  DespiaOAuth.oauth.signIn({
    url: `https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=${
      encodeURIComponent('https://yourapp.com/native-callback.html')
    }`,
    deeplinkScheme: 'myapp',
    appOrigin: 'https://yourapp.com',
  })
</script>
```

For the callback page web components:

```html
<script src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
```

---

## How it works

```
1. User taps button       oauth.signIn({ url, … })
                          → window.despia = "oauth://?url=…"
                                ↓
2. Secure browser session opens (ASWebAuth on iOS, Chrome Custom Tabs)
3. User authenticates with the provider
4. /native-callback page reads tokens, fires:
                          window.location.href = "myapp://oauth/auth?access_token=…"
                                ↓
5. Despia closes browser, navigates WebView to /auth?access_token=…
6. /auth page reads tokens, calls supabase.auth.setSession() etc.
```

Three places your code touches:

1. **Sign-in button** — calls `oauth.signIn` / `oauth.apple` / `oauth.tiktok`
2. **`/native-callback` page** — has `<despia-oauth-callback>`
3. **`/auth` page** — reads tokens and signs the user in

---

## Step 1: Sign-in button — examples

### Supabase (Google, GitHub, Discord, etc.)

```ts
oauth.signIn({
  url: `https://abcdefg.supabase.co/auth/v1/authorize?provider=google&redirect_to=${
    encodeURIComponent('https://yourapp.com/native-callback.html')
  }`,
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'fragment', // Supabase implicit returns tokens in #fragment
})
```

Swap `provider=google` for `github`, `discord`, `slack`, whatever Supabase supports.

### Auth0 / Clerk / Stack Auth / Convex Auth / Better Auth / Firebase

These platforms hand you an authorize URL through their SDK. Pass it straight in:

```ts
oauth.signIn({
  url: await myAuthSDK.getAuthorizeUrl({ provider: 'google' }),
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'fragment', // or 'code' / 'both' depending on what your platform returns
})
```

If your platform returns `?code=…` and needs a backend exchange:

```ts
oauth.signIn({
  url: await myAuthSDK.getAuthorizeUrl({ provider: 'google' }),
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'code',
  exchangeEndpoint: 'https://api.yourapp.com/auth/exchange',
})
```

### Direct Google with PKCE

```ts
const { challenge } = await fetch('/api/auth/google/start').then(r => r.json())

oauth.signIn({
  url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: 'YOUR_GOOGLE_CLIENT_ID',
    redirect_uri: 'https://yourapp.com/native-callback.html',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })}`,
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'code',
  exchangeEndpoint: 'https://api.yourapp.com/auth/google/exchange',
})
```

### Apple

```ts
const result = await oauth.apple({
  servicesId: 'com.yourcompany.yourapp.webauth',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})

// On iOS native + web: popup result with id_token + code
// On Android native: tokens come back via the deeplink + /auth page
if (result.kind === 'apple-popup') {
  await yourBackend.exchangeAppleIdToken(result.id_token)
}
```

Don't forget the Apple JS SDK script:

```html
<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
```

For Apple `form_post` flow (more secure, requires backend handler):

```ts
oauth.apple({
  servicesId: 'com.yourcompany.yourapp.webauth',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  responseMode: 'form_post',
  formPostHandlerUrl: 'https://api.yourapp.com/apple-callback',
})
```

See [`templates/apple-form-post-callback.html`](./templates/apple-form-post-callback.html) for the backend response template.

### TikTok

```ts
oauth.tiktok({
  clientKey: 'YOUR_TIKTOK_CLIENT_KEY',
  exchangeEndpoint: 'https://api.yourapp.com/auth/tiktok/exchange',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})
```

Handles the TikTok-specific URL format (`client_key`, comma-separated scopes) and tells the callback page to POST to your `exchangeEndpoint` with the authorization code. Your backend exchanges it for tokens using your Client Secret.

### Anything else

Build the URL however you want and pass it to `oauth.signIn`:

```ts
oauth.signIn({
  url: 'https://your-idp.example/oauth/authorize?client_id=xxx&...',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'code', // or 'fragment' / 'query' / 'both'
  exchangeEndpoint: 'https://api.yourapp.com/auth/exchange', // if 'code'
})
```

---

## Step 2: `/native-callback` page

Drop this HTML at `public/native-callback.html`:

```html
<!DOCTYPE html>
<html>
<head><title>Completing sign in…</title></head>
<body>
  <despia-oauth-callback></despia-oauth-callback>
  <script type="module" src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
</body>
</html>
```

No JS needed — the web component reads its config from the OAuth `state` parameter that the helpers encoded.

### If your backend serves the callback page (recommended pattern for code-exchange flows)

Don't use `exchange-endpoint` with a relative path. Exchange the code during the GET that serves `/native-callback`, then render with the session token already in the URL:

```js
// Express
app.get('/native-callback', async (req, res) => {
  const tokens = await exchangeCodeWithIdP(req.query.code)
  const sessionToken = await mintSessionToken(tokens)

  res.redirect(302,
    `/native-callback.html?session_token=${encodeURIComponent(sessionToken)}` +
    `&state=${encodeURIComponent(req.query.state)}`)
})
```

The static template then reads `session_token` from the URL like any other token.

See [`templates/native-callback-server-rendered.html`](./templates/native-callback-server-rendered.html) for a full template with substitution markers.

### Cross-origin exchange (static frontend + separate API)

```html
<despia-oauth-callback exchange-endpoint="https://api.yourapp.com/auth/exchange">
</despia-oauth-callback>
```

**Use absolute URLs.** A relative path like `/api/auth/exchange` logs `console.warn` because it means your backend is serving both the page and the exchange — wasted round trip.

---

## Step 3: `/auth` page

### Vanilla / Web Components

```html
<despia-oauth-tokens redirect-on-success="/"></despia-oauth-tokens>

<script type="module">
  import 'https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js'
  import { supabase } from './supabase.js'

  document.querySelector('despia-oauth-tokens').addEventListener('tokens', async (e) => {
    await supabase.auth.setSession({
      access_token: e.detail.access_token,
      refresh_token: e.detail.refresh_token ?? '',
    })
  })
</script>
```

### React + Supabase

```tsx
import { OAuthCallbackHandler } from '@despia/oauth/react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

export function AuthRoute() {
  const navigate = useNavigate()
  return (
    <OAuthCallbackHandler
      onTokens={async (tokens) => {
        if (tokens.access_token) {
          await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? '',
          })
          navigate('/')
        }
      }}
    />
  )
}
```

### React + Convex / Firebase / custom backend

```tsx
// Convex
import { useAuthActions } from '@convex-dev/auth/react'
const { signIn } = useAuthActions()

<OAuthCallbackHandler onTokens={async (tokens) => {
  if (tokens.id_token) await signIn('apple', { idToken: tokens.id_token })
}} />

// Firebase
import { GoogleAuthProvider, signInWithCredential, getAuth } from 'firebase/auth'

<OAuthCallbackHandler onTokens={async (tokens) => {
  const credential = GoogleAuthProvider.credential(tokens.id_token, tokens.access_token)
  await signInWithCredential(getAuth(), credential)
}} />

// Custom backend
<OAuthCallbackHandler onTokens={async (tokens) => {
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens),
    credentials: 'include',
  })
}} />
```

### Vue 3

```vue
<script setup lang="ts">
import { useOAuthCallback } from '@despia/oauth/vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()
useOAuthCallback(async ({ tokens }) => {
  if (tokens.access_token) {
    await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
    })
    router.push('/')
  }
})
</script>

<template><div>Signing you in…</div></template>
```

### Svelte / SvelteKit

```svelte
<script lang="ts">
  import { useOAuthCallback } from '@despia/oauth/svelte'
  import { goto } from '$app/navigation'
  import { supabase } from '$lib/supabase'

  useOAuthCallback(async ({ tokens }) => {
    if (tokens.access_token) {
      await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? '',
      })
      goto('/')
    }
  })
</script>

<p>Signing you in…</p>
```

---

## API reference

### `@despia/oauth`

| Export | What it does |
| --- | --- |
| `oauth.signIn({ url, deeplinkScheme, appOrigin, tokenLocation?, exchangeEndpoint?, authPath? })` | Generic OAuth. Pass any URL. |
| `oauth.apple({ servicesId, deeplinkScheme, appOrigin, ... })` | Apple Sign In — popup on iOS, redirect on Android. |
| `oauth.tiktok({ clientKey, exchangeEndpoint, deeplinkScheme, appOrigin, ... })` | TikTok with backend code exchange. |
| `oauth.isIOSNative()` | True when running in Despia iOS native. |
| `openOAuth(url)` | Lower-level: write `oauth://?url=…` to `window.despia`. |
| `detectRuntime()` | `{ kind: 'native', platform: 'ios' \| 'android' }` / `{ kind: 'web' }` / `{ kind: 'ssr' }`. |
| `parseCallback(url?)` | Parses tokens from query + fragment. |
| `handleNativeCallback(opts?)` | Drop-in handler when you want a JSX callback page. |
| `watchCallbackUrl(handler, opts?)` | Framework-agnostic URL watcher. |
| `buildDeeplink(scheme, path, params?)` | `myapp://oauth/path?...`. |
| `encodeState({ scheme, csrf?, spec? })` / `decodeState(state)` | State encoding. |
| `DespiaOAuthError` | Error class with a typed `code`. |

### `@despia/oauth/react`, `/vue`, `/svelte`

Each exports a `useOAuthCallback` hook/composable. React also exports `<OAuthCallbackHandler>`.

### `@despia/oauth/web-components`

Auto-registers `<despia-oauth-callback>` and `<despia-oauth-tokens>`.

---

## Common gotchas (we handle these for you)

- **The `oauth/` prefix.** `myapp://auth?...` does nothing. `myapp://oauth/auth?...` works. We always include it.
- **Apple iOS redirect = blank screen + App Store rejection.** `oauth.apple` automatically uses the JS popup on iOS, redirect on Android.
- **Already-mounted `/auth` page.** When the deeplink fires `myapp://oauth/auth?...` and `/auth` is already active, your router updates the URL without remounting. All adapters listen to `popstate` + `hashchange` and re-fire.
- **Fragment vs query.** `parseCallback` checks both, deduped by URL.
- **React Router strips fragments.** That's why `/native-callback` is plain HTML in `public/`, not a React component.
- **Strict Mode double-effects.** Adapters dedupe by URL.
- **SSR.** `detectRuntime()` returns `{ kind: 'ssr' }`.

---

## Building / contributing

```bash
git clone https://github.com/despia/oauth
cd oauth
npm install --legacy-peer-deps
npm test          # 106 tests
npm run typecheck
npm run build
```

## License

[MIT](./LICENSE).

## Resources

- [Despia OAuth docs](https://setup.despia.com/native-features/oauth)
- [Despia](https://despia.com)
````
