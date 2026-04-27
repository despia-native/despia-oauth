# @despia/oauth

OAuth for Despia apps with **zero runtime dependencies**.

This library is intentionally small and provider-agnostic:

- **Open native secure browser** via a single `window.despia = "oauth://?url=..."` write
- **Close secure browser + navigate back** via `{scheme}://oauth/...` deeplinks
- **Generic callbacks** via two drop-in web components:
  - `<despia-oauth-callback>` for `/native-callback`
  - `<despia-oauth-tokens>` for `/auth`

## Install

```bash
npm install @despia/oauth
```

## The only flow you need to understand

1. Your app calls `oauth.signIn({ url, ... })`
2. Despia opens a secure browser session (ASWebAuth / Custom Tabs)
3. Provider redirects to your `/native-callback` page
4. `/native-callback` fires `myapp://oauth/auth?...` (**`oauth/` is required**)
5. Despia closes the browser and navigates your WebView to `/auth?...`
6. `/auth` reads tokens and sets your session

## 1) Sign-in button (any provider)

Build the authorize URL however you want (Supabase, Auth0, Clerk, custom backend…) and pass it in:

```ts
import { oauth } from '@despia/oauth'

oauth.signIn({
  url: 'https://your-idp.example/authorize?...',
  deeplinkScheme: 'myapp',        // required, user-provided
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'fragment',      // 'fragment' | 'query' | 'both' | 'code'
})
```

If your provider returns `?code=...` and you want `/native-callback` to exchange it server-side:

```ts
oauth.signIn({
  url: 'https://your-idp.example/authorize?...',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
  tokenLocation: 'code',
  exchangeEndpoint: 'https://api.yourapp.com/auth/exchange',
})
```

## 2) `/native-callback` page (secure browser)

Create `public/native-callback.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Completing sign in…</title>

<despia-oauth-callback></despia-oauth-callback>
<script type="module" src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
```

This element:
- Parses tokens from query/fragment based on `state`
- Optionally exchanges `code` via `exchangeEndpoint` (from `state` or attribute)
- Fires the deeplink `{scheme}://oauth/auth?...`

## 3) `/auth` page (WebView)

Add the element and listen for tokens:

```html
<despia-oauth-tokens></despia-oauth-tokens>
<script type="module">
  import 'https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js'

  document
    .querySelector('despia-oauth-tokens')
    .addEventListener('tokens', async (e) => {
      const tokens = e.detail
      // call your auth SDK here (Supabase/Firebase/custom)
    })
</script>
```

## API (small)

- `oauth.signIn({ url, deeplinkScheme, appOrigin, tokenLocation?, exchangeEndpoint?, authPath? })`
- `oauth.apple({ ... })` (iOS uses Apple JS popup, Android uses redirect)
- `oauth.tiktok({ ... })` (code flow + exchange)
- Escape hatches: `openOAuth`, `detectRuntime`, `encodeState/decodeState`, `parseCallback`,
  `watchCallbackUrl`, `handleNativeCallback`, `buildDeeplink`

## License

MIT. See [`LICENSE`](./LICENSE).
