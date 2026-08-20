'use client'

import { Fragment, type ReactNode } from 'react'
import Avatar from '@/app/components/avatar'
import { type Member } from '@/app/projects/statuses'

type Mention = { id: string; name: string | null; email: string; avatar: string | null }

function safeUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw, 'https://x')
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return raw
  } catch {
    return null
  }
  return null
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])|(\bwww\.[^\s<]+[^\s<.,;:!?)])/gi

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Autoenlaza URLs dentro de un texto plano -> nodos React
function linkifyText(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const raw = m[0]
    const href = raw.startsWith('www.') ? 'https://' + raw : raw
    out.push(
      <a key={`${keyBase}-l${k++}`} href={href} target="_blank" rel="noopener noreferrer">
        {raw}
      </a>
    )
    last = m.index + raw.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Texto plano (comentarios antiguos): menciones + autoenlace
function renderPlain(body: string, mentions: Mention[]): ReactNode {
  const named = (mentions ?? [])
    .map((m) => ({ m, dn: m.name?.trim() || m.email }))
    .filter((x) => x.dn)
    .sort((a, b) => b.dn.length - a.dn.length)
  if (named.length === 0) return <>{linkifyText(body, 'p')}</>
  const re = new RegExp('@(' + named.map((n) => escapeRegExp(n.dn)).join('|') + ')', 'g')
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) nodes.push(<Fragment key={`t${key}`}>{linkifyText(body.slice(last, match.index), `t${key}`)}</Fragment>)
    const dn = match[1]
    const m = named.find((n) => n.dn === dn)?.m
    nodes.push(
      <span key={`m${key++}`} className="mention-chip">
        {m && <Avatar name={m.name} email={m.email} url={m.avatar} size={18} />}
        {dn}
      </span>
    )
    last = match.index + match[0].length
  }
  if (last < body.length) nodes.push(<Fragment key="tend">{linkifyText(body.slice(last), 'tend')}</Fragment>)
  return <>{nodes}</>
}

// HTML (comentarios nuevos del editor): se recorre el DOM y se renderiza solo lo permitido
function renderNode(node: Node, members: Member[], key: string): ReactNode {
  const kids: ReactNode[] = []
  node.childNodes.forEach((n, i) => {
    const k = `${key}-${i}`
    if (n.nodeType === Node.TEXT_NODE) {
      kids.push(<Fragment key={k}>{linkifyText(n.textContent ?? '', k)}</Fragment>)
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') { kids.push(<br key={k} />); return }
    if (tag === 'strong' || tag === 'b') { kids.push(<strong key={k}>{renderNode(el, members, k)}</strong>); return }
    if (tag === 'em' || tag === 'i') { kids.push(<em key={k}>{renderNode(el, members, k)}</em>); return }
    if (tag === 'a') {
      const href = safeUrl(el.getAttribute('href'))
      kids.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">{el.textContent}</a>
        ) : (
          <Fragment key={k}>{el.textContent}</Fragment>
        )
      )
      return
    }
    if (tag === 'span' && el.classList.contains('mention-chip')) {
      const uid = el.getAttribute('data-uid')
      const m = members.find((x) => x.user_id === uid)
      kids.push(
        <span key={k} className="mention-chip">
          {m && <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={18} />}
          {el.textContent}
        </span>
      )
      return
    }
    // etiqueta no permitida -> se conserva solo el contenido
    kids.push(<Fragment key={k}>{renderNode(el, members, k)}</Fragment>)
  })
  return <>{kids}</>
}

export default function CommentBody({
  body,
  mentions,
  members,
}: {
  body: string
  mentions: Mention[]
  members: Member[]
}) {
  const isHtml = /<(a|br|strong|em|b|i|span|div|p)\b/i.test(body)
  if (!isHtml) return <>{renderPlain(body, mentions)}</>
  if (typeof window === 'undefined') return <>{body.replace(/<[^>]+>/g, '')}</>
  const doc = new DOMParser().parseFromString(`<div>${body}</div>`, 'text/html')
  const root = doc.body.firstChild
  if (!root) return <>{body.replace(/<[^>]+>/g, '')}</>
  return <>{renderNode(root, members, 'r')}</>
}
