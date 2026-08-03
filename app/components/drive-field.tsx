'use client'

import { useState } from 'react'
import { setDriveUrl } from '@/app/projects/actions'
import { parseDrive, isDriveUrl, driveLabel } from '@/app/projects/drive'

export default function DriveField({
  taskId,
  projectId,
  value,
}: {
  taskId: string
  projectId: string
  value: string | null
}) {
  const [override, setOverride] = useState<'edit' | null>(null)
  const [url, setUrl] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  const info = value ? parseDrive(value) : null
  const showEdit = override === 'edit' || !value || !info

  if (showEdit) {
    return (
      <div>
        <div className="drive-edithead">
          <img src="/drive-logo.svg" alt="Google Drive" className="drive-logo" />
          <span>Adjuntar un archivo de Google Drive</span>
        </div>
        <form
          action={setDriveUrl}
          className="drive-edit"
          onSubmit={(e) => {
            const v = url.trim()
            if (v && !isDriveUrl(v)) {
              e.preventDefault()
              setError('Pegá un enlace válido de Google Drive o Google Docs.')
            } else {
              setError(null)
              setOverride(null)
            }
          }}
        >
          <input type="hidden" name="id" value={taskId} />
          <input type="hidden" name="project_id" value={projectId} />
          <input
            name="drive_url"
            className="field"
            placeholder="Pega el enlace de Google Drive…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">Guardar</button>
          {value && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setUrl(value)
                setError(null)
                setOverride(null)
              }}
            >
              Cancelar
            </button>
          )}
        </form>
        {error && <p className="drive-err">{error}</p>}
        <p className="drive-hint">
          El archivo debe estar compartido como “cualquiera con el enlace” para ver la vista previa.
        </p>
      </div>
    )
  }

  return (
    <div className="drive-card">
      <div className="drive-head">
        <img src="/drive-logo.svg" alt="Google Drive" className="drive-logo-lg" />

        <a className="drive-meta" href={info.openUrl} target="_blank" rel="noopener noreferrer">
          <span className="drive-name">{driveLabel(info)}</span>
          <span className="drive-link">
            Ver en Google Drive
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </span>
        </a>

        <div className="drive-actions">
          {info.previewUrl && (
            <button
              type="button"
              className={`btn-ghost ${preview ? 'is-on' : ''}`}
              title={preview ? 'Ocultar vista previa' : 'Mostrar vista previa'}
              aria-pressed={preview}
              onClick={() => setPreview((p) => !p)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          <button type="button" className="btn-ghost" title="Editar enlace" onClick={() => setOverride('edit')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
          <form action={setDriveUrl}>
            <input type="hidden" name="id" value={taskId} />
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="drive_url" value="" />
            <button type="submit" className="btn-ghost" title="Quitar archivo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {preview && info.previewUrl && (
        <iframe
          className="drive-frame"
          src={info.previewUrl}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title="Vista previa de Drive"
          loading="lazy"
        />
      )}
    </div>
  )
}
