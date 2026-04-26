import { onMounted, onBeforeUnmount } from 'vue'
import { watchCallbackUrl, type CallbackHandler } from '../watchCallback.js'

export interface UseOAuthCallbackOptions {
  fireOnEmpty?: boolean
}

/**
 * Vue 3 composable that reacts to OAuth callback URL changes.
 *
 * Solves the same already-mounted page problem the React hook solves: if
 * `/auth` is already the active route when Despia navigates to
 * `/auth?access_token=xxx`, vue-router updates the URL without remounting,
 * so logic that only runs in `mounted()` will miss the tokens.
 *
 * @example
 * <script setup>
 * import { useOAuthCallback } from '@despia/oauth/vue'
 * import { supabase } from './supabase'
 * import { useRouter } from 'vue-router'
 *
 * const router = useRouter()
 * useOAuthCallback(async ({ tokens }) => {
 *   if (tokens.access_token) {
 *     await supabase.auth.setSession({
 *       access_token: tokens.access_token,
 *       refresh_token: tokens.refresh_token ?? '',
 *     })
 *     router.push('/')
 *   }
 * })
 * </script>
 */
export function useOAuthCallback(
  onCallback: CallbackHandler,
  options: UseOAuthCallbackOptions = {},
): void {
  let cleanup: (() => void) | null = null

  onMounted(() => {
    cleanup = watchCallbackUrl(onCallback, options)
  })

  onBeforeUnmount(() => {
    cleanup?.()
    cleanup = null
  })
}
