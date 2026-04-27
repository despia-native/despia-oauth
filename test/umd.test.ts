/**
 * Smoke-tests: load the UMD bundles as scripts in jsdom and verify the
 * expected API surface and side effects.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Main UMD bundle (window.DespiaOAuth)', () => {
  it('exposes oauth namespace and lower-level escape hatches', () => {
    const umdSource = readFileSync(
      resolve(__dirname, '../dist/umd/despia-oauth.min.js'),
      'utf-8',
    )
    // Indirect eval evaluates in global scope so the bundle's top-level
    // `var DespiaOAuth` becomes accessible as `globalThis.DespiaOAuth` —
    // same as a real <script> tag.
    ;(0, eval)(umdSource)
    const api = (globalThis as { DespiaOAuth?: Record<string, unknown> }).DespiaOAuth!

    // High-level oauth namespace (the recommended API)
    expect(typeof api.oauth).toBe('object')
    const oauth = api.oauth as Record<string, unknown>
    expect(typeof oauth.signIn).toBe('function')
    expect(typeof oauth.apple).toBe('function')
    expect(typeof oauth.tiktok).toBe('function')

    // Lower-level escape hatches
    expect(typeof api.detectRuntime).toBe('function')
    expect(typeof api.openOAuth).toBe('function')
    expect(typeof api.parseCallback).toBe('function')
    expect(typeof api.buildDeeplink).toBe('function')
    expect(typeof api.encodeState).toBe('function')
    expect(typeof api.decodeState).toBe('function')
    expect(typeof api.handleNativeCallback).toBe('function')
    expect(typeof api.watchCallbackUrl).toBe('function')
    expect(typeof api.DespiaOAuthError).toBe('function')

    // Sanity: a function actually works.
    const buildDeeplink = api.buildDeeplink as (
      s: string,
      p: string,
      params?: Record<string, string>,
    ) => string
    expect(buildDeeplink('myapp', '/auth', { access_token: 'x' })).toBe(
      'myapp://oauth/auth?access_token=x',
    )
  })

  it('does not bundle despia-native into the UMD', () => {
    const umdSource = readFileSync(
      resolve(__dirname, '../dist/umd/despia-oauth.min.js'),
      'utf-8',
    )
    // These distinctive strings come from despia-native's source
    // (commandQueue, VariableTracker). If they show up here we've
    // accidentally bundled despia-native — would cause a duplicate copy
    // race for `window.despia` if the user also loads despia-native via
    // <script>.
    expect(umdSource).not.toContain('VariableTracker')
    expect(umdSource).not.toContain('commandQueue')
  })
})

describe('Web components UMD bundle', () => {
  it('registers <despia-oauth-callback> and <despia-oauth-tokens>', () => {
    const wcSource = readFileSync(
      resolve(__dirname, '../dist/umd/web-components.min.js'),
      'utf-8',
    )
    // The auto-register module has a top-level call to
    // defineDespiaOAuthElements(). Loading it should register the elements.
    ;(0, eval)(wcSource)
    expect(customElements.get('despia-oauth-callback')).toBeDefined()
    expect(customElements.get('despia-oauth-tokens')).toBeDefined()
  })
})
