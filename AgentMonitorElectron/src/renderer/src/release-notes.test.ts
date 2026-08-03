/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { renderReleaseNotes } from './release-notes'

describe('renderReleaseNotes', () => {
  it('renders Markdown structure and prepares external links', () => {
    const html = renderReleaseNotes(
      '## 更新内容\n\n- 修复一\n- 修复二\n\n[完整记录](https://github.com/example/repo)'
    )

    expect(html).toContain('<h2>更新内容</h2>')
    expect(html).toContain('<li>修复一</li>')
    expect(html).toContain('href="https://github.com/example/repo"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders GitHub HTML notes while removing unsafe content', () => {
    const html = renderReleaseNotes(
      '<p><strong>Full Changelog</strong>: <a href="javascript:alert(1)">比较版本</a></p>' +
        '<img src="https://example.com/tracker.png"><script>alert(1)</script>'
    )

    expect(html).toContain('<strong>Full Changelog</strong>')
    expect(html).toContain('比较版本')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
  })
})
