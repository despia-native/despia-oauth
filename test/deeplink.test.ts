import { describe, it, expect } from 'vitest'
import { buildDeeplink, encodeState, decodeState } from '../src/deeplink.js'
import { DespiaOAuthError } from '../src/types.js'

describe('buildDeeplink', () => {
  it('builds a basic deeplink with the oauth/ prefix', () => {
    const url = buildDeeplink('myapp', '/auth', { access_token: 'abc' })
    expect(url).toBe('myapp://oauth/auth?access_token=abc')
  })

  it('handles paths with or without leading slash', () => {
    expect(buildDeeplink('myapp', '/auth')).toBe('myapp://oauth/auth')
    expect(buildDeeplink('myapp', 'auth')).toBe('myapp://oauth/auth')
  })

  it('omits empty/null/undefined params', () => {
    const url = buildDeeplink('myapp', '/auth', {
      access_token: 'abc',
      refresh_token: '',
      id_token: undefined,
      session_token: null,
    })
    expect(url).toBe('myapp://oauth/auth?access_token=abc')
  })

  it('URL-encodes special characters in params', () => {
    const url = buildDeeplink('myapp', '/auth', { error: 'user denied access' })
    expect(url).toBe('myapp://oauth/auth?error=user+denied+access')
  })

  it('throws when scheme is missing', () => {
    expect(() => buildDeeplink('', '/auth')).toThrow(DespiaOAuthError)
  })

  it('throws when scheme contains protocol chars (caller mistake)', () => {
    expect(() => buildDeeplink('myapp://', '/auth')).toThrow(/should be the bare scheme name/)
  })
})

describe('encodeState / decodeState', () => {
  it('round-trips a scheme', () => {
    const state = encodeState('myapp', 'csrf-123')
    expect(state).toBe('csrf-123|myapp')
    const decoded = decodeState(state)
    expect(decoded.csrfToken).toBe('csrf-123')
    expect(decoded.deeplinkScheme).toBe('myapp')
  })

  it('generates a CSRF token if not provided', () => {
    const state = encodeState('myapp')
    const decoded = decodeState(state)
    expect(decoded.csrfToken).toBeTruthy()
    expect(decoded.csrfToken!.length).toBeGreaterThan(0)
    expect(decoded.deeplinkScheme).toBe('myapp')
  })

  it('decodes a state that has no scheme suffix', () => {
    const decoded = decodeState('just-a-csrf-token')
    expect(decoded.csrfToken).toBe('just-a-csrf-token')
    expect(decoded.deeplinkScheme).toBe(null)
  })

  it('decodes empty/null state safely', () => {
    expect(decodeState(null)).toEqual({ csrfToken: null, deeplinkScheme: null, spec: null })
    expect(decodeState(undefined)).toEqual({ csrfToken: null, deeplinkScheme: null, spec: null })
    expect(decodeState('')).toEqual({ csrfToken: null, deeplinkScheme: null, spec: null })
  })

  it('round-trips a scheme + token spec', () => {
    const state = encodeState({
      scheme: 'myapp',
      csrf: 'csrf-xyz',
      spec: { loc: 'fragment', ap: '/welcome' },
    })
    const decoded = decodeState(state)
    expect(decoded.csrfToken).toBe('csrf-xyz')
    expect(decoded.deeplinkScheme).toBe('myapp')
    expect(decoded.spec).toEqual({ loc: 'fragment', ap: '/welcome' })
  })

  it('round-trips a code-flow spec with exchange endpoint', () => {
    const state = encodeState({
      scheme: 'myapp',
      spec: { loc: 'code', ex: '/api/auth/exchange', ap: '/auth' },
    })
    const decoded = decodeState(state)
    expect(decoded.spec).toEqual({ loc: 'code', ex: '/api/auth/exchange', ap: '/auth' })
  })

  it('omits the spec segment when spec is empty', () => {
    // Empty spec → no third segment, keeps state short and back-compatible
    // with consumers that only know the two-segment csrf|scheme form.
    const state = encodeState({ scheme: 'myapp', csrf: 'c' })
    expect(state).toBe('c|myapp')
  })

  it('handles malformed spec by ignoring it (degrades gracefully)', () => {
    // Manually crafted bad state — third segment isn't valid base64url JSON.
    const decoded = decodeState('csrf|myapp|not-valid-base64-json!!!')
    expect(decoded.csrfToken).toBe('csrf')
    expect(decoded.deeplinkScheme).toBe('myapp')
    expect(decoded.spec).toBe(null)
  })
})
