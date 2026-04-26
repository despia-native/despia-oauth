import { onMount, onDestroy } from 'svelte'
import { watchCallbackUrl, type CallbackHandler } from '../watchCallback.js'

export interface UseOAuthCallbackOptions {
  fireOnEmpty?: boolean
}

/**
 * Svelte function that reacts to OAuth callback URL changes. Call from a
 * component's top-level `<script>` block. Compatible with both Svelte 4 and
 * Svelte 5 — uses only the stable `onMount` and `onDestroy` lifecycle hooks.
 *
 * Solves the already-mounted page problem: if `/auth` is already active when
 * Despia navigates to `/auth?access_token=xxx`, SvelteKit updates the URL
 * without remounting the component, so logic that only runs in `onMount`
 * would miss the tokens.
 *
 * @example
 * <script>
 *   import { useOAuthCallback } from '@despia/oauth/svelte'
 *   import { supabase } from '$lib/supabase'
 *   import { goto } from '$app/navigation'
 *
 *   useOAuthCallback(async ({ tokens }) => {
 *     if (tokens.access_token) {
 *       await supabase.auth.setSession({
 *         access_token: tokens.access_token,
 *         refresh_token: tokens.refresh_token ?? '',
 *       })
 *       goto('/')
 *     }
 *   })
 * </script>
 */
export function useOAuthCallback(
  onCallback: CallbackHandler,
  options: UseOAuthCallbackOptions = {},
): void {
  let cleanup: (() => void) | null = null

  onMount(() => {
    cleanup = watchCallbackUrl(onCallback, options)
  })

  onDestroy(() => {
    cleanup?.()
    cleanup = null
  })
}
