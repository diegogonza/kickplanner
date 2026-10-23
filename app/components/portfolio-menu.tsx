'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Popover from '@/app/components/popover'
import PortfolioFormFields from '@/app/components/portfolio-form-fields'
import { AddFieldModal } from '@/app/components/add-field-button'
import { confirmDialog } from '@/app/components/confirm-dialog'
import { toast, toastIfFailed, toastNoPermission } from '@/app/components/toast'
import { deletePortfolio, updatePortfolio } from '@/app/portfolios/actions'
import type { PortfolioCover } from '@/app/portfolios/covers'

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

export type MenuPortfolio = {
  id: string
  name: string
  description: string | null
  cover: PortfolioCover
  projectCount: number
}

/**
 * Menú ⋮ de un portafolio: abrir, editar (nombre, descripción, portada) y
 * eliminar con confirmación. `canManage` = dueño o admin; si no, las opciones
 * se ven igual y avisan "sin permisos" (regla de roles del 2026-09-19).
 *
 * `placement="card"`: la píldora blanca encajada en la tarjeta.
 * `placement="header"`: botón en la barra oscura de /portfolios/[id].
 */
export default function PortfolioMenu({
  portfolio,
  canManage,
  placement = 'card',
}: {
  portfolio: MenuPortfolio
  canManage: boolean
  placement?: 'card' | 'header'
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingField, setAddingField] = useState(false)
  const [pending, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  const openEdit = () => {
    setOpen(false)
    if (!canManage) return toastNoPermission()
    setEditing(true)
  }

  const openAddField = () => {
    setOpen(false)
    if (!canManage) return toastNoPermission()
    setAddingField(true)
  }

  const doDelete = async () => {
    setOpen(false)
    if (!canManage) return toastNoPermission()
    const n = portfolio.projectCount
    const ok = await confirmDialog({
      title: `¿Eliminar "${portfolio.name}"?`,
      body:
        n > 0
          ? `Se quita la agrupación y sus campos personalizados. Los ${n} proyectos siguen intactos en Proyectos.`
          : 'Se elimina el portafolio y sus campos personalizados.',
      confirmLabel: 'Eliminar portafolio',
      tone: 'alert',
    })
    if (!ok) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', portfolio.id)
      const res = await deletePortfolio(fd)
      if (toastIfFailed(res)) return
      toast('Portafolio eliminado')
      if (placement === 'header') router.push('/portfolios')
      else router.refresh()
    })
  }

  const onSave = (fd: FormData) => {
    fd.set('id', portfolio.id)
    startTransition(async () => {
      const res = await updatePortfolio(fd)
      if (toastIfFailed(res)) return
      setEditing(false)
      router.refresh()
    })
  }

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={placement === 'card' ? 'pf-menu' : 'btn btn-outline pf-menu-header'}
        aria-label={`Opciones del portafolio ${portfolio.name}`}
        title="Opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} align="right" minWidth={220}>
        {placement === 'card' && (
          <Link href={`/portfolios/${portfolio.id}`} className="dropdown-item proj-menu-item" onClick={() => setOpen(false)}>
            <svg {...ICON}>
              <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            <span>Abrir portafolio</span>
          </Link>
        )}
        <button type="button" className="dropdown-item proj-menu-item" onClick={openEdit}>
          <svg {...ICON}>
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          <span>Editar nombre y portada</span>
        </button>
        {placement === 'header' && (
          <button type="button" className="dropdown-item proj-menu-item" onClick={openAddField}>
            <svg {...ICON}>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16M18.5 10v4M16.5 12h4" />
            </svg>
            <span>Agregar campo personalizado</span>
          </button>
        )}
        <div className="ctxmenu-sep" />
        <button type="button" className="dropdown-item proj-menu-item danger" onClick={doDelete}>
          <svg {...ICON}>
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
          <span>Eliminar portafolio</span>
        </button>
      </Popover>

      {addingField && <AddFieldModal portfolioId={portfolio.id} onClose={() => setAddingField(false)} />}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pf-edit-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pf-edit-title">Editar portafolio</h2>
            <p className="modal-sub">Cambia cómo se ve en la lista de portafolios.</p>
            <form action={onSave}>
              <PortfolioFormFields name={portfolio.name} description={portfolio.description} cover={portfolio.cover} />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
