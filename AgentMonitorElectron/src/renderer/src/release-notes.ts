import DOMPurify from 'dompurify'
import { marked } from 'marked'

const FORBIDDEN_TAGS = [
  'audio',
  'button',
  'form',
  'iframe',
  'img',
  'input',
  'script',
  'style',
  'video'
]

export function renderReleaseNotes(source: string): string {
  const rendered = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true
  })
  const sanitized = DOMPurify.sanitize(rendered, {
    FORBID_ATTR: ['style'],
    FORBID_TAGS: FORBIDDEN_TAGS,
    USE_PROFILES: { html: true }
  })
  const template = document.createElement('template')
  template.innerHTML = sanitized

  for (const anchor of template.content.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')
    try {
      const url = new URL(href ?? '', window.location.href)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('UNSAFE_LINK_PROTOCOL')
      anchor.href = url.toString()
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
    } catch {
      anchor.removeAttribute('href')
      anchor.removeAttribute('target')
      anchor.removeAttribute('rel')
    }
  }

  return template.innerHTML
}
