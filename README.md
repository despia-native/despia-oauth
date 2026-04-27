# Despia OAuth

**`@despia/oauth`** — no runtime deps. Despia opens the IdP with `oauth://?url=…`; you return with `{scheme}://oauth/…` (that path segment is required). This package: `oauth.signIn`, `<despia-oauth-callback>`, `<despia-oauth-tokens>`. You build the authorize URL.

```bash
npm install @despia/oauth
```

## Flow

1. `oauth.signIn` → secure browser (ASWebAuth / Custom Tabs).
2. IdP → `/native-callback` (query, `#hash`, or `?code=`).
3. Callback element → `{scheme}://oauth/auth?…` → session closes.
4. WebView → `/auth?…` → tokens element (or your code).

**Apple `form_post`:** POST body, not a readable URL on static HTML. Tiny server route → **302** to `/native-callback.html?…` → steps 3–4 unchanged. Snippet below.

## Tokens in the URL

Default: read **query + hash** (query wins). Code flow: `tokenLocation: 'code'` + `exchangeEndpoint` (or exchange yourself).

```ts
oauth.signIn({ url, deeplinkScheme: 'myapp', appOrigin, tokenLocation: 'both' }) // default
oauth.signIn({ url, deeplinkScheme: 'myapp', appOrigin, tokenLocation: 'code', exchangeEndpoint })
```

## Pages

**Sign-in**

```ts
import { oauth } from '@despia/oauth'

oauth.signIn({
  url: 'https://your-idp.example/authorize?...',
  deeplinkScheme: 'myapp',
  appOrigin: 'https://yourapp.com',
})
```

**`/native-callback.html`**

```html
<despia-oauth-callback></despia-oauth-callback>
<script type="module" src="https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js"></script>
```

**`/auth`**

```html
<despia-oauth-tokens></despia-oauth-tokens>
<script type="module">
  import 'https://unpkg.com/@despia/oauth/dist/umd/web-components.min.js'
  document.querySelector('despia-oauth-tokens').addEventListener('tokens', (e) => {
    /* e.detail → your backend / SDK */
  })
</script>
```

## Gotchas

- Use `myapp://oauth/...`, not `myapp://auth/...`.
- `deeplinkScheme` is required.

## Apple `form_post` (Android)

POST from Apple → your handler → redirect to the same static callback with query params (or use `mintSessionToken` for an opaque `session_token` instead of `id_token` in the URL). Point Apple’s redirect URI at this route, not the `.html` file.

```ts
import { handleAppleFormPostRequest } from '@despia/oauth/server/apple-form-post'

export default async function handler(req: Request): Promise<Response> {
  return handleAppleFormPostRequest(req, {
    appOrigin: 'https://yourapp.com',
    nativeCallbackPath: '/native-callback.html',
    // mintSessionToken: async (fields) => 'opaque',
  })
}
```

## API

`oauth.signIn`, `oauth.apple`, `oauth.tiktok` · `openOAuth`, `detectRuntime`, `encodeState` / `decodeState`, `parseCallback`, `watchCallbackUrl`, `handleNativeCallback`, `buildDeeplink`

## License

MIT — [`LICENSE`](./LICENSE).
