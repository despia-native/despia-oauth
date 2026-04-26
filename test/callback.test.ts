import { describe, it, expect } from 'vitest'
import { parseCallback, hasCallbackData } from '../src/callback.js'

describe('parseCallback', () => {
  it('parses tokens from URL fragment (implicit flow)', () => {
    const url = 'https://app.com/native-callback?deeplink_scheme=myapp#access_token=abc&refresh_token=def&expires_in=3600'
    const parsed = parseCallback(url)
    expect(parsed.tokens.access_token).toBe('abc')
    expect(parsed.tokens.refresh_token).toBe('def')
    expect(parsed.tokens.expires_in).toBe(3600)
  })

  it('parses code from query (auth code flow)', () => {
    const url = 'https://app.com/native-callback?code=xyz&state=csrf|myapp'
    const parsed = parseCallback(url)
    expect(parsed.tokens.code).toBe('xyz')
    expect(parsed.deeplinkScheme).toBe('myapp')
    expect(parsed.cleanState).toBe('csrf')
  })

  it('prefers query over fragment when both present', () => {
    // This matches the doc'd behaviour: deeplink path is the source of truth,
    // and a leftover fragment from a prior nav shouldn't override it.
    const url = 'https://app.com/auth?access_token=from-query#access_token=from-fragment'
    const parsed = parseCallback(url)
    expect(parsed.tokens.access_token).toBe('from-query')
  })

  it('extracts deeplink_scheme from state', () => {
    const url = 'https://app.com/cb?code=abc&state=uuid-here|myapp'
    const parsed = parseCallback(url)
    expect(parsed.deeplinkScheme).toBe('myapp')
  })

  it('handles state with no scheme suffix (regular CSRF token)', () => {
    const url = 'https://app.com/cb?code=abc&state=just-a-csrf-token'
    const parsed = parseCallback(url)
    expect(parsed.deeplinkScheme).toBe(null)
    expect(parsed.cleanState).toBe('just-a-csrf-token')
  })

  it('parses errors', () => {
    const url = 'https://app.com/cb?error=access_denied&error_description=User+cancelled'
    const parsed = parseCallback(url)
    expect(parsed.tokens.error).toBe('access_denied')
    expect(parsed.tokens.error_description).toBe('User cancelled')
  })

  it('returns empty tokens when URL has no relevant params', () => {
    const url = 'https://app.com/auth'
    const parsed = parseCallback(url)
    expect(parsed.tokens).toEqual({})
    expect(hasCallbackData(parsed)).toBe(false)
  })

  it('parses Apple id_token from fragment', () => {
    const url = 'https://app.com/native-callback.html?deeplink_scheme=myapp#id_token=eyJ...&code=abc&state=csrf|myapp'
    const parsed = parseCallback(url)
    expect(parsed.tokens.id_token).toBe('eyJ...')
    expect(parsed.tokens.code).toBe('abc')
    expect(parsed.deeplinkScheme).toBe('myapp')
  })

  it('ignores invalid expires_in', () => {
    const url = 'https://app.com/cb#access_token=abc&expires_in=not-a-number'
    const parsed = parseCallback(url)
    expect(parsed.tokens.access_token).toBe('abc')
    expect(parsed.tokens.expires_in).toBeUndefined()
  })

  it('treats empty string as absent', () => {
    const url = 'https://app.com/cb?access_token=abc&refresh_token='
    const parsed = parseCallback(url)
    expect(parsed.tokens.access_token).toBe('abc')
    expect(parsed.tokens.refresh_token).toBeUndefined()
  })
})

describe('hasCallbackData', () => {
  it('returns true for any token-bearing field', () => {
    expect(hasCallbackData(parseCallback('https://x/y?access_token=a'))).toBe(true)
    expect(hasCallbackData(parseCallback('https://x/y?id_token=a'))).toBe(true)
    expect(hasCallbackData(parseCallback('https://x/y?code=a'))).toBe(true)
    expect(hasCallbackData(parseCallback('https://x/y?session_token=a'))).toBe(true)
    expect(hasCallbackData(parseCallback('https://x/y?error=denied'))).toBe(true)
  })

  it('returns false for refresh_token alone (you need an access too)', () => {
    expect(hasCallbackData(parseCallback('https://x/y?refresh_token=a'))).toBe(false)
  })

  it('returns false when no relevant params', () => {
    expect(hasCallbackData(parseCallback('https://x/y'))).toBe(false)
  })
})
