// Portadas predefinidas de los portafolios. La clave se guarda en
// portfolios.cover (la base solo acepta estas, ver migración 024) y el dibujo
// vive en globals.css como `.pf-cover--<clave>`.
export const PORTFOLIO_COVERS = [
  { key: 'bosque', label: 'Bosque' },
  { key: 'noche', label: 'Noche' },
  { key: 'esmeralda', label: 'Esmeralda' },
  { key: 'oxido', label: 'Óxido' },
  { key: 'menta', label: 'Menta' },
  { key: 'carbon', label: 'Carbón' },
] as const

export type PortfolioCover = (typeof PORTFOLIO_COVERS)[number]['key']

export function isCover(v: unknown): v is PortfolioCover {
  return PORTFOLIO_COVERS.some((c) => c.key === v)
}

export const DESCRIPTION_MAX = 280
