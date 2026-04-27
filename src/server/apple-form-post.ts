/**
 * Optional server-side helpers for Apple's `response_mode=form_post`.
 *
 * A static HTML page cannot read the POST body that loaded it. For Apple
 * `form_post`, you need a server endpoint that receives the POST, then
 * redirects the browser to your static `/native-callback.html` with tokens
 * in the query string (or a `session_token` you mint server-side).
 *
 * This module is intentionally tiny and dependency-free. It targets runtimes
 * that implement the Web Fetch API (`Request` / `Response`), which includes:
 * Deno, Cloudflare Workers, Bun, and modern Node (undici).
 */

export interface AppleFormPostFields {
  state: string | null
  code: string | null
  id_token: string | null
  user: string | null
  error: string | null
  error_description: string | null
}

export function parseAppleFormPostBody(bodyText: string): AppleFormPostFields {
  const params = new URLSearchParams(bodyText)
  return {
    state: params.get('state'),
    code: params.get('code'),
    id_token: params.get('id_token'),
    user: params.get('user'),
    error: params.get('error'),
    error_description: params.get('error_description'),
  }
}

export interface AppleFormPostRedirectOptions {
  /** e.g. `https://yourapp.com` */
  appOrigin: string
  /** e.g. `/native-callback.html` */
  nativeCallbackPath: string
  /**
   * If you mint your own opaque token server-side, put it here and it will be
   * forwarded as `session_token` to `/native-callback.html`.
   */
  sessionToken?: string | null
}

/**
 * Build a redirect URL to your static native callback page with Apple fields
 * moved into query params (so `<despia-oauth-callback>` can read them).
 */
export function buildAppleFormPostRedirectUrl(
  fields: AppleFormPostFields,
  opts: AppleFormPostRedirectOptions,
): string {
  const url = new URL(opts.nativeCallbackPath, opts.appOrigin)
  if (fields.state) url.searchParams.set('state', fields.state)

  if (fields.error) {
    url.searchParams.set('error', fields.error)
    if (fields.error_description) {
      url.searchParams.set('error_description', fields.error_description)
    }
    return url.toString()
  }

  if (opts.sessionToken) {
    url.searchParams.set('session_token', opts.sessionToken)
    return url.toString()
  }

  // Forward tokens/codes as query params (static-friendly).
  if (fields.id_token) url.searchParams.set('id_token', fields.id_token)
  if (fields.code) url.searchParams.set('code', fields.code)
  if (fields.user) url.searchParams.set('user', fields.user)

  return url.toString()
}

export interface HandleAppleFormPostRequestOptions extends AppleFormPostRedirectOptions {
  /**
   * Optional hook to mint a `session_token` server-side (recommended) instead
   * of forwarding raw tokens in the URL.
   */
  mintSessionToken?: (fields: AppleFormPostFields) => Promise<string | null | undefined>
}

/**
 * Handle an incoming Apple `form_post` as a Web `Request`, returning a Web
 * `Response` redirect to your static native callback page.
 */
export async function handleAppleFormPostRequest(
  req: Request,
  opts: HandleAppleFormPostRequestOptions,
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const ct = req.headers.get('content-type') ?? ''
  if (!ct.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return new Response('Unsupported Media Type', { status: 415 })
  }

  const bodyText = await req.text()
  const fields = parseAppleFormPostBody(bodyText)

  const sessionToken = opts.mintSessionToken
    ? await opts.mintSessionToken(fields)
    : undefined

  const location = buildAppleFormPostRedirectUrl(fields, {
    ...opts,
    sessionToken: sessionToken ?? opts.sessionToken,
  })

  return Response.redirect(location, 302)
}
