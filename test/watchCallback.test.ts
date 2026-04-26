import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { watchCallbackUrl } from '../src/watchCallback.js'

function setLocation(href: string) {
  delete (window as { location?: Location }).location
  // @ts-expect-error - jsdom partial Location
  window.location = new URL(href)
}

describe('watchCallbackUrl', () => {
  let cleanup: (() => void) | null = null

  beforeEach(() => {
    setLocation('https://app.com/auth')
  })

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('fires immediately when tokens are already in the URL', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)
    await Promise.resolve()
    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.access_token).toBe('abc')
  })

  it('does not fire for empty URL by default', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)
    await Promise.resolve()
    expect(onCallback).not.toHaveBeenCalled()
  })

  it('fires for empty URL when fireOnEmpty=true', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback, { fireOnEmpty: true })
    await Promise.resolve()
    expect(onCallback).toHaveBeenCalledTimes(1)
  })

  it('fires on popstate when URL changes (already-mounted page bug fix)', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)

    setLocation('https://app.com/auth?access_token=newly-arrived&state=csrf|myapp')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await Promise.resolve()

    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.access_token).toBe('newly-arrived')
  })

  it('fires on hashchange (Apple fragment flow)', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)

    setLocation('https://app.com/auth#id_token=eyJ&state=csrf|myapp')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await Promise.resolve()

    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.id_token).toBe('eyJ')
  })

  it('deduplicates against the same URL (Strict Mode safety)', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)
    await Promise.resolve()

    // Same URL: should not re-fire even if popstate fires.
    window.dispatchEvent(new PopStateEvent('popstate'))
    await Promise.resolve()
    expect(onCallback).toHaveBeenCalledTimes(1)
  })

  it('cleanup removes listeners', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()
    cleanup = watchCallbackUrl(onCallback)
    cleanup()
    cleanup = null

    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await Promise.resolve()

    expect(onCallback).not.toHaveBeenCalled()
  })

  it('logs and recovers when handler throws', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onCallback = vi.fn().mockRejectedValue(new Error('boom'))
    cleanup = watchCallbackUrl(onCallback)
    // Wait for the rejected promise to be observed by the .catch handler.
    // Two ticks is enough for Promise.resolve(rejected) → .catch to run.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()

    // After failure, the dedupe state resets so a retry can succeed.
    onCallback.mockResolvedValueOnce(undefined)
    setLocation('https://app.com/auth?access_token=retry&state=csrf|myapp')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await new Promise((r) => setTimeout(r, 0))
    expect(onCallback).toHaveBeenCalledTimes(2)
  })

  it('returns a noop cleanup on SSR (no window)', () => {
    const result = watchCallbackUrl(vi.fn(), { win: undefined })
    expect(typeof result).toBe('function')
    expect(() => result()).not.toThrow()
  })
})
