import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useOAuthCallback } from '../src/react/useOAuthCallback.js'

afterEach(() => {
  cleanup()
})

function setLocation(href: string) {
  delete (window as { location?: Location }).location
  // @ts-expect-error - constructing a partial Location for tests
  window.location = new URL(href)
}

describe('useOAuthCallback', () => {
  it('fires onCallback once when tokens are present on mount', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const onCallback = vi.fn()

    renderHook(() => useOAuthCallback({ onCallback }))

    // Effects run synchronously in the test env; flush microtasks.
    await act(async () => { await Promise.resolve() })

    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.access_token).toBe('abc')
  })

  it('does not fire onCallback for an empty URL by default', async () => {
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()

    renderHook(() => useOAuthCallback({ onCallback }))
    await act(async () => { await Promise.resolve() })

    expect(onCallback).not.toHaveBeenCalled()
  })

  it('fires onCallback when URL changes after mount (the already-mounted bug)', async () => {
    // This is the bug the docs warn about: `/auth` is already mounted when the
    // deeplink arrives, the URL updates, but a naive useEffect doesn't re-fire.
    // useOAuthCallback should catch the popstate and re-read the URL.
    setLocation('https://app.com/auth')  // start empty
    const onCallback = vi.fn()

    renderHook(() => useOAuthCallback({ onCallback }))
    await act(async () => { await Promise.resolve() })
    expect(onCallback).toHaveBeenCalledTimes(0)

    // Simulate the deeplink arriving while already mounted.
    await act(async () => {
      setLocation('https://app.com/auth?access_token=newly-arrived&state=csrf|myapp')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await Promise.resolve()
    })

    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.access_token).toBe('newly-arrived')
  })

  it('deduplicates calls for the same URL (Strict Mode safety)', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const onCallback = vi.fn()

    const { rerender } = renderHook(() => useOAuthCallback({ onCallback }))
    await act(async () => { await Promise.resolve() })

    // Re-render shouldn't trigger another onCallback for the same URL.
    rerender()
    await act(async () => { await Promise.resolve() })

    expect(onCallback).toHaveBeenCalledTimes(1)
  })

  it('handles errors thrown by the callback gracefully', async () => {
    setLocation('https://app.com/auth?access_token=abc&state=csrf|myapp')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onCallback = vi.fn().mockRejectedValue(new Error('boom'))

    renderHook(() => useOAuthCallback({ onCallback }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('also catches hashchange events', async () => {
    // Apple's fragment flow lands tokens in `#id_token=...`. A router that
    // doesn't fire popstate for hash-only changes still needs to trigger our
    // re-read.
    setLocation('https://app.com/auth')
    const onCallback = vi.fn()

    renderHook(() => useOAuthCallback({ onCallback }))
    await act(async () => { await Promise.resolve() })

    await act(async () => {
      setLocation('https://app.com/auth#id_token=eyJ&state=csrf|myapp')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      await Promise.resolve()
    })

    expect(onCallback).toHaveBeenCalledTimes(1)
    expect(onCallback.mock.calls[0][0].tokens.id_token).toBe('eyJ')
  })
})
