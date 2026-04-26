import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { oauth } from '../src/oauth.js'
import { decodeState } from '../src/deeplink.js'
import { DespiaOAuthError } from '../src/types.js'

let originalUA: PropertyDescriptor | undefined
beforeEach(() => {
  originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
})
afterEach(() => {
  if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA)
  try { delete (window as { despia?: string }).despia } catch { /* ignore */ }
})

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

function captureWindowDespia(): { calls: string[]; restore: () => void } {
  const calls: string[] = []
  delete (window as { despia?: string }).despia
  Object.defineProperty(window, 'despia', {
    configurable: true,
    set(value: string) { calls.push(value) },
    get() { return calls[calls.length - 1] },
  })
  return {
    calls,
    restore: () => {
      try { delete (window as { despia?: string }).despia } catch { /* ignore */ }
    },
  }
}

function extractOAuthUrl(despiaCommand: string): URL {
  const url = decodeURIComponent(despiaCommand.replace(/^oauth:\/\/\?url=/, ''))
  return new URL(url)
}

describe('oauth.signIn (universal)', () => {
  it('opens any URL via the despia bridge with state appended', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fapp.com%2Fnative-callback.html',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      expect(cap.calls).toHaveLength(1)
      const url = extractOAuthUrl(cap.calls[0])
      // User's params preserved verbatim:
      expect(url.searchParams.get('provider')).toBe('google')
      expect(url.searchParams.get('redirect_to')).toBe('https://app.com/native-callback.html')
      // Our state attached:
      const decoded = decodeState(url.searchParams.get('state'))
      expect(decoded.deeplinkScheme).toBe('myapp')
      expect(decoded.spec?.loc).toBe('both') // default
      expect(decoded.spec?.ap).toBe('/auth')
    } finally {
      cap.restore()
    }
  })

  it('replaces an existing state on the user URL with the encoded one', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://idp.example/oauth?state=user-supplied-state',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      const url = extractOAuthUrl(cap.calls[0])
      const stateParam = url.searchParams.get('state')
      // Should NOT be 'user-supplied-state' anymore — we replaced it.
      expect(stateParam).not.toBe('user-supplied-state')
      // Should decode to our config.
      expect(decodeState(stateParam).deeplinkScheme).toBe('myapp')
    } finally {
      cap.restore()
    }
  })

  it('preserves all other URL parameters verbatim', () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://idp.example/oauth?client_id=abc&scope=read+write&prompt=consent&access_type=offline',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      const url = extractOAuthUrl(cap.calls[0])
      expect(url.searchParams.get('client_id')).toBe('abc')
      expect(url.searchParams.get('scope')).toBe('read write')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('access_type')).toBe('offline')
    } finally {
      cap.restore()
    }
  })

  it('encodes tokenLocation into the state spec', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://idp.example/oauth?x=1',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        tokenLocation: 'fragment',
      })
      const decoded = decodeState(extractOAuthUrl(cap.calls[0]).searchParams.get('state'))
      expect(decoded.spec?.loc).toBe('fragment')
    } finally {
      cap.restore()
    }
  })

  it('encodes exchange endpoint into the state spec for code flows', () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://idp.example/oauth?x=1',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        tokenLocation: 'code',
        exchangeEndpoint: 'https://api.app.com/auth/exchange',
      })
      const decoded = decodeState(extractOAuthUrl(cap.calls[0]).searchParams.get('state'))
      expect(decoded.spec?.loc).toBe('code')
      expect(decoded.spec?.ex).toBe('https://api.app.com/auth/exchange')
    } finally {
      cap.restore()
    }
  })

  it('respects custom authPath via state spec', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.signIn({
        url: 'https://idp.example/oauth?x=1',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        authPath: '/welcome',
      })
      const decoded = decodeState(extractOAuthUrl(cap.calls[0]).searchParams.get('state'))
      expect(decoded.spec?.ap).toBe('/welcome')
    } finally {
      cap.restore()
    }
  })

  it('throws when url missing', () => {
    setUA('Android despia/1.0')
    expect(() =>
      oauth.signIn({
        url: '',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).toThrow(/url/)
  })

  it('throws when deeplinkScheme missing', () => {
    setUA('Android despia/1.0')
    expect(() =>
      oauth.signIn({
        url: 'https://idp.example/oauth',
        deeplinkScheme: '',
        appOrigin: 'https://app.com',
      }),
    ).toThrow(/deeplinkScheme/)
  })

  it('throws when tokenLocation=code but no exchangeEndpoint', () => {
    setUA('Android despia/1.0')
    expect(() =>
      oauth.signIn({
        url: 'https://idp.example/oauth',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        tokenLocation: 'code',
      }),
    ).toThrow(/exchangeEndpoint/)
  })

  it('navigates the window on web (no native bridge)', () => {
    setUA('Mozilla/5.0 (Macintosh)')
    const originalLocation = window.location
    delete (window as { location?: Location }).location
    // @ts-expect-error - partial Location
    window.location = { href: '' }
    try {
      oauth.signIn({
        url: 'https://abc.supabase.co/auth/v1/authorize?provider=google',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      expect(window.location.href).toContain('abc.supabase.co/auth/v1/authorize')
      expect(window.location.href).toContain('state=')
    } finally {
      // @ts-expect-error - restore
      window.location = originalLocation
    }
  })

  it('works with a Supabase-built URL', () => {
    setUA('iPhone despia/1.0')
    const cap = captureWindowDespia()
    try {
      // Simulate what buildSupabaseAuthUrl would produce
      const supabaseUrl = 'https://abc.supabase.co/auth/v1/authorize?' + new URLSearchParams({
        provider: 'google',
        redirect_to: 'https://app.com/native-callback.html',
      }).toString()

      oauth.signIn({
        url: supabaseUrl,
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        tokenLocation: 'fragment', // Supabase implicit returns tokens in fragment
      })

      const url = extractOAuthUrl(cap.calls[0])
      expect(url.host).toBe('abc.supabase.co')
      expect(url.searchParams.get('provider')).toBe('google')
      const decoded = decodeState(url.searchParams.get('state'))
      expect(decoded.spec?.loc).toBe('fragment')
    } finally {
      cap.restore()
    }
  })
})

describe('oauth.apple', () => {
  it('iOS native: throws if AppleID SDK not loaded', async () => {
    setUA('iPhone despia/1.0')
    await expect(
      oauth.apple({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).rejects.toThrow(/Apple JS SDK/)
  })

  it('Android native: builds redirect-flow URL with form_post when configured', async () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      await oauth.apple({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        responseMode: 'form_post',
        formPostHandlerUrl: 'https://api.app.com/apple-callback',
      })
      const url = extractOAuthUrl(cap.calls[0])
      expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize')
      expect(url.searchParams.get('response_mode')).toBe('form_post')
      expect(url.searchParams.get('redirect_uri')).toBe('https://api.app.com/apple-callback')
    } finally {
      cap.restore()
    }
  })

  it('Android native: throws when form_post used without handler', async () => {
    setUA('Android despia/1.0')
    await expect(
      oauth.apple({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        responseMode: 'form_post',
      }),
    ).rejects.toThrow(/formPostHandlerUrl/)
  })

  it('Android native: defaults to fragment mode and the standard exit path', async () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      await oauth.apple({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      const url = extractOAuthUrl(cap.calls[0])
      expect(url.searchParams.get('response_mode')).toBe('fragment')
      expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/native-callback.html')
    } finally {
      cap.restore()
    }
  })

  it('throws when servicesId missing', async () => {
    setUA('Android despia/1.0')
    await expect(
      oauth.apple({
        servicesId: '',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).rejects.toThrow(DespiaOAuthError)
  })

  it('throws when deeplinkScheme missing', async () => {
    setUA('Android despia/1.0')
    await expect(
      oauth.apple({
        servicesId: 'com.example.web',
        deeplinkScheme: '',
        appOrigin: 'https://app.com',
      }),
    ).rejects.toThrow(/deeplinkScheme/)
  })
})

describe('oauth namespace shape', () => {
  it('exposes signIn, apple, tiktok, isIOSNative', () => {
    expect(typeof oauth.signIn).toBe('function')
    expect(typeof oauth.apple).toBe('function')
    expect(typeof oauth.tiktok).toBe('function')
    expect(typeof oauth.isIOSNative).toBe('function')
    // No google / custom — anything not Apple or TikTok goes through signIn.
    expect((oauth as Record<string, unknown>).google).toBeUndefined()
    expect((oauth as Record<string, unknown>).custom).toBeUndefined()
  })
})

describe('oauth.tiktok', () => {
  it('builds the URL with comma-separated scopes and code spec', () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.tiktok({
        clientKey: 'tk-key',
        exchangeEndpoint: 'https://api.app.com/auth/tiktok',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        scopes: ['user.info.basic', 'user.info.profile'],
      })
      const url = extractOAuthUrl(cap.calls[0])
      expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
      expect(url.searchParams.get('client_key')).toBe('tk-key')
      expect(url.searchParams.get('scope')).toBe('user.info.basic,user.info.profile')
      const decoded = decodeState(url.searchParams.get('state'))
      expect(decoded.spec?.loc).toBe('code')
      expect(decoded.spec?.ex).toBe('https://api.app.com/auth/tiktok')
    } finally {
      cap.restore()
    }
  })

  it('throws when exchangeEndpoint missing', () => {
    setUA('Android despia/1.0')
    expect(() =>
      oauth.tiktok({
        clientKey: 'tk',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      } as unknown as Parameters<typeof oauth.tiktok>[0]),
    ).toThrow(/exchangeEndpoint/)
  })

  it('throws when clientKey missing', () => {
    setUA('Android despia/1.0')
    expect(() =>
      oauth.tiktok({
        clientKey: '',
        exchangeEndpoint: 'https://api.app.com/auth/tiktok',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).toThrow(/clientKey/)
  })

  it('defaults to user.info.basic when scopes omitted', () => {
    setUA('Android despia/1.0')
    const cap = captureWindowDespia()
    try {
      oauth.tiktok({
        clientKey: 'tk-key',
        exchangeEndpoint: 'https://api.app.com/auth/tiktok',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      })
      const url = extractOAuthUrl(cap.calls[0])
      expect(url.searchParams.get('scope')).toBe('user.info.basic')
    } finally {
      cap.restore()
    }
  })
})
