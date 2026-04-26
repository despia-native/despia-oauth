import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildGoogleAuthUrl } from '../src/providers/google.js'
import { buildTikTokAuthUrl } from '../src/providers/tiktok.js'
import { buildAppleAuthUrl } from '../src/providers/apple.js'
import { decodeState } from '../src/deeplink.js'
import { DespiaOAuthError } from '../src/types.js'

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

let originalUA: PropertyDescriptor | undefined
beforeEach(() => {
  originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
})
afterEach(() => {
  if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA)
})

describe('buildGoogleAuthUrl', () => {
  it('builds a native callback URL when running inside Despia', () => {
    setUA('iPhone despia/1.0')
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'g-client-id',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('g-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/native-callback.html')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    const state = url.searchParams.get('state')
    expect(decodeState(state).deeplinkScheme).toBe('myapp')
  })

  it('uses the web callback path when not in Despia', () => {
    setUA('Mozilla/5.0 (Macintosh)')
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'g',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    )
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/auth')
  })

  it('includes PKCE challenge when provided', () => {
    setUA('iPhone despia/1.0')
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'g',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        pkceChallenge: 'abc123challenge',
      }),
    )
    expect(url.searchParams.get('code_challenge')).toBe('abc123challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('throws when clientId missing', () => {
    expect(() =>
      buildGoogleAuthUrl({
        clientId: '',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).toThrow(DespiaOAuthError)
  })
})

describe('buildTikTokAuthUrl', () => {
  it('builds a TikTok URL with the correct param names', () => {
    setUA('Android despia/1.0')
    const url = new URL(
      buildTikTokAuthUrl({
        clientKey: 'tk-client',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    // TikTok uses `client_key` not `client_id`
    expect(url.searchParams.get('client_key')).toBe('tk-client')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/native-callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('user.info.basic')
  })

  it('joins multiple scopes with commas (TikTok-specific)', () => {
    setUA('Android despia/1.0')
    const url = new URL(
      buildTikTokAuthUrl({
        clientKey: 'tk',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        scopes: ['user.info.basic', 'user.info.profile'],
      }),
    )
    expect(url.searchParams.get('scope')).toBe('user.info.basic,user.info.profile')
  })
})

describe('buildAppleAuthUrl', () => {
  it('builds an Apple URL on Android with response_mode=fragment by default', () => {
    setUA('Android despia/1.0')
    const url = new URL(
      buildAppleAuthUrl({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize')
    expect(url.searchParams.get('client_id')).toBe('com.example.web')
    expect(url.searchParams.get('response_type')).toBe('code id_token')
    expect(url.searchParams.get('response_mode')).toBe('fragment')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/native-callback.html')
  })

  it('refuses to build a URL on iOS native (must use the JS SDK popup)', () => {
    setUA('iPhone despia/1.0')
    expect(() =>
      buildAppleAuthUrl({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
      }),
    ).toThrow(/iOS native/)
  })

  it('uses form_post handler path when responseMode=form_post', () => {
    setUA('Android despia/1.0')
    const url = new URL(
      buildAppleAuthUrl({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        responseMode: 'form_post',
        formPostHandlerPath: '/api/apple-callback',
      }),
    )
    expect(url.searchParams.get('response_mode')).toBe('form_post')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.com/api/apple-callback')
  })

  it('throws when form_post used without a handler path', () => {
    setUA('Android despia/1.0')
    expect(() =>
      buildAppleAuthUrl({
        servicesId: 'com.example.web',
        deeplinkScheme: 'myapp',
        appOrigin: 'https://app.com',
        responseMode: 'form_post',
      }),
    ).toThrow(/formPostHandlerPath/)
  })
})
