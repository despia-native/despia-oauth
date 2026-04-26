import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openOAuth } from '../src/open.js'
import { DespiaOAuthError } from '../src/types.js'

let originalUA: PropertyDescriptor | undefined
beforeEach(() => {
  originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
})
afterEach(() => {
  if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA)
  // Clean up any window.despia we set during tests so cross-test state
  // doesn't bleed.
  try {
    delete (window as { despia?: string }).despia
  } catch {
    /* jsdom sometimes refuses delete; ignore */
  }
})

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

/**
 * Install a setter on window.despia that records every assignment. This is
 * how we observe the native bridge: the Despia runtime watches the same
 * setter at the OS level. In the test environment we record what would
 * have been pushed to native.
 */
function captureWindowDespia(): { calls: string[]; restore: () => void } {
  const calls: string[] = []
  const w = window as unknown as { despia?: string }
  // Pre-clear any leftover from previous tests so no stale value confuses us.
  delete w.despia
  Object.defineProperty(window, 'despia', {
    configurable: true,
    set(value: string) {
      calls.push(value)
    },
    get() {
      // Return the last value, like the real runtime would.
      return calls[calls.length - 1]
    },
  })
  return {
    calls,
    restore: () => {
      try {
        delete (window as { despia?: string }).despia
      } catch {
        /* ignore */
      }
    },
  }
}

describe('openOAuth', () => {
  it('writes window.despia = "oauth://?url=..." when in Despia native', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      const result = openOAuth('https://accounts.google.com/o/oauth2/v2/auth?x=1')
      expect(result).toEqual({ kind: 'opened-native' })
      expect(cap.calls).toHaveLength(1)
      expect(cap.calls[0]).toMatch(/^oauth:\/\/\?url=/)
      expect(cap.calls[0]).toContain(
        encodeURIComponent('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
      )
    } finally {
      cap.restore()
    }
  })

  it('navigates the window on web', () => {
    setUA('Mozilla/5.0 (Macintosh)')
    const originalLocation = window.location
    delete (window as { location?: Location }).location
    // @ts-expect-error - partial Location for test
    window.location = { href: '' }

    try {
      const result = openOAuth('https://accounts.google.com/o/oauth2/v2/auth?x=1')
      expect(result).toEqual({ kind: 'navigating-web' })
      expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    } finally {
      // @ts-expect-error - restore
      window.location = originalLocation
    }
  })

  it('rejects relative URLs and oauth:// URLs early', () => {
    setUA('Mozilla/5.0')
    expect(() => openOAuth('/relative')).toThrow(DespiaOAuthError)
    expect(() => openOAuth('oauth://?url=foo')).toThrow(DespiaOAuthError)
    expect(() => openOAuth('')).toThrow(DespiaOAuthError)
  })

  it('throws on SSR', () => {
    expect(() =>
      openOAuth('https://example.com/oauth', { runtime: { kind: 'ssr' } }),
    ).toThrow(/SSR/)
  })

  it('honours runtime override (no UA sniffing)', () => {
    setUA('completely-unrelated-ua')
    const cap = captureWindowDespia()
    try {
      openOAuth('https://example.com/oauth', {
        runtime: { kind: 'native', platform: 'ios' },
      })
      expect(cap.calls).toHaveLength(1)
    } finally {
      cap.restore()
    }
  })

  it('is synchronous — no Promise, no await needed', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      const result = openOAuth('https://example.com/oauth')
      // Confirm it's a plain object, not a Promise.
      expect((result as unknown as Promise<unknown>).then).toBeUndefined()
    } finally {
      cap.restore()
    }
  })
})
