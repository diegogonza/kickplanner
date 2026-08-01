import { STATUSES, type Task } from '@/app/projects/statuses'

export default function Overview({ tasks }: { tasks: Task[] }) {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="kpi">
          <div className="num">{total}</div>
          <div className="lbl">Tareas totales</div>
        </div>
        {STATUSES.map((s) => (
          <div className="kpi" key={s.key}>
            <div className="num">{tasks.filter((t) => t.status === s.key).length}</div>
            <div className="lbl">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: s.color }}
              />
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
            Progreso del proyecto
          </span>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-2)' }}>
            {progress}%
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--panel)', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--brand-600)',
              borderRadius: 999,
            }}
          />
        </div>
      </div>
    </div>
  )
}
