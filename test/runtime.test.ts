import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectRuntime } from '../src/runtime.js'

describe('detectRuntime', () => {
  let originalUA: PropertyDescriptor | undefined

  beforeEach(() => {
    originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
  })

  afterEach(() => {
    if (originalUA) {
      Object.defineProperty(navigator, 'userAgent', originalUA)
    }
  })

  function setUA(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      configurable: true,
    })
  }

  it('detects Despia iOS', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 despia/1.0')
    expect(detectRuntime()).toEqual({ kind: 'native', platform: 'ios' })
  })

  it('detects Despia Android', () => {
    setUA('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537 despia/1.0')
    expect(detectRuntime()).toEqual({ kind: 'native', platform: 'android' })
  })

  it('detects regular web (no despia in UA)', () => {
    setUA('Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605')
    expect(detectRuntime()).toEqual({ kind: 'web' })
  })

  it('case-insensitive despia match', () => {
    setUA('Mozilla/5.0 (iPhone) DESPIA/2.0')
    expect(detectRuntime()).toEqual({ kind: 'native', platform: 'ios' })
  })

  it('returns ssr when navigator is undefined', () => {
    const originalNav = globalThis.navigator
    // @ts-expect-error simulating SSR
    delete globalThis.navigator
    try {
      expect(detectRuntime()).toEqual({ kind: 'ssr' })
    } finally {
      globalThis.navigator = originalNav
    }
  })
})
