// API de la cátedra sobre Supabase (Auth + PostgREST + Realtime). Se carga bajo demanda.
// Las reglas de asistencia viven en las funciones SQL de supabase/schema.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { restPublico } from './rest'
import type { AdminApi, Alumno, ConsultaBuzon, Cuenta, EventoAuditoria, PedidoCelular, Registro, ResumenSesion, ResumenValoracion, Solicitud } from './types'

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

  // Errores de las funciones de cuentas, en castellano para el panel.
  const MENSAJES: Record<string, string> = {
    EMAIL_INVALIDO: 'Ese email no parece válido.',
    NO_A_VOS_MISMO: 'No podés quitarte el acceso a vos mismo.',
    ULTIMO_ADMIN: 'Tiene que quedar al menos un administrador con cuenta activa.',
    YA_HABILITADA: 'Esa cuenta ya está habilitada: si querés, quitale el acceso.',
    NO_AUTORIZADO: 'Sólo un administrador puede hacer esto.',
    FALTA_MOTIVO: 'Escribí el motivo de la suspensión (los alumnos lo van a ver).',
    SESION_INEXISTENTE: 'Esa clase no existe en el cronograma.',
    PEDIDO_INEXISTENTE: 'Ese pedido ya se resolvió.',
    FALTA_RESPUESTA: 'Escribí la respuesta.',
    CONSULTA_INEXISTENTE: 'Esa consulta ya no existe.',
    DISPOSITIVO_OCUPADO: 'Ese celular ya está vinculado a otro alumno: no se puede aprobar.',
  }
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw new Error(Object.entries(MENSAJES).find(([k]) => error.message.includes(k))?.[1] ?? error.message)
    return data as T
  }

  async function funcionCuentas(cuerpo: Record<string, string>) {
    const { error } = await sb.functions.invoke('admin-cuentas', { body: cuerpo })
    if (!error) return
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error((detalle as { error?: string } | null)?.error ?? 'No se pudo completar. Probá de nuevo.')
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
        return { ok: false, error: 'Correo o contraseña incorrectos. Revisá mayúsculas y que no haya espacios. Si todavía no te crearon la cuenta, pedísela a un administrador de la cátedra.' }
      }
      const { data: ok } = await sb.rpc('es_docente')
      if (ok !== true) {
        await sb.auth.signOut()
        return { ok: false, error: 'Tu cuenta todavía no está aprobada. Pedile a un administrador de la cátedra que la apruebe desde el panel (pestaña «Cuentas»).' }
      }
      return { ok: true }
    },

    async cambiarMiClave(clave) {
      const { error } = await sb.auth.updateUser({ password: clave })
      if (error) throw new Error(/same|different/i.test(error.message) ? 'La nueva contraseña tiene que ser distinta de la actual.' : /weak|short|least/i.test(error.message) ? 'La contraseña es demasiado débil: usá al menos 8 caracteres.' : error.message)
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

    // Los DNIs de prueba del ensayo no son alumnos: no van a la planilla.
    alumnos: async () => (await todas<Alumno & { ficticio: boolean }>('alumnos', 'libreta, nombre, dni, folio, orden, ficticio')).filter((a) => !a.ficticio).map(({ ficticio: _, ...a }) => a),

    async registros() {
      type Fila = {
        sesion_id: string; libreta: string; marcado_en: string; metodo: Registro['metodo']; distancia_m: number | null
        precision_m: number | null; huella: string | null; motivo: string | null; cargado_por: string | null; alumnos: { nombre: string } | null
      }
      // Lo hecho en la clase de ensayo no cuenta: no entra a la planilla ni a los indicadores.
      const filas = (await todas<Fila>('asistencias', 'sesion_id, libreta, marcado_en, metodo, distancia_m, precision_m, huella, motivo, cargado_por, alumnos(nombre)')).filter((f) => f.sesion_id !== 'ensayo')
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

    terminarEnsayo: () => rpc<number>('docente_terminar_ensayo', {}),

    fallos: (sesionId) => rpc<{ recientes: Record<string, number>; total: Record<string, number> }>('docente_fallos', { p_sesion: sesionId }),

    async auditoria() {
      const { data, error } = await sb.from('auditoria').select('en, por, accion, sesion_id, libreta, cuenta, detalle').order('en', { ascending: false }).limit(300)
      if (error) throw new Error(error.message)
      return (data ?? []).map((f): EventoAuditoria => ({ en: Date.parse(f.en), por: f.por, accion: f.accion, sesionId: f.sesion_id, libreta: f.libreta, cuenta: f.cuenta, detalle: f.detalle }))
    },

    async esAdmin() {
      const { data } = await sb.rpc('es_admin')
      return data === true
    },
    cuentas: () => rpc<{ yo: string; cuentas: Cuenta[]; solicitudes: Solicitud[] }>('admin_cuentas', {}),
    habilitar: (email, rol, confirmar = false) => rpc<void>('admin_habilitar', { p_email: email, p_rol: rol, p_confirmar: confirmar }),
    quitarCuenta: (email) => rpc<void>('admin_quitar', { p_email: email }),
    cambiarRol: (email, rol) => rpc<void>('admin_rol', { p_email: email, p_rol: rol }),
    rechazar: (email) => rpc<void>('admin_rechazar', { p_email: email }),
    suspenderClase: (sesionId, motivo) => rpc<void>('admin_suspender', { p_sesion: sesionId, p_motivo: motivo }),
    pedidosCelular: () => rpc<PedidoCelular[]>('docente_pedidos_celular', {}),
    resolverCambio: (libreta, aprobar) => rpc<void>('docente_resolver_cambio', { p_libreta: libreta, p_aprobar: aprobar }),
    async valoraciones() {
      const v = await rpc<Record<string, ResumenValoracion>>('docente_valoraciones', {})
      return Object.fromEntries(Object.entries(v ?? {}).map(([k, x]) => [k, { ...x, promedio: Number(x.promedio) }]))
    },
    consultasBuzon: () => rpc<ConsultaBuzon[]>('docente_consultas', {}),
    responderConsulta: (id, respuesta) => rpc<void>('docente_responder_consulta', { p_id: id, p_respuesta: respuesta }),

    // Crear cuentas y cambiar contraseñas necesita la llave de servicio: lo hace la Edge Function «admin-cuentas»,
    // que primero comprueba con el token de quien llama que sea administrador.
    crearCuenta: (email, rol, clave) => funcionCuentas({ accion: 'crear', email, rol, clave }),
    cambiarClave: (email, clave) => funcionCuentas({ accion: 'clave', email, clave }),
  }
}
