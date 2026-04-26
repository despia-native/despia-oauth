import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encodeState } from '../src/deeplink.js'

function setLocation(href: string) {
  delete (window as { location?: Location }).location
  // @ts-expect-error - jsdom partial Location
  window.location = new URL(href)
}

describe('<despia-oauth-callback> and <despia-oauth-tokens>', () => {
  beforeEach(async () => {
    // Import for side effect — registers the elements.
    await import('../src/web-components/auto-register.js')
  })

  it('registers both custom elements', () => {
    expect(customElements.get('despia-oauth-callback')).toBeDefined()
    expect(customElements.get('despia-oauth-tokens')).toBeDefined()
  })

  it('<despia-oauth-callback> fires deeplink when tokens are in URL fragment', async () => {
    const state = encodeState({ scheme: 'myapp', spec: { loc: 'fragment', ap: '/auth' } })
    setLocation(`https://app.com/native-callback.html#access_token=abc&state=${encodeURIComponent(state)}`)

    // Capture the deeplink navigation by intercepting location.href set
    const navigations: string[] = []
    const originalLocation = window.location
    delete (window as { location?: Location }).location
    // @ts-expect-error - test stub
    window.location = {
      ...originalLocation,
      get href() { return originalLocation.href },
      set href(value: string) { navigations.push(value) },
      origin: 'https://app.com',
      pathname: '/native-callback.html',
      search: originalLocation.search,
      hash: originalLocation.hash,
    }

    const el = document.createElement('despia-oauth-callback')
    document.body.appendChild(el)

    // The component schedules work via requestAnimationFrame; flush it.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await new Promise((r) => setTimeout(r, 10))

    expect(navigations).toHaveLength(1)
    expect(navigations[0]).toContain('myapp://oauth/auth')
    expect(navigations[0]).toContain('access_token=abc')

    document.body.removeChild(el)
    // @ts-expect-error - restore
    window.location = originalLocation
  })

  it('<despia-oauth-tokens> dispatches "tokens" event on URL with access_token', async () => {
    setLocation('https://app.com/auth?access_token=tk&state=' + encodeURIComponent(encodeState('myapp')))
    const el = document.createElement('despia-oauth-tokens')

    const tokensPromise = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('tokens', (e) => resolve(e as CustomEvent))
    })

    document.body.appendChild(el)
    const event = await tokensPromise
    expect(event.detail.access_token).toBe('tk')

    document.body.removeChild(el)
  })

  it('<despia-oauth-tokens> dispatches "oauth-error" on error in URL', async () => {
    setLocation('https://app.com/auth?error=access_denied&error_description=User+cancelled&state=' + encodeURIComponent(encodeState('myapp')))
    const el = document.createElement('despia-oauth-tokens')

    const errorPromise = new Promise<CustomEvent>((resolve) => {
      el.addEventListener('oauth-error', (e) => resolve(e as CustomEvent))
    })

    document.body.appendChild(el)
    const event = await errorPromise
    expect(event.detail).toEqual({ code: 'access_denied', description: 'User cancelled' })

    document.body.removeChild(el)
  })

  it('<despia-oauth-tokens> reacts to URL change while mounted (already-mounted bug fix)', async () => {
    setLocation('https://app.com/auth')
    const el = document.createElement('despia-oauth-tokens')
    const events: CustomEvent[] = []
    el.addEventListener('tokens', (e) => events.push(e as CustomEvent))
    document.body.appendChild(el)

    // No tokens at mount → no event yet.
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toHaveLength(0)

    // Simulate the deeplink arriving while the page is already mounted.
    setLocation('https://app.com/auth?access_token=arrived&state=' + encodeURIComponent(encodeState('myapp')))
    window.dispatchEvent(new PopStateEvent('popstate'))
    await new Promise((r) => setTimeout(r, 0))

    expect(events).toHaveLength(1)
    expect(events[0].detail.access_token).toBe('arrived')

    document.body.removeChild(el)
  })

  it('<despia-oauth-tokens> deduplicates against the same URL', async () => {
    setLocation('https://app.com/auth?access_token=once&state=' + encodeURIComponent(encodeState('myapp')))
    const el = document.createElement('despia-oauth-tokens')
    const events: CustomEvent[] = []
    el.addEventListener('tokens', (e) => events.push(e as CustomEvent))
    document.body.appendChild(el)

    await new Promise((r) => setTimeout(r, 0))
    expect(events).toHaveLength(1)

    // Same URL re-dispatched popstate: no second fire.
    window.dispatchEvent(new PopStateEvent('popstate'))
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toHaveLength(1)

    document.body.removeChild(el)
  })

  it('<despia-oauth-callback> warns when exchange-endpoint is a same-origin relative path', async () => {
    // Setup: callback URL has a code but the exchange-endpoint is relative,
    // which means the user's backend serves both this page AND the exchange
    // endpoint — they're paying for an unnecessary round trip. The component
    // should warn.
    setLocation('https://app.com/native-callback?code=abc&state=' + encodeURIComponent(encodeState('myapp')))

    // Stub fetch so the actual exchange call doesn't fail noisily; we only
    // care about the warning.
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'x' }),
    } as Response)

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const el = document.createElement('despia-oauth-callback')
    el.setAttribute('exchange-endpoint', '/api/auth/exchange')
    document.body.appendChild(el)

    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await new Promise((r) => setTimeout(r, 20))

    expect(consoleWarn).toHaveBeenCalled()
    const warning = consoleWarn.mock.calls[0][0] as string
    expect(warning).toMatch(/relative path/)
    expect(warning).toMatch(/server-rendered/i)

    consoleWarn.mockRestore()
    global.fetch = originalFetch
    document.body.removeChild(el)
  })

  it('<despia-oauth-callback> does NOT warn for absolute https exchange-endpoint', async () => {
    setLocation('https://app.com/native-callback?code=abc&state=' + encodeURIComponent(encodeState('myapp')))

    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'x' }),
    } as Response)

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const el = document.createElement('despia-oauth-callback')
    el.setAttribute('exchange-endpoint', 'https://api.app.com/auth/exchange')
    document.body.appendChild(el)

    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await new Promise((r) => setTimeout(r, 20))

    // No warning — absolute URLs are fine.
    expect(consoleWarn).not.toHaveBeenCalled()

    consoleWarn.mockRestore()
    global.fetch = originalFetch
    document.body.removeChild(el)
  })
})
