import { detectRuntime, type Runtime } from './runtime.js'
import { DespiaOAuthError } from './types.js'

/**
 * Open an OAuth URL in the right place for the current runtime.
 *
 *   • Despia native  → sets `window.despia = "oauth://?url=..."`. The
 *                       native runtime intercepts the assignment via a
 *                       property setter and pushes the URL into
 *                       ASWebAuthenticationSession on iOS or Chrome
 *                       Custom Tabs on Android. The WebView keeps its
 *                       state; the user comes back via a
 *                       `{scheme}://oauth/...` deeplink fired from the
 *                       `/native-callback` page.
 *   • Web browser    → hard-navigates the current window. Popups would
 *                       be blocked when the click handler does an async
 *                       URL fetch first, which is the realistic case.
 *
 * The native call is a single synchronous assignment, no queue and no
 * external library. OAuth flows have exactly one bridge command per
 * sign-in attempt (open the browser), separated by hundreds of
 * milliseconds of user interaction, so no command queueing is needed.
 *
 * Runtime detection is **user-agent only** (the `despia` string in
 * `navigator.userAgent`, documented by the Despia runtime). This package
 * deliberately does not sniff `window.despia` or any other global as a
 * runtime branching condition — UA is the canonical signal.
 *
 * Zero runtime dependencies. The native bridge is the OS-level URL-scheme
 * handler watching for `window.despia` writes; we just write to it.
 */

export type OpenOAuthResult =
  | { kind: 'opened-native' }
  | { kind: 'navigating-web' }

export interface OpenOAuthOptions {
  /** Override runtime detection. Mostly for tests. */
  runtime?: Runtime
}

export function openOAuth(
  oauthUrl: string,
  options: OpenOAuthOptions = {},
): OpenOAuthResult {
  if (!oauthUrl || typeof oauthUrl !== 'string') {
    throw new DespiaOAuthError('invalid_url', 'oauthUrl is required and must be a string.')
  }
  if (!/^https?:\/\//i.test(oauthUrl)) {
    throw new DespiaOAuthError(
      'invalid_url',
      `oauthUrl must be an absolute http(s) URL. Got: ${oauthUrl.slice(0, 60)}…`,
    )
  }

  const runtime = options.runtime ?? detectRuntime()

  if (runtime.kind === 'native') {
    if (typeof window === 'undefined') {
      // Native runtime requires a window. This branch should be
      // unreachable in practice — detectRuntime returns 'ssr' when
      // window is undefined — but the explicit check keeps the
      // error message friendly if a caller forces the runtime.
      throw new DespiaOAuthError(
        'no_window',
        'Native runtime detected but window is undefined.',
      )
    }
    // The native bridge: writing a string starting with `oauth://?url=`
    // to window.despia is what the runtime watches for. The native side
    // pulls the URL out, opens the secure browser session, and the user
    // never sees the assignment again. There's no return value to read.
    ;(window as unknown as { despia: string }).despia = `oauth://?url=${encodeURIComponent(oauthUrl)}`
    return { kind: 'opened-native' }
  }

  if (runtime.kind === 'web') {
    if (typeof window === 'undefined') {
      throw new DespiaOAuthError('no_window', 'Web runtime detected but window is undefined.')
    }
    window.location.href = oauthUrl
    return { kind: 'navigating-web' }
  }

  throw new DespiaOAuthError(
    'ssr_unsupported',
    'openOAuth cannot run during SSR. Call it from a client-side event handler.',
  )
}
