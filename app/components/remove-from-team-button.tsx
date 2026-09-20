'use client'

import { removeProjectFromTeam } from '@/app/teams/actions'
import { toastIfFailed } from '@/app/components/toast'

/** Botón "Quitar del equipo". Cliente para poder mostrar el aviso de permisos. */
export default function RemoveFromTeamButton({ teamId, projectId }: { teamId: string; projectId: string }) {
  return (
    <form action={async (fd) => { toastIfFailed(await removeProjectFromTeam(fd)) }}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="project_id" value={projectId} />
      <button type="submit" className="btn-ghost" title="Quitar del equipo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </form>
  )
}
