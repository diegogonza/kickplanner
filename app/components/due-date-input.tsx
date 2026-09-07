'use client'

import { updateDueDate } from '@/app/projects/actions'

/**
 * Fecha de entrega con autoguardado.
 * - Sin `onChange`: persiste sola, con la server action (vista Lista, Mis tareas).
 * - Con `onChange`: delega en el padre (el modal maneja su propio estado).
 */
export default function DueDateInput({
  taskId,
  projectId,
  value,
  onChange,
}: {
  taskId: string
  projectId: string
  value: string | null
  onChange?: (value: string | null) => void
}) {
  if (onChange) {
    return (
      <input
        type="date"
        value={value ?? ''}
        className="field"
        style={{ maxWidth: 180 }}
        aria-label="Fecha de entrega"
        onChange={(e) => onChange(e.target.value || null)}
      />
    )
  }

  return (
    <form action={updateDueDate}>
      <input type="hidden" name="id" value={taskId} />
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="date"
        name="due_date"
        defaultValue={value ?? ''}
        className="field"
        style={{ maxWidth: 180 }}
        aria-label="Fecha de entrega"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  )
}
