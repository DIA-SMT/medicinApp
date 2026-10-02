import { sha256Hex } from './totp'

/** "BORDON SINHG, ROCIO MICAELA" → "Bordon Sinhg, Rocio Micaela" */
export function normalizarNombre(s: string) {
  return s
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s,'-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase('es-AR'))
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Pérez, Ana Laura" → "Pérez, A." — para pantallas públicas y confirmación de identidad. */
export function nombreCorto(s: string) {
  const [apellido, nombres = ''] = normalizarNombre(s).split(',').map((x) => x.trim())
  const ini = nombres ? ` ${nombres.charAt(0)}.` : ''
  return `${apellido},${ini}`
}

export function iniciales(s: string) {
  const [apellido, nombres = ''] = normalizarNombre(s).split(',').map((x) => x.trim())
  return (nombres.charAt(0) + apellido.charAt(0)).toUpperCase()
}

/** "MD1234567" → "MD12•••67" */
export const libretaOculta = (l: string) => `${l.slice(0, 4)}•••${l.slice(-2)}`

/** Comprobante legible derivado del registro: "A3F2-91C0". */
export async function comprobante(sesionId: string, libreta: string, ts: number) {
  const h = (await sha256Hex(`${sesionId}|${libreta}|${ts}`)).slice(0, 8).toUpperCase()
  return `${h.slice(0, 4)}-${h.slice(4)}`
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function sinTildes(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
