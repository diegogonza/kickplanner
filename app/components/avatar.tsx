// Avatar reutilizable: muestra la foto de perfil si existe, o la inicial con color.
// Sin hooks: se puede usar en Server y Client Components.

const AVATAR_COLORS = [
  '#FD5F5C', '#2E77E6', '#14B8A6', '#E0A81E',
  '#EC4899', '#7B5CF0', '#22C55E', '#0D9488',
]
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function Avatar({
  name,
  email,
  url,
  size = 28,
  title,
}: {
  name?: string | null
  email?: string | null
  url?: string | null
  size?: number
  title?: string
}) {
  const seed = email || name || '?'
  const initial = (name?.trim()?.[0] || email?.[0] || '?').toUpperCase()
  const label = title ?? name ?? email ?? undefined

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="ava ava-img"
        src={url}
        alt={label ?? 'avatar'}
        title={label}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="ava ava-ini"
      title={label}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: colorFor(seed) }}
    >
      {initial}
    </span>
  )
}
