'use client'

import { useState } from 'react'

/** Iniciales de un cliente: "Dra Jessica Vera" → "DJ", "Hunter X" → "HX". */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const TONES = ['pf-logo--a', 'pf-logo--b', 'pf-logo--c']

/**
 * Favicon del sitio del cliente; si no tiene URL o el ícono no carga, sus
 * iniciales sobre un tono de la marca.
 */
export default function ClientLogo({ name, url, index }: { name: string; url: string | null; index: number }) {
  const host = hostOf(url)
  const [failed, setFailed] = useState(false)
  const tone = TONES[index % TONES.length]

  if (host && !failed) {
    return (
      <span className="pf-logo pf-logo--img" title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt={name}
          width={20}
          height={20}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  return (
    <span className={`pf-logo ${tone}`} title={name} aria-label={name} role="img">
      {initials(name)}
    </span>
  )
}
