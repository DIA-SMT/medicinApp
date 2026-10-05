import { APERTURA_DEFAULT, CIERRE_DEFAULT, TZ_OFFSET } from './config'
import { CRONOGRAMA, type Sesion } from './cronograma'

const TZ = 'America/Argentina/Tucuman'

export interface Ventana {
  apertura: string // HH:MM
  cierre: string // HH:MM
  /** Apertura manual del docente: el registro queda abierto hasta este instante (epoch ms). */
  manualHasta?: number | null
  manualDesde?: number | null
  /** Cierre manual anticipado (epoch ms en que se cerró). */
  cerradaEn?: number | null
  /** Clase suspendida (paro, feriado…): no se toma asistencia y no cuenta para la regularidad. */
  suspendida?: boolean
  motivoSuspension?: string | null
}

export const ventanaDefault = (): Ventana => ({ apertura: APERTURA_DEFAULT, cierre: CIERRE_DEFAULT })

export const instante = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00${TZ_OFFSET}`).getTime()

export type EstadoVentana = 'programada' | 'abierta' | 'cerrada' | 'suspendida'

export interface InfoVentana {
  estado: EstadoVentana
  abre: number
  cierra: number
  manual: boolean
}

export function infoVentana(fecha: string, v: Ventana, now = Date.now()): InfoVentana {
  const abre = instante(fecha, v.apertura)
  const cierra = instante(fecha, v.cierre)
  if (v.suspendida) return { estado: 'suspendida', abre, cierra, manual: false }
  // abrir/cerrar manual son excluyentes: cada acción limpia a la otra.
  if (v.manualHasta && now < v.manualHasta) {
    return { estado: 'abierta', abre: v.manualDesde ?? now, cierra: v.manualHasta, manual: true }
  }
  if (v.cerradaEn && now >= v.cerradaEn) {
    return { estado: 'cerrada', abre, cierra: v.cerradaEn, manual: true }
  }
  if (now < abre) return { estado: 'programada', abre, cierra, manual: false }
  if (now <= cierra) return { estado: 'abierta', abre, cierra, manual: false }
  return { estado: 'cerrada', abre, cierra, manual: false }
}

// ── Formatos (siempre en hora de Tucumán, sin importar la zona del dispositivo) ──

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...o })
const fHora = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fHM = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
const fDia = fmt({ weekday: 'long' })
const fLarga = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const fIso = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })

export const horaArt = (ms: number) => fHora.format(ms)
export const hmArt = (ms: number) => fHM.format(ms)
const mediodia = (fecha: string) => instante(fecha, '12:00')
export const diaSemana = (fecha: string) => cap(fDia.format(mediodia(fecha)))
export const fechaCorta = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
export const fechaLarga = (fecha: string) => cap(fLarga.format(mediodia(fecha)))
export const hoyIso = (now = Date.now()) => {
  const p = fIso.formatToParts(now)
  const g = (t: string) => p.find((x) => x.type === t)!.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "07:42" bajo la hora, "1 h 05 min", o "3 d 14 h" para cuentas largas. */
export function cuenta(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(t / 86400)
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function partesCuenta(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(t / 86400),
    h: Math.floor((t % 86400) / 3600),
    m: Math.floor((t % 3600) / 60),
    s: t % 60,
  }
}

export type EstadoClase = 'dictada' | 'hoy' | 'proxima' | 'futura'

export const suspendida = (ventanas: Record<string, Ventana> | null | undefined, id: string) => !!ventanas?.[id]?.suspendida

/** Las clases del cronograma que no están suspendidas. */
export const clasesVigentes = (ventanas: Record<string, Ventana> | null | undefined) => CRONOGRAMA.filter((s) => !suspendida(ventanas, s.id))

/** Sesión de hoy si existe; si no, la próxima en el calendario (salteando las suspendidas, si se conocen). */
export function sesionActual(now = Date.now(), ventanas?: Record<string, Ventana> | null): Sesion | undefined {
  const hoy = hoyIso(now)
  const lista = clasesVigentes(ventanas)
  return lista.find((s) => s.fecha === hoy) ?? lista.find((s) => s.fecha > hoy)
}

/** Como sesionActual, pero si el registro de hoy ya cerró pasa a la próxima clase. */
export function sesionVigente(ventanas: Record<string, Ventana> | null, now = Date.now()): Sesion | undefined {
  const s = sesionActual(now, ventanas)
  if (!s || s.fecha !== hoyIso(now)) return s
  const cerrada = infoVentana(s.fecha, ventanas?.[s.id] ?? ventanaDefault(), now).estado === 'cerrada'
  return cerrada ? (clasesVigentes(ventanas).find((x) => x.fecha > s.fecha) ?? s) : s
}

export function estadoClase(s: Sesion, now = Date.now(), ventanas?: Record<string, Ventana> | null): EstadoClase {
  const hoy = hoyIso(now)
  if (s.fecha < hoy) return 'dictada'
  if (s.fecha === hoy) return 'hoy'
  const prox = clasesVigentes(ventanas).find((x) => x.fecha > hoy)
  return prox?.id === s.id ? 'proxima' : 'futura'
}
