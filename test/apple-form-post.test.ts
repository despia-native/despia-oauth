import { describe, expect, it } from 'vitest'
import {
  buildAppleFormPostRedirectUrl,
  handleAppleFormPostRequest,
  parseAppleFormPostBody,
} from '../src/server/apple-form-post.js'

describe('apple form_post helpers', () => {
  it('parses application/x-www-form-urlencoded bodies', () => {
    const body = new URLSearchParams({
      state: 's',
      code: 'c',
      id_token: 'i',
      user: 'u',
    }).toString()

    expect(parseAppleFormPostBody(body)).toEqual({
      state: 's',
      code: 'c',
      id_token: 'i',
      user: 'u',
      error: null,
      error_description: null,
    })
  })

  it('builds a redirect URL to native-callback with tokens in query', () => {
    const url = buildAppleFormPostRedirectUrl(
      {
        state: 's',
        code: 'c',
        id_token: 'i',
        user: 'u',
        error: null,
        error_description: null,
      },
      { appOrigin: 'https://app.example', nativeCallbackPath: '/native-callback.html' },
    )

    const u = new URL(url)
    expect(u.origin).toBe('https://app.example')
    expect(u.pathname).toBe('/native-callback.html')
    expect(u.searchParams.get('state')).toBe('s')
    expect(u.searchParams.get('code')).toBe('c')
    expect(u.searchParams.get('id_token')).toBe('i')
    expect(u.searchParams.get('user')).toBe('u')
  })

  it('prefers session_token when provided', () => {
    const url = buildAppleFormPostRedirectUrl(
      {
        state: 's',
        code: 'c',
        id_token: 'i',
        user: null,
        error: null,
        error_description: null,
      },
      {
        appOrigin: 'https://app.example',
        nativeCallbackPath: '/native-callback.html',
        sessionToken: 'opaque',
      },
    )

    const u = new URL(url)
    expect(u.searchParams.get('session_token')).toBe('opaque')
    expect(u.searchParams.get('id_token')).toBeNull()
    expect(u.searchParams.get('code')).toBeNull()
  })

  it('handles POST requests via Web Request/Response', async () => {
    const body = new URLSearchParams({ state: 's', id_token: 'i' }).toString()
    const req = new Request('https://app.example/apple/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })

    const res = await handleAppleFormPostRequest(req, {
      appOrigin: 'https://app.example',
      nativeCallbackPath: '/native-callback.html',
    })

    expect(res.status).toBe(302)
    const loc = res.headers.get('location')
    expect(loc).toBeTruthy()

    const u = new URL(loc!)
    expect(u.pathname).toBe('/native-callback.html')
    expect(u.searchParams.get('state')).toBe('s')
    expect(u.searchParams.get('id_token')).toBe('i')
  })
})
