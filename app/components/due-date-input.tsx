'use client'

import { updateDueDate } from '@/app/projects/actions'

// Fecha de entrega con autoguardado (se guarda al cambiar, sin botón)
export default function DueDateInput({
  taskId,
  projectId,
  value,
}: {
  taskId: string
  projectId: string
  value: string | null
}) {
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
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  )
}
