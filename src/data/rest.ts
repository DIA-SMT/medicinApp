// API pública sobre PostgREST con `fetch` puro: sin supabase-js, unos cientos de bytes.
// Es lo único que descarga el celular del alumno además de la página de registro.
import { CRONOGRAMA } from '../lib/cronograma'
import { ventanaDefault, type Ventana } from '../lib/time'
import type { Fallo, PublicoApi, ResultadoIdentificacion, ResultadoMarca, ResultadoMiAsistencia, ResultadoPase } from './types'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1`
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const red = (detalle?: string): Fallo => ({ ok: false, error: 'RED', detalle })

async function pedir(ruta: string, init?: RequestInit) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15_000)
  try {
    return await fetch(`${BASE}${ruta}`, { ...init, headers: HEADERS, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Todas las funciones del alumno son idempotentes (reintentar nunca duplica un presente), así que ante un
 * corte de red o un servidor saturado (5xx, 429) se reintenta sola dos veces, con espera creciente y al azar
 * para que 195 celulares no reintenten todos en el mismo instante.
 */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | Fallo> {
  let ultimo: Fallo = red('Sin conexión. Revisá los datos móviles o el Wi-Fi y volvé a intentar.')
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await esperar(intento * 700 + Math.random() * 600)
    try {
      const r = await pedir(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
      if (r.ok) return (await r.json()) as T
      ultimo = red(`El servidor respondió ${r.status}. Intentá de nuevo.`)
      if (r.status < 500 && r.status !== 429) return ultimo
    } catch {
      /* sin red o timeout: se reintenta */
    }
  }
  return ultimo
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : null)
const ms = (t: string | null) => (t ? Date.parse(t) : null)

export const restPublico: PublicoApi = {
  async desfase() {
    // Se toma la mejor de tres mediciones (la de menor ida y vuelta) y se compensa la mitad del viaje.
    let mejor: { rtt: number; d: number } | null = null
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const r = await pedir('/rpc/hora_servidor', { method: 'POST', body: '{}' })
      const t1 = Date.now()
      if (!r.ok) throw new Error(`hora_servidor ${r.status}`)
      const servidor = Number(await r.json())
      const m = { rtt: t1 - t0, d: servidor - (t0 + (t1 - t0) / 2) }
      if (!mejor || m.rtt < mejor.rtt) mejor = m
    }
    return Math.round(mejor!.d)
  },

  async ventanas() {
    type Fila = { id: string; apertura: string; cierre: string; manual_desde: string | null; manual_hasta: string | null; cerrada_en: string | null; suspendida?: boolean; motivo_suspension?: string | null }
    let filas: Fila[] = []
    try {
      const r = await pedir('/sesiones?select=id,apertura,cierre,manual_desde,manual_hasta,cerrada_en,suspendida,motivo_suspension')
      if (r.ok) filas = await r.json()
    } catch {
      /* sin red: se usan los horarios por defecto */
    }
    const porId = new Map(filas.map((f) => [f.id, f]))
    return Object.fromEntries(
      CRONOGRAMA.map((s) => {
        const f = porId.get(s.id)
        const v: Ventana = f
          ? { apertura: hm(f.apertura)!, cierre: hm(f.cierre)!, manualDesde: ms(f.manual_desde), manualHasta: ms(f.manual_hasta), cerradaEn: ms(f.cerrada_en), suspendida: !!f.suspendida, motivoSuspension: f.motivo_suspension ?? null }
          : ventanaDefault()
        return [s.id, v]
      }),
    )
  },

  abrirPase: (sesionId, codigo) => rpc<ResultadoPase>('abrir_pase', { p_sesion: sesionId, p_codigo: codigo }),

  identificar: (sesionId, pase, dni, huella) =>
    rpc<ResultadoIdentificacion>('identificar', { p_sesion: sesionId, p_pase: pase, p_dni: dni, p_huella: huella }),

  miAsistencia: (dni, huella) => rpc<ResultadoMiAsistencia>('mi_asistencia', { p_dni: dni, p_huella: huella }),

  iniciarTraspaso: (dni, huella) => rpc('iniciar_traspaso', { p_dni: dni, p_huella: huella }),
  completarTraspaso: (dni, codigo, huella, publicJwk) =>
    rpc('completar_traspaso', { p_dni: dni, p_codigo: codigo, p_huella: huella, p_public_jwk: publicJwk }),
  pedirCambio: (dni, huella, publicJwk) => rpc('pedir_cambio_celular', { p_dni: dni, p_huella: huella, p_public_jwk: publicJwk }),
  estadoCambio: (dni, huella) => rpc('estado_cambio_celular', { p_dni: dni, p_huella: huella }),

  marcar: (p) =>
    rpc<ResultadoMarca>('marcar_presente', {
      p_sesion: p.sesionId, p_pase: p.pase, p_dni: p.dni, p_huella: p.huella, p_public_jwk: p.publicJwk,
      p_firma: p.firma, p_ts: p.ts, p_lat: p.ubicacion?.lat ?? null, p_lng: p.ubicacion?.lng ?? null,
      p_precision: p.ubicacion?.precision ?? null,
    }),
}
