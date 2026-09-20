'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Popover from '@/app/components/popover'
import { deleteProject } from '@/app/projects/actions'
import { createClient } from '@/utils/supabase/client'
import { toastIfFailed, toastNoPermission } from '@/app/components/toast'
import ProjectEditModal, { type EditableProject } from '@/app/components/project-edit-modal'
import ApplyTemplateModal from '@/app/components/apply-template-modal'

export type ProjectSettings = EditableProject

import type { ClientOption as Client, WorkspaceMember } from '@/app/lib/types'

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/**
 * Desplegable del encabezado del proyecto (chevron junto al título): editar
 * ajustes, Search Console, plantillas, exportar tareas y eliminar. Reemplaza a
 * la píldora de GSC y a los botones sueltos de "Exportar" y "Aplicar plantilla".
 */
export default function ProjectMenu({
  project,
  showSeo,
  isAdmin,
}: {
  project: ProjectSettings
  showSeo: boolean
  isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // Clientes y miembros del equipo solo hacen falta en "Editar ajustes": se
  // piden al abrirlo, no en cada render de la página del proyecto.
  const [editData, setEditData] = useState<{ clients: Client[]; members: WorkspaceMember[] } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [applying, setApplying] = useState(false)
  const [pending, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  const denied = toastNoPermission

  const loadEditData = async () => {
    setLoadError(false)
    try {
      const supabase = createClient()
      const [c, m] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.rpc('workspace_members'),
      ])
      if (c.error || m.error) throw c.error ?? m.error
      setEditData({
        clients: (c.data ?? []) as Client[],
        members: (m.data ?? []) as WorkspaceMember[],
      })
    } catch (err) {
      console.error('ProjectMenu: no se pudieron cargar clientes/equipo', err)
      setLoadError(true)
    }
  }

  // El modal abre al instante; clientes y equipo llegan después (sus
  // selectores muestran "Cargando…" mientras tanto).
  const openEdit = () => {
    setOpen(false)
    if (!isAdmin) return denied()
    setEditing(true)
    if (!editData) void loadEditData()
  }

  const doDelete = () => {
    if (!isAdmin) {
      setOpen(false)
      return denied()
    }
    if (!confirm(`¿Eliminar el proyecto "${project.name}" y todas sus tareas? Esta acción no se puede deshacer.`)) return
    setOpen(false)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', project.id)
      const res = await deleteProject(fd)
      if (!toastIfFailed(res)) router.push('/projects')
    })
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="proj-menu-trigger"
        title="Opciones del proyecto"
        aria-label="Opciones del proyecto"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <svg {...ICON} strokeWidth={2.4}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} minWidth={250}>
        <button
          type="button"
          className="dropdown-item proj-menu-item"
          onClick={openEdit}
        >
          <svg {...ICON}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Editar ajustes del proyecto</span>
        </button>

        {showSeo && (
          <Link
            href={`/projects/${project.id}/seo`}
            className="dropdown-item proj-menu-item"
            onClick={() => setOpen(false)}
          >
            <svg {...ICON}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>Configurar Search Console</span>
          </Link>
        )}

        <button
          type="button"
          className="dropdown-item proj-menu-item"
          onClick={() => {
            setOpen(false)
            setApplying(true)
          }}
        >
          <svg {...ICON}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <span>Plantillas</span>
        </button>

        <div className="ctxmenu-sep" />

        <a
          href={`/api/export/tasks?project=${project.id}`}
          className="dropdown-item proj-menu-item"
          onClick={() => setOpen(false)}
        >
          <svg {...ICON}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span>Exportar tareas</span>
        </a>

        <div className="ctxmenu-sep" />

        <button type="button" className="dropdown-item proj-menu-item danger" onClick={doDelete}>
          <svg {...ICON}>
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
          <span>Eliminar proyecto</span>
        </button>
      </Popover>

      {applying && (
        <ApplyTemplateModal
          projectId={project.id}
          projectType={project.type}
          onClose={() => setApplying(false)}
        />
      )}

      {editing && (
        <ProjectEditModal
          project={project}
          clients={editData?.clients ?? null}
          members={editData?.members ?? null}
          loadError={loadError}
          onRetry={loadEditData}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
