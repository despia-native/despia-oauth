import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleNativeCallback } from '../src/handleNativeCallback.js'

function setLocation(href: string) {
  // jsdom-friendly way to swap location
  delete (window as { location?: Location }).location
  // @ts-expect-error - we're constructing a partial Location
  window.location = new URL(href)
}

describe('handleNativeCallback', () => {
  beforeEach(() => {
    setLocation('https://app.com/native-callback')
  })

  it('forwards implicit-flow tokens to the deeplink', async () => {
    setLocation('https://app.com/native-callback#access_token=abc&refresh_token=def&state=csrf|myapp')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('fired-deeplink')
    expect(navigate).toHaveBeenCalledTimes(1)
    const url = navigate.mock.calls[0][0]
    expect(url).toContain('myapp://oauth/auth')
    expect(url).toContain('access_token=abc')
    expect(url).toContain('refresh_token=def')
  })

  it('exchanges code via the provided callback before forwarding', async () => {
    setLocation('https://app.com/native-callback?code=auth-code-123&state=csrf|myapp')
    const exchangeCode = vi.fn().mockResolvedValue({
      access_token: 'exchanged-token',
      refresh_token: 'refresh-456',
    })
    const navigate = vi.fn()

    const result = await handleNativeCallback({ exchangeCode, navigate })

    expect(exchangeCode).toHaveBeenCalledWith({
      code: 'auth-code-123',
      state: 'csrf',
      redirectUri: 'https://app.com/native-callback',
    })
    expect(result.status).toBe('fired-deeplink')
    const url = navigate.mock.calls[0][0]
    expect(url).toContain('access_token=exchanged-token')
    expect(url).toContain('refresh_token=refresh-456')
    // The raw code should NOT be forwarded after a successful exchange.
    expect(url).not.toContain('code=auth-code-123')
  })

  it('routes provider errors to the auth page via deeplink', async () => {
    setLocation('https://app.com/native-callback?error=access_denied&state=csrf|myapp')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('fired-deeplink')
    const url = navigate.mock.calls[0][0]
    expect(url).toContain('myapp://oauth/auth')
    expect(url).toContain('error=access_denied')
  })

  it('routes exchange failures through the same error pipe', async () => {
    setLocation('https://app.com/native-callback?code=abc&state=csrf|myapp')
    const exchangeCode = vi.fn().mockRejectedValue(new Error('Token endpoint returned 401'))
    const navigate = vi.fn()

    const result = await handleNativeCallback({ exchangeCode, navigate })

    expect(result.status).toBe('fired-deeplink')
    expect(result.error?.code).toBe('exchange_failed')
    const url = navigate.mock.calls[0][0]
    expect(url).toContain('error=exchange_failed')
    expect(url).toContain('Token+endpoint+returned+401')
  })

  it('errors when no scheme is available anywhere', async () => {
    setLocation('https://app.com/native-callback#access_token=abc')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('error')
    expect(result.error?.code).toBe('no_deeplink_scheme')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses fallbackScheme when state has no scheme', async () => {
    setLocation('https://app.com/native-callback#access_token=abc')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate, fallbackScheme: 'myapp' })

    expect(result.status).toBe('fired-deeplink')
    expect(navigate.mock.calls[0][0]).toContain('myapp://oauth/auth')
  })

  it('reads deeplink_scheme from query param as backup', async () => {
    setLocation('https://app.com/native-callback?deeplink_scheme=myapp#access_token=abc')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('fired-deeplink')
    expect(navigate.mock.calls[0][0]).toContain('myapp://oauth/auth')
  })

  it('respects custom authPath', async () => {
    setLocation('https://app.com/native-callback#access_token=abc&state=csrf|myapp')
    const navigate = vi.fn()
    await handleNativeCallback({ navigate, authPath: '/welcome' })

    expect(navigate.mock.calls[0][0]).toContain('myapp://oauth/welcome')
  })

  it('errors-out via deeplink when no tokens and no exchange handler', async () => {
    setLocation('https://app.com/native-callback?state=csrf|myapp')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('fired-deeplink')
    expect(result.error?.code).toBe('no_tokens')
    expect(navigate.mock.calls[0][0]).toContain('error=no_tokens')
  })

  it('forwards code unchanged when no exchange handler is provided', async () => {
    setLocation('https://app.com/native-callback?code=auth-code&state=csrf|myapp')
    const navigate = vi.fn()
    const result = await handleNativeCallback({ navigate })

    expect(result.status).toBe('fired-deeplink')
    const url = navigate.mock.calls[0][0]
    expect(url).toContain('code=auth-code')
  })
})
