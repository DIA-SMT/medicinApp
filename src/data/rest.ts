// API pública sobre PostgREST con `fetch` puro: sin supabase-js, unos cientos de bytes.
// Es lo único que descarga el celular del alumno además de la página de registro.
import { CRONOGRAMA } from '../lib/cronograma'
import { ventanaDefault, type Ventana } from '../lib/time'
import type { Fallo, PublicoApi, ResultadoIdentificacion, ResultadoMarca, ResultadoPase } from './types'

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

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | Fallo> {
  try {
    const r = await pedir(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
    if (!r.ok) return red(`El servidor respondió ${r.status}. Intentá de nuevo.`)
    return (await r.json()) as T
  } catch {
    return red('Sin conexión. Revisá los datos móviles o el Wi-Fi y volvé a intentar.')
  }
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : null)
const ms = (t: string | null) => (t ? Date.parse(t) : null)

export const restPublico: PublicoApi = {
  async ventanas() {
    type Fila = { id: string; apertura: string; cierre: string; manual_desde: string | null; manual_hasta: string | null; cerrada_en: string | null }
    let filas: Fila[] = []
    try {
      const r = await pedir('/sesiones?select=id,apertura,cierre,manual_desde,manual_hasta,cerrada_en')
      if (r.ok) filas = await r.json()
    } catch {
      /* sin red: se usan los horarios por defecto */
    }
    const porId = new Map(filas.map((f) => [f.id, f]))
    return Object.fromEntries(
      CRONOGRAMA.map((s) => {
        const f = porId.get(s.id)
        const v: Ventana = f
          ? { apertura: hm(f.apertura)!, cierre: hm(f.cierre)!, manualDesde: ms(f.manual_desde), manualHasta: ms(f.manual_hasta), cerradaEn: ms(f.cerrada_en) }
          : ventanaDefault()
        return [s.id, v]
      }),
    )
  },

  abrirPase: (sesionId, codigo) => rpc<ResultadoPase>('abrir_pase', { p_sesion: sesionId, p_codigo: codigo }),

  identificar: (sesionId, pase, dni, huella) =>
    rpc<ResultadoIdentificacion>('identificar', { p_sesion: sesionId, p_pase: pase, p_dni: dni, p_huella: huella }),

  marcar: (p) =>
    rpc<ResultadoMarca>('marcar_presente', {
      p_sesion: p.sesionId, p_pase: p.pase, p_dni: p.dni, p_huella: p.huella, p_public_jwk: p.publicJwk,
      p_firma: p.firma, p_ts: p.ts, p_lat: p.ubicacion?.lat ?? null, p_lng: p.ubicacion?.lng ?? null,
      p_precision: p.ubicacion?.precision ?? null,
    }),
}
