import type { Runtime } from './types.js'

export type { Runtime }

/**
 * Detect the current runtime.
 *
 * Despia native injects "despia" into navigator.userAgent — this is the
 * documented signal in the Despia docs and what every provider example in
 * the OAuth docs branches on. We never check anything else (no `window.despia`
 * presence check, no postMessage handshake) because the user-agent string is
 * the canonical, stable signal.
 *
 * On the server (`navigator` undefined), we report `ssr` so callers can
 * defer the decision to the client. Treating SSR as `web` would be a bug —
 * the server would generate a web-flavoured OAuth URL and the client would
 * flip to the native one on hydration, breaking the click handler.
 */
export function detectRuntime(): Runtime {
  if (typeof navigator === 'undefined') return { kind: 'ssr' }

  const ua = navigator.userAgent.toLowerCase()
  if (!ua.includes('despia')) return { kind: 'web' }

  // Inside Despia, distinguish iOS vs Android. Most providers don't care, but
  // Apple Sign In does — on iOS native, Apple requires the JS-SDK popup, not
  // a redirect (a redirect causes a blank screen and App Store rejection).
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return { kind: 'native', platform: isIOS ? 'ios' : 'android' }
}

export const isDespia = (): boolean => detectRuntime().kind === 'native'

export const isDespiaIOS = (): boolean => {
  const r = detectRuntime()
  return r.kind === 'native' && r.platform === 'ios'
}

export const isDespiaAndroid = (): boolean => {
  const r = detectRuntime()
  return r.kind === 'native' && r.platform === 'android'
}
