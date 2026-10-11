import { ORIGEN_ALUMNOS } from './config'

/** En producción, siempre el dominio de los alumnos (ver ORIGEN_ALUMNOS); en desarrollo, el local. */
export function origenAlumnos() {
  const h = location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost') ? location.origin : ORIGEN_ALUMNOS
}

/** Para mostrar: «medicinapp.vercel.app». */
export const hostAlumnos = () => new URL(origenAlumnos()).host

/**
 * URL que codifica el QR. Apunta a /p/, una página mínima sin React: carga en pocos KB
 * aunque 195 alumnos escaneen a la vez con datos móviles.
 */
export function enlaceRegistro(sesionId: string, codigo: string) {
  return `${origenAlumnos()}/p/?s=${sesionId}&c=${codigo}`
}
