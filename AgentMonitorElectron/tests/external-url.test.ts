import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from '../src/main/security/external-url'

describe('isSafeExternalUrl', () => {
  it('allows ordinary HTTP and HTTPS links', () => {
    expect(isSafeExternalUrl('https://github.com/yanachen1314/Agent-Monitor/releases')).toBe(true)
    expect(isSafeExternalUrl('http://example.com/changelog')).toBe(true)
  })

  it('rejects unsafe, malformed and credential-bearing links', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('https://user:password@example.com')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})
