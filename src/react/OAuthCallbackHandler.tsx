import { type ReactNode, useState } from 'react'
import { useOAuthCallback } from './useOAuthCallback.js'
import type { OAuthCallbackTokens, ParsedCallback } from '../types.js'

export interface OAuthCallbackHandlerProps {
  /**
   * Called when tokens are successfully extracted. Use this to call your
   * auth provider's setSession (Supabase, Firebase, your own backend, etc.)
   * and then navigate the user to the main app.
   */
  onTokens: (tokens: OAuthCallbackTokens) => void | Promise<void>
  /**
   * Called when the callback URL contains an OAuth error (user cancelled,
   * scope denied, etc.). Defaults to logging to console.
   */
  onError?: (error: { code: string; description?: string }) => void
  /** Custom UI while processing. Defaults to a "Signing you in..." message. */
  loading?: ReactNode
  /** UI to show on error. Defaults to a generic message with the error code. */
  errorView?: (error: { code: string; description?: string }) => ReactNode
  /** Whether to fire `onTokens` for `code` (without exchange). Default false. */
  treatCodeAsTokens?: boolean
}

const defaultLoading = (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#666',
    }}
  >
    <p>Signing you in…</p>
  </div>
)

const defaultErrorView = (error: { code: string; description?: string }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#666',
      padding: 20,
      textAlign: 'center',
    }}
  >
    <p style={{ fontSize: 16, marginBottom: 8 }}>Sign in failed</p>
    <p style={{ fontSize: 13, color: '#999' }}>{error.description ?? error.code}</p>
  </div>
)

/**
 * Drop-in component for your `/auth` route.
 *
 * Reads tokens from the URL on mount and on every URL change (handling the
 * already-mounted page case via `useOAuthCallback`), then calls `onTokens` so
 * you can set the session and navigate. Renders a loading state by default.
 *
 * @example
 *   <Route path="/auth" element={
 *     <OAuthCallbackHandler
 *       onTokens={async (t) => {
 *         await supabase.auth.setSession(t)
 *         navigate('/')
 *       }}
 *     />
 *   } />
 */
export function OAuthCallbackHandler(props: OAuthCallbackHandlerProps) {
  const {
    onTokens,
    onError,
    loading = defaultLoading,
    errorView = defaultErrorView,
    treatCodeAsTokens = false,
  } = props

  const [error, setError] = useState<{ code: string; description?: string } | null>(null)

  useOAuthCallback({
    onCallback: async (parsed: ParsedCallback) => {
      const t = parsed.tokens

      if (t.error) {
        const err = { code: t.error, description: t.error_description }
        setError(err)
        onError?.(err)
        return
      }

      const hasUsableToken =
        t.access_token || t.id_token || t.session_token || (treatCodeAsTokens && t.code)

      if (!hasUsableToken) {
        // No token, no error — likely the user landed on /auth directly.
        // Silently do nothing rather than show an error.
        return
      }

      try {
        await onTokens(t)
      } catch (e) {
        const err = {
          code: 'session_setup_failed',
          description: e instanceof Error ? e.message : 'Failed to set up session',
        }
        setError(err)
        onError?.(err)
      }
    },
  })

  if (error) return <>{errorView(error)}</>
  return <>{loading}</>
}
