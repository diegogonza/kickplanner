// Utilidades para enlaces de Google Drive / Google Docs.
// Solo se permiten estos dominios (evita incrustar contenido arbitrario).

export type DriveInfo = {
  kind: 'document' | 'spreadsheets' | 'presentation' | 'forms' | 'file' | 'other'
  openUrl: string
  previewUrl: string | null
}

const DOC_LABELS: Record<DriveInfo['kind'], string> = {
  document: 'Documento de Google',
  spreadsheets: 'Hoja de cálculo de Google',
  presentation: 'Presentación de Google',
  forms: 'Formulario de Google',
  file: 'Archivo de Drive',
  other: 'Enlace de Drive',
}

export function parseDrive(url: string): DriveInfo | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null

  const path = u.pathname

  const doc = path.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([^/]+)/)
  if (doc) {
    const kind = doc[1] as DriveInfo['kind']
    const id = doc[2]
    return { kind, openUrl: url, previewUrl: `https://docs.google.com/${doc[1]}/d/${id}/preview` }
  }

  const file = path.match(/^\/file\/d\/([^/]+)/)
  if (file) {
    return { kind: 'file', openUrl: url, previewUrl: `https://drive.google.com/file/d/${file[1]}/preview` }
  }

  const openId = u.searchParams.get('id')
  if ((path.startsWith('/open') || path.startsWith('/uc')) && openId) {
    return { kind: 'file', openUrl: url, previewUrl: `https://drive.google.com/file/d/${openId}/preview` }
  }

  // Carpetas u otros enlaces de Drive: se puede abrir, pero no incrustar vista previa
  return { kind: 'other', openUrl: url, previewUrl: null }
}

export function isDriveUrl(url: string): boolean {
  return parseDrive(url) !== null
}

export function driveLabel(info: DriveInfo): string {
  return DOC_LABELS[info.kind]
}
