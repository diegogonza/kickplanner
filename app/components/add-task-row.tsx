import { createTask } from '@/app/projects/actions'
import type { Status } from '@/app/projects/statuses'

// Fila inline para añadir una tarea (se escribe y se presiona Enter)
export default function AddTaskRow({
  projectId,
  status,
}: {
  projectId: string
  status: Status
}) {
  return (
    <form action={createTask} className="add-row">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="status" value={status} />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <input name="title" placeholder="Añadir tarea…" autoComplete="off" />
    </form>
  )
}
