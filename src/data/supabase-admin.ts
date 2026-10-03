// API de la cátedra sobre Supabase (Auth + PostgREST + Realtime). Se carga bajo demanda.
// Las reglas de asistencia viven en las funciones SQL de supabase/schema.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { restPublico } from './rest'
import type { AdminApi, Alumno, EventoAuditoria, Registro, ResumenSesion } from './types'

const iso = (n: number | null | undefined) => (n ? new Date(n).toISOString() : null)

/**
 * La sesión de la cátedra se guarda en sessionStorage (se borra al cerrar el navegador) salvo que se marque
 * «Recordarme en esta computadora»: la PC del aula es compartida y el panel muestra los DNI del padrón.
 */
const CLAVE_RECORDAR = 'ciclo:recordar'
const recordar = () => {
  try {
    return localStorage.getItem(CLAVE_RECORDAR) === '1'
  } catch {
    return false
  }
}
const almacen = () => (recordar() ? localStorage : sessionStorage)
const almacenamiento = {
  getItem: (k: string) => almacen().getItem(k),
  setItem: (k: string, v: string) => almacen().setItem(k, v),
  removeItem: (k: string) => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  },
}

export function crearSupabaseAdmin(): AdminApi {
  const sb: SupabaseClient = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
    auth: { storage: almacenamiento, persistSession: true },
  })

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw new Error(error.message)
    return data as T
  }

  async function todas<T>(tabla: string, columnas: string): Promise<T[]> {
    const out: T[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from(tabla).select(columnas).range(desde, desde + 999)
      if (error) throw new Error(error.message)
      out.push(...((data ?? []) as T[]))
      if (!data || data.length < 1000) return out
    }
  }

  return {
    modo: 'supabase',

    async autenticado() {
      const { data } = await sb.auth.getSession()
      if (!data.session) return false
      const { data: ok } = await sb.rpc('es_docente')
      return ok === true
    },

    async ingresar(email, clave, recordarme = false) {
      try {
        localStorage.setItem(CLAVE_RECORDAR, recordarme ? '1' : '0')
      } catch {
        /* sin almacenamiento: queda en sessionStorage */
      }
      const { error } = await sb.auth.signInWithPassword({ email, password: clave })
      if (error) {
        if (/confirm/i.test(error.message)) return { ok: false, error: 'La cuenta todavía no está confirmada. Pedile al administrador que la confirme.' }
        if (/fetch|network/i.test(error.message)) return { ok: false, error: 'Sin conexión. Revisá internet y probá de nuevo.' }
        return { ok: false, error: 'Correo o contraseña incorrectos. Revisá mayúsculas y que no haya espacios.' }
      }
      const { data: ok } = await sb.rpc('es_docente')
      if (ok !== true) {
        await sb.auth.signOut()
        return { ok: false, error: 'Esta cuenta existe pero no está habilitada para la cátedra. Pedile al administrador que la habilite.' }
      }
      return { ok: true }
    },

    async salir() {
      await sb.auth.signOut()
    },

    ventanas: restPublico.ventanas,

    secreto: (sesionId) => rpc<string>('docente_secreto', { p_sesion: sesionId }),

    async guardarVentana(sesionId, v) {
      const { error } = await sb
        .from('sesiones')
        .update({ apertura: v.apertura, cierre: v.cierre, manual_desde: iso(v.manualDesde), manual_hasta: iso(v.manualHasta), cerrada_en: iso(v.cerradaEn) })
        .eq('id', sesionId)
      if (error) throw new Error(error.message)
    },

    async resumen(sesionId) {
      const r = await rpc<Omit<ResumenSesion, 'sesionId'>>('docente_resumen', { p_sesion: sesionId })
      return { sesionId, ...r }
    },

    suscribir(cb) {
      const canal = sb
        .channel(`asistencias-${crypto.randomUUID?.() ?? Math.random()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias' }, () => cb())
        .subscribe()
      // Respaldo por si el WebSocket de Realtime queda bloqueado por la red del aula.
      const t = setInterval(cb, 5000)
      return () => {
        clearInterval(t)
        sb.removeChannel(canal)
      }
    },

    alumnos: () => todas<Alumno>('alumnos', 'libreta, nombre, dni, folio, orden'),

    async registros() {
      type Fila = {
        sesion_id: string; libreta: string; marcado_en: string; metodo: Registro['metodo']; distancia_m: number | null
        precision_m: number | null; huella: string | null; motivo: string | null; cargado_por: string | null; alumnos: { nombre: string } | null
      }
      const filas = await todas<Fila>('asistencias', 'sesion_id, libreta, marcado_en, metodo, distancia_m, precision_m, huella, motivo, cargado_por, alumnos(nombre)')
      return filas.map((f) => ({
        sesionId: f.sesion_id, libreta: f.libreta, nombre: f.alumnos?.nombre ?? f.libreta, marcadoEn: Date.parse(f.marcado_en),
        metodo: f.metodo, distanciaM: f.distancia_m, precisionM: f.precision_m, huella: f.huella, motivo: f.motivo, cargadoPor: f.cargado_por,
      }))
    },

    async marcarManual(sesionId, libretas, motivo) {
      if (!libretas.length) return 0
      const { data, error } = await sb
        .from('asistencias')
        .upsert(libretas.map((libreta) => ({ sesion_id: sesionId, libreta, metodo: 'manual', motivo })), { onConflict: 'sesion_id,libreta', ignoreDuplicates: true })
        .select('libreta')
      if (error) throw new Error(error.message)
      return data?.length ?? 0
    },

    async quitarPresente(sesionId, libretas) {
      const { error } = await sb.from('asistencias').delete().eq('sesion_id', sesionId).in('libreta', libretas)
      if (error) throw new Error(error.message)
    },

    async dispositivos() {
      const filas = await todas<{ libreta: string; huella: string; creado_en: string }>('dispositivos', 'libreta, huella, creado_en')
      return filas.map((f) => ({ libreta: f.libreta, huella: f.huella, creadoEn: Date.parse(f.creado_en) }))
    },

    async liberarDispositivo(libreta) {
      const { error } = await sb.from('dispositivos').delete().eq('libreta', libreta)
      if (error) throw new Error(error.message)
    },

    async auditoria() {
      const { data, error } = await sb.from('auditoria').select('en, por, accion, sesion_id, libreta, detalle').order('en', { ascending: false }).limit(300)
      if (error) throw new Error(error.message)
      return (data ?? []).map((f): EventoAuditoria => ({ en: Date.parse(f.en), por: f.por, accion: f.accion, sesionId: f.sesion_id, libreta: f.libreta, detalle: f.detalle }))
    },
  }
}
