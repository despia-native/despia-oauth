import { useEffect, useRef } from 'react'
import { watchCallbackUrl, type CallbackHandler } from '../watchCallback.js'

export interface UseOAuthCallbackOptions {
  onCallback: CallbackHandler
  /**
   * Whether to fire `onCallback` for URLs with no token data. Off by default —
   * there's no point handling an empty URL most of the time, and skipping it
   * avoids a no-op render after sign-in completes and the URL is cleaned up.
   */
  fireOnEmpty?: boolean
}

/**
 * React hook for the `/auth` page that reacts to OAuth callback URL changes.
 *
 * The bug this prevents (called out repeatedly in the Despia docs): if
 * `/auth` is already the active route when Despia navigates to
 * `/auth?access_token=xxx`, React Router updates the URL without remounting
 * the component. A naive `useEffect(() => readTokens(), [])` already ran with
 * empty params on mount and never runs again. The user sees a "Signing you
 * in…" spinner forever.
 *
 * We solve this by listening to `popstate` AND `hashchange` and re-reading
 * the URL. Internal dedupe protects against React 18 Strict Mode's effect
 * double-invocation.
 */
export function useOAuthCallback(options: UseOAuthCallbackOptions): void {
  const { onCallback, fireOnEmpty = false } = options

  // Keep a stable reference to the callback so we don't re-subscribe on
  // every render — only when fireOnEmpty changes.
  const onCallbackRef = useRef(onCallback)
  onCallbackRef.current = onCallback

  useEffect(() => {
    return watchCallbackUrl((parsed) => onCallbackRef.current(parsed), {
      fireOnEmpty,
    })
  }, [fireOnEmpty])
}
