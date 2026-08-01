import { describe, expect, it } from 'vitest'
import { parseHooksDocument } from '../src/main/hooks/document'

describe('parseHooksDocument', () => {
  it.each(['', '   ', '\r\n\t'])('treats an empty hooks file as an empty document', (content) => {
    expect(parseHooksDocument(content)).toEqual({})
  })

  it('parses a populated hooks document', () => {
    expect(parseHooksDocument('{"hooks":{"Stop":[]}}')).toEqual({ hooks: { Stop: [] } })
  })

  it('still rejects malformed JSON', () => {
    expect(() => parseHooksDocument('{"hooks":')).toThrow()
  })
})
