import TabLink from '@/app/components/tab-link'

// Pestañas del área de Administración (solo admin).
const TABS = [
  {
    key: 'roles',
    label: 'Roles y miembros',
    href: '/admin',
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="m16 11 2 2 4-4" />
      </>
    ),
  },
  {
    key: 'clientes',
    label: 'Clientes',
    href: '/clientes',
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
  {
    key: 'plantillas',
    label: 'Plantillas',
    href: '/plantillas',
    icon: <path d="M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z" />,
  },
] as const

export type AdminTabKey = (typeof TABS)[number]['key']

export default function AdminTabs({ active }: { active: AdminTabKey }) {
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <TabLink key={t.key} href={t.href} active={active === t.key}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {t.icon}
          </svg>
          {t.label}
        </TabLink>
      ))}
    </div>
  )
}
