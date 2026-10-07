// Modo demostración: misma lógica de validación que el backend, pero persistida en localStorage.
// Proyector y celular se sincronizan entre pestañas del mismo navegador (evento `storage`).
import { GEO_MODO, PASE_TTL_S, SEDE, TOTP_PASO_S, TOTP_TOLERANCIA } from '../lib/config'
import { CRONOGRAMA, SESION_ENSAYO, sesionPorId } from '../lib/cronograma'
import { huellaDe, verificar } from '../lib/device'
import { comprobante, libretaOculta, nombreCorto, normalizarNombre } from '../lib/format'
import { haversine } from '../lib/geo'
import { hoyIso, infoVentana, instante, ventanaDefault, type Ventana } from '../lib/time'
import { clavePoster, contador, firmaPase, nuevoSecreto, totp, cryptoDisponible } from '../lib/totp'
import type { AdminApi, Alumno, ConsultaBuzon, Cuenta, DispositivoVinculado, EventoAuditoria, Fallo, Metodo, PedidoCelular, Progreso, PublicoApi, Registro, Solicitud } from './types'

/** Igual que public._progreso en SQL y que la planilla del panel. */
function progresoDe(regs: Registro[], libreta: string, sesionId: string): Progreso {
  const hoy = hoyIso()
  const vigentes = CRONOGRAMA.filter((s) => !ventanaDe(s.id).suspendida)
  const dictadas = vigentes.filter((s) => (s.fecha <= hoy || s.id === sesionId) && regs.some((r) => r.sesionId === s.id))
  return {
    presentes: dictadas.filter((s) => regs.some((r) => r.sesionId === s.id && r.libreta === libreta)).length,
    dictadas: dictadas.length,
    restantes: vigentes.filter((s) => s.fecha >= hoy && !dictadas.includes(s)).length,
  }
}

/** Igual que el trigger public._auditar en SQL. */
function auditar(e: Omit<EventoAuditoria, 'en' | 'por'>) {
  const log = leer<EventoAuditoria[]>(K.auditoria, [])
  log.unshift({ ...e, en: Date.now(), por: 'demo@catedra' })
  escribir(K.auditoria, log.slice(0, 300))
}

const K = {
  auditoria: 'ciclo:v1:auditoria',
  cuentas: 'ciclo:v1:cuentas',
  solicitudes: 'ciclo:v1:solicitudes',
  secretos: 'ciclo:v1:secretos',
  ventanas: 'ciclo:v1:ventanas',
  registros: 'ciclo:v1:registros',
  dispositivos: 'ciclo:v1:dispositivos',
  traspasos: 'ciclo:v1:traspasos',
  pedidosCelular: 'ciclo:v1:pedidos-celular',
  valoraciones: 'ciclo:v1:valoraciones',
  consultas: 'ciclo:v1:consultas',
}

function leer<T>(k: string, def: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : def
  } catch {
    return def
  }
}

const oyentes = new Set<() => void>()
const avisar = () => {
  oyentes.forEach((f) => f())
  window.dispatchEvent(new Event('ciclo:cambio'))
}

function escribir(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* almacenamiento lleno o bloqueado: la demo sigue en memoria */
  }
  avisar()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('ciclo:v1:')) avisar()
  })
}

// El padrón sólo se empaqueta en modo demo (glob vacío si el archivo no existe).
const fuentes: Record<string, () => Promise<{ default: Alumno[] }>> = __DEMO__
  ? import.meta.glob<{ default: Alumno[] }>('../../data/alumnos.json')
  : {}
/** Alumno ficticio para probar el flujo sin usar DNIs reales del padrón. */
export const ALUMNO_DEMO: Alumno = { libreta: 'MD0000001', nombre: 'Demo, Alumna De Prueba', dni: '10000001', folio: '000', orden: 0 }

let padron: Promise<Alumno[]> | null = null
const cargarPadron = () =>
  (padron ??= (fuentes['../../data/alumnos.json']?.() ?? Promise.resolve({ default: [] as Alumno[] })).then((m) =>
    m.default.map((a) => ({ ...a, nombre: normalizarNombre(a.nombre) })),
  ))
/** Padrón + alumno ficticio: para identificar en el check-in, no para estadísticas. */
const padronConDemo = async () => [...(await cargarPadron()), ALUMNO_DEMO]

function secretoDe(sesionId: string) {
  const s = leer<Record<string, string>>(K.secretos, {})
  if (!s[sesionId]) {
    s[sesionId] = nuevoSecreto()
    escribir(K.secretos, s)
  }
  return s[sesionId]
}

const ventanaDe = (id: string): Ventana => ({ ...ventanaDefault(), ...leer<Record<string, Ventana>>(K.ventanas, {})[id] })

const fallo = (error: Fallo['error'], detalle?: string): Fallo => ({ ok: false, error, detalle })

async function validarPase(sesionId: string, pase: string): Promise<Metodo | Fallo> {
  const [cs, m, sig] = pase.split('.')
  const c = Number(cs)
  if (!Number.isFinite(c) || (m !== 'q' && m !== 'p')) return fallo('CODIGO_INVALIDO')
  if (sig !== (await firmaPase(secretoDe(sesionId), sesionId, c, m))) return fallo('CODIGO_INVALIDO')
  if (contador() - c > Math.ceil(PASE_TTL_S / TOTP_PASO_S)) return fallo('PASE_VENCIDO')
  return m === 'q' ? 'qr' : 'poster'
}

const limpiarDni = (d: string) => d.replace(/\D/g, '')

/** Igual que public._vincular en SQL: reemplaza el celular del alumno y limpia traspasos y pedidos. */
function vincularLocal(libreta: string, huella: string, detalle: string, por: string) {
  const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
  if (disp[huella]?.libreta !== libreta) {
    for (const [h, d] of Object.entries(disp)) if (d.libreta === libreta) delete disp[h]
    disp[huella] = { libreta, huella, creadoEn: Date.now() }
    escribir(K.dispositivos, disp)
    const log = leer<EventoAuditoria[]>(K.auditoria, [])
    log.unshift({ accion: 'celular_cambiado', sesionId: null, libreta, detalle, en: Date.now(), por })
    escribir(K.auditoria, log.slice(0, 300))
  }
  const t = leer<Record<string, unknown>>(K.traspasos, {})
  delete t[libreta]
  escribir(K.traspasos, t)
  const p = leer<Record<string, unknown>>(K.pedidosCelular, {})
  delete p[libreta]
  escribir(K.pedidosCelular, p)
}

type PedidoLocal = { huella: string; pedidoEn: number }
type ValoracionLocal = { sesionId: string; libreta: string; puntaje: number; comentario: string | null; en: number }

export function crearLocal(): PublicoApi & AdminApi {
  return {
    modo: 'demo',

    async desfase() {
      return 0
    },

    async ventanas() {
      const guardadas = leer<Record<string, Ventana>>(K.ventanas, {})
      return Object.fromEntries([...CRONOGRAMA, SESION_ENSAYO].map((s) => [s.id, { ...ventanaDefault(), ...guardadas[s.id] }]))
    },

    async abrirPase(sesionId, codigo) {
      if (!cryptoDisponible()) return fallo('SIN_CRYPTO')
      const s = sesionPorId(sesionId)
      if (!s) return fallo('SESION_INEXISTENTE')
      const info = infoVentana(s.fecha, ventanaDe(sesionId))
      if (info.estado === 'suspendida') return fallo('SUSPENDIDA', ventanaDe(sesionId).motivoSuspension ?? undefined)
      if (info.estado === 'programada') return fallo('PROGRAMADA', String(info.abre))
      if (info.estado === 'cerrada') return fallo('CERRADA', String(info.cierra))
      const sec = secretoDe(sesionId)
      const c = contador()
      let m: 'q' | 'p' | null = null
      if (/^\d{6}$/.test(codigo)) {
        for (let d = -TOTP_TOLERANCIA; d <= TOTP_TOLERANCIA && !m; d++) if ((await totp(sec, c + d)) === codigo) m = 'q'
      } else if (codigo.toUpperCase() === (await clavePoster(sec, sesionId))) m = 'p'
      if (!m) return fallo('CODIGO_INVALIDO')
      return {
        ok: true,
        pase: `${c}.${m}.${await firmaPase(sec, sesionId, c, m)}`,
        metodo: m === 'q' ? 'qr' : 'poster',
        expiraEn: (c * TOTP_PASO_S + PASE_TTL_S) * 1000,
      }
    },

    async identificar(sesionId, pase, dni, huella) {
      const v = await validarPase(sesionId, pase)
      if (typeof v !== 'string') return v
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      const ocupado = disp[huella]
      if (ocupado && ocupado.libreta !== a.libreta) return fallo('DISPOSITIVO_OCUPADO')
      const propio = Object.values(disp).find((d) => d.libreta === a.libreta)
      return { ok: true, nombre: nombreCorto(a.nombre), libreta: libretaOculta(a.libreta), vinculo: !propio ? 'libre' : propio.huella === huella ? 'este' : 'otro' }
    },

    async iniciarTraspaso(dni, huella) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      if (leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]?.libreta !== a.libreta) return fallo('DISPOSITIVO_AJENO')
      const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
      const codigo = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => abc[n % abc.length]).join('')
      const vence = Date.now() + 15 * 60e3
      escribir(K.traspasos, { ...leer<Record<string, unknown>>(K.traspasos, {}), [a.libreta]: { codigo, vence } })
      return { ok: true, codigo, vence }
    },

    async completarTraspaso(dni, codigo, huella, publicJwk) {
      if (huella !== (await huellaDe(publicJwk))) return fallo('FIRMA_INVALIDA')
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      const t = leer<Record<string, { codigo: string; vence: number }>>(K.traspasos, {})[a.libreta]
      if (!t || t.vence < Date.now() || t.codigo !== codigo.replace(/[^a-z0-9]/gi, '').toUpperCase()) return fallo('CODIGO_INVALIDO')
      const ocupado = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]
      if (ocupado && ocupado.libreta !== a.libreta) return fallo('DISPOSITIVO_OCUPADO')
      vincularLocal(a.libreta, huella, 'Con el código del celular anterior', 'el alumno')
      return { ok: true, nombre: nombreCorto(a.nombre) }
    },

    async pedirCambio(dni, huella, publicJwk) {
      if (huella !== (await huellaDe(publicJwk))) return fallo('FIRMA_INVALIDA')
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      const propio = Object.values(disp).find((d) => d.libreta === a.libreta)
      if (!propio) return fallo('SIN_VINCULO')
      if (propio.huella === huella) return fallo('YA_VINCULADO')
      if (disp[huella]) return fallo('DISPOSITIVO_OCUPADO')
      escribir(K.pedidosCelular, { ...leer<Record<string, PedidoLocal>>(K.pedidosCelular, {}), [a.libreta]: { huella, pedidoEn: Date.now() } })
      return { ok: true }
    },

    async valorarClase(dni, huella, sesionId, puntaje, comentario) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a || leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]?.libreta !== a.libreta) return fallo('DISPOSITIVO_AJENO')
      const s = sesionPorId(sesionId)
      if (!s || s.ensayo) return fallo('SESION_INEXISTENTE')
      if (!(puntaje >= 1 && puntaje <= 5)) return fallo('NO_VALORABLE', 'El puntaje va de 1 a 5.')
      if (!leer<Registro[]>(K.registros, []).some((r) => r.sesionId === sesionId && r.libreta === a.libreta)) return fallo('NO_VALORABLE', 'Sólo se valoran las clases en las que diste presente.')
      if (infoVentana(s.fecha, ventanaDe(sesionId)).estado !== 'cerrada') return fallo('NO_VALORABLE', 'Vas a poder valorarla cuando termine la clase.')
      const otras = leer<ValoracionLocal[]>(K.valoraciones, []).filter((v) => !(v.sesionId === sesionId && v.libreta === a.libreta))
      escribir(K.valoraciones, [...otras, { sesionId, libreta: a.libreta, puntaje, comentario: comentario?.trim().slice(0, 500) || null, en: Date.now() }])
      return { ok: true }
    },

    async enviarConsulta(dni, huella, texto) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a || leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]?.libreta !== a.libreta) return fallo('DISPOSITIVO_AJENO')
      const t = texto.trim()
      if (t.length < 5 || t.length > 1000) return fallo('CONSULTA_INVALIDA', 'Escribí tu consulta (entre 5 y 1000 caracteres).')
      const todas = leer<ConsultaBuzon[]>(K.consultas, [])
      if (todas.filter((c) => c.libreta === a.libreta && !c.respuesta).length >= 3) return fallo('CONSULTA_INVALIDA', 'Ya tenés varias consultas esperando respuesta. Esperá a que te contesten.')
      escribir(K.consultas, [...todas, { id: Date.now(), libreta: a.libreta, nombre: a.nombre, texto: t, creadaEn: Date.now(), respuesta: null, respondidaEn: null, respondidaPor: null }])
      return { ok: true }
    },

    async misConsultas(dni, huella) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a || leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]?.libreta !== a.libreta) return fallo('DISPOSITIVO_AJENO')
      const consultas = leer<ConsultaBuzon[]>(K.consultas, [])
        .filter((c) => c.libreta === a.libreta)
        .sort((x, y) => y.creadaEn - x.creadaEn)
        .map(({ id, texto, creadaEn, respuesta, respondidaEn }) => ({ id, texto, creadaEn, respuesta, respondidaEn }))
      return { ok: true, consultas }
    },

    async estadoCambio(dni, huella) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      if (leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})[huella]?.libreta === a.libreta) return { ok: true, estado: 'APROBADO' }
      if (leer<Record<string, PedidoLocal>>(K.pedidosCelular, {})[a.libreta]?.huella === huella) return { ok: true, estado: 'PENDIENTE' }
      return { ok: true, estado: 'SIN_PEDIDO' }
    },

    async miAsistencia(dni, huella) {
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(dni))
      if (!a) return fallo('DNI_DESCONOCIDO')
      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      if (disp[huella]?.libreta !== a.libreta) return fallo('DISPOSITIVO_AJENO')
      const regs = leer<Registro[]>(K.registros, [])
      const hoy = hoyIso()
      return {
        ok: true,
        nombre: nombreCorto(a.nombre),
        progreso: progresoDe(regs, a.libreta, ''),
        clases: CRONOGRAMA.map((s) => ({
          id: s.id,
          dictada: !ventanaDe(s.id).suspendida && s.fecha <= hoy && regs.some((r) => r.sesionId === s.id),
          suspendida: !!ventanaDe(s.id).suspendida,
          valorable: regs.some((r) => r.sesionId === s.id && r.libreta === a.libreta) && !ventanaDe(s.id).suspendida && infoVentana(s.fecha, ventanaDe(s.id)).estado === 'cerrada',
          valoracion: leer<ValoracionLocal[]>(K.valoraciones, []).find((v) => v.sesionId === s.id && v.libreta === a.libreta)?.puntaje ?? null,
          marca: regs.find((r) => r.sesionId === s.id && r.libreta === a.libreta)?.metodo ?? null,
        })),
      }
    },

    async marcar(p) {
      const metodo = await validarPase(p.sesionId, p.pase)
      if (typeof metodo !== 'string') return metodo
      if (ventanaDe(p.sesionId).suspendida) return fallo('SUSPENDIDA', ventanaDe(p.sesionId).motivoSuspension ?? undefined)
      const a = (await padronConDemo()).find((x) => x.dni === limpiarDni(p.dni))
      if (!a) return fallo('DNI_DESCONOCIDO')

      // La huella debe corresponder a la clave pública, y la firma a esa clave.
      const huellaReal = await huellaDe(p.publicJwk)
      const firmaOk = await verificar(p.publicJwk, `${p.sesionId}|${p.pase}|${limpiarDni(p.dni)}|${p.ts}`, p.firma)
      if (huellaReal !== p.huella || !firmaOk || Math.abs(Date.now() - p.ts) > 5 * 60e3) return fallo('FIRMA_INVALIDA')

      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      if (disp[p.huella] && disp[p.huella].libreta !== a.libreta) return fallo('DISPOSITIVO_OCUPADO')
      const propio = Object.values(disp).find((d) => d.libreta === a.libreta)
      if (propio && propio.huella !== p.huella) return fallo('DISPOSITIVO_AJENO')

      const distanciaM = p.ubicacion ? Math.round(haversine(p.ubicacion.lat, p.ubicacion.lng, SEDE.lat, SEDE.lng)) : null
      if (GEO_MODO === 'exigir' && (distanciaM === null || distanciaM > SEDE.radioM)) return fallo('FUERA_DE_RANGO', String(distanciaM ?? ''))

      if (!propio) {
        disp[p.huella] = { libreta: a.libreta, huella: p.huella, creadoEn: Date.now() }
        escribir(K.dispositivos, disp)
      }

      const regs = leer<Registro[]>(K.registros, [])
      const previo = regs.find((r) => r.sesionId === p.sesionId && r.libreta === a.libreta)
      if (previo) {
        return { ok: true, estado: 'YA_REGISTRADO', marcadoEn: previo.marcadoEn, nombre: nombreCorto(a.nombre), distanciaM: previo.distanciaM ?? null, progreso: progresoDe(regs, a.libreta, p.sesionId), comprobante: await comprobante(p.sesionId, a.libreta, previo.marcadoEn) }
      }
      const marcadoEn = Date.now()
      regs.push({ sesionId: p.sesionId, libreta: a.libreta, nombre: a.nombre, marcadoEn, metodo, distanciaM, precisionM: p.ubicacion?.precision ?? null, huella: p.huella })
      escribir(K.registros, regs)
      return { ok: true, estado: 'REGISTRADO', marcadoEn, nombre: nombreCorto(a.nombre), distanciaM, progreso: progresoDe(regs, a.libreta, p.sesionId), comprobante: await comprobante(p.sesionId, a.libreta, marcadoEn) }
    },

    async autenticado() {
      return true
    },
    async ingresar() {
      return { ok: true }
    },
    async salir() {},
    async cambiarMiClave() {},

    async secreto(sesionId) {
      return secretoDe(sesionId)
    },

    async guardarVentana(sesionId, v) {
      const todas = leer<Record<string, Ventana>>(K.ventanas, {})
      todas[sesionId] = v
      escribir(K.ventanas, todas)
    },

    async resumen(sesionId) {
      const regs = leer<Registro[]>(K.registros, []).filter((r) => r.sesionId === sesionId)
      regs.sort((a, b) => b.marcadoEn - a.marcadoEn)
      return {
        sesionId,
        presentes: regs.length,
        total: (await cargarPadron()).length,
        ultimos: regs.slice(0, 8).map((r) => ({ nombre: r.nombre, marcadoEn: r.marcadoEn })),
      }
    },

    suscribir(cb) {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },

    alumnos: cargarPadron,

    async registros() {
      return leer<Registro[]>(K.registros, [])
    },

    async marcarManual(sesionId, libretas, motivo) {
      const regs = leer<Registro[]>(K.registros, [])
      const padronPorLibreta = new Map((await padronConDemo()).map((a) => [a.libreta, a]))
      let nuevos = 0
      for (const libreta of libretas) {
        const a = padronPorLibreta.get(libreta)
        if (!a || regs.some((r) => r.sesionId === sesionId && r.libreta === libreta)) continue
        regs.push({ sesionId, libreta, nombre: a.nombre, marcadoEn: Date.now(), metodo: 'manual', motivo, cargadoPor: 'demo@catedra' })
        auditar({ accion: 'presente_manual', sesionId, libreta, detalle: motivo })
        nuevos++
      }
      escribir(K.registros, regs)
      return nuevos
    },

    async quitarPresente(sesionId, libretas) {
      const quitar = new Set(libretas)
      for (const r of leer<Registro[]>(K.registros, [])) if (r.sesionId === sesionId && quitar.has(r.libreta)) auditar({ accion: 'presente_quitado', sesionId, libreta: r.libreta, detalle: r.motivo ?? null })
      escribir(K.registros, leer<Registro[]>(K.registros, []).filter((r) => !(r.sesionId === sesionId && quitar.has(r.libreta))))
    },

    async dispositivos() {
      return Object.values(leer<Record<string, DispositivoVinculado>>(K.dispositivos, {}))
    },

    async liberarDispositivo(libreta) {
      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      for (const [h, d] of Object.entries(disp)) if (d.libreta === libreta) delete disp[h]
      escribir(K.dispositivos, disp)
      auditar({ accion: 'celular_liberado', sesionId: null, libreta, detalle: null })
    },

    async pedidosCelular() {
      const pedidos = leer<Record<string, PedidoLocal>>(K.pedidosCelular, {})
      const padron = await padronConDemo()
      const disp = Object.values(leer<Record<string, DispositivoVinculado>>(K.dispositivos, {}))
      const regs = leer<Registro[]>(K.registros, [])
      return Object.entries(pedidos).map(([libreta, p]): PedidoCelular => {
        const actual = disp.find((d) => d.libreta === libreta)
        const usos = regs.filter((r) => r.libreta === libreta && r.huella === actual?.huella).map((r) => r.marcadoEn)
        return { libreta, nombre: padron.find((a) => a.libreta === libreta)?.nombre ?? libreta, pedidoEn: p.pedidoEn, vinculadoDesde: actual?.creadoEn ?? null, ultimoUso: usos.length ? Math.max(...usos) : null }
      })
    },

    async valoraciones() {
      const porClase: Record<string, ValoracionLocal[]> = {}
      for (const v of leer<ValoracionLocal[]>(K.valoraciones, [])) (porClase[v.sesionId] ??= []).push(v)
      return Object.fromEntries(
        Object.entries(porClase).map(([id, vs]) => [
          id,
          {
            cantidad: vs.length,
            promedio: Math.round((vs.reduce((n, v) => n + v.puntaje, 0) / vs.length) * 100) / 100,
            porPuntaje: [1, 2, 3, 4, 5].map((p) => vs.filter((v) => v.puntaje === p).length),
            comentarios: vs.filter((v) => v.comentario).sort((x, y) => y.en - x.en).map((v) => ({ puntaje: v.puntaje, texto: v.comentario! })),
          },
        ]),
      )
    },

    async consultasBuzon() {
      return leer<ConsultaBuzon[]>(K.consultas, []).sort((x, y) => Number(!!x.respuesta) - Number(!!y.respuesta) || y.creadaEn - x.creadaEn)
    },

    async responderConsulta(id, respuesta) {
      const r = respuesta.trim()
      if (!r) throw new Error('Escribí la respuesta.')
      escribir(K.consultas, leer<ConsultaBuzon[]>(K.consultas, []).map((c) => (c.id === id ? { ...c, respuesta: r.slice(0, 2000), respondidaEn: Date.now(), respondidaPor: 'demo@catedra' } : c)))
    },

    async resolverCambio(libreta, aprobar) {
      const p = leer<Record<string, PedidoLocal>>(K.pedidosCelular, {})[libreta]
      if (!p) throw new Error('Ese pedido ya se resolvió.')
      if (aprobar) vincularLocal(libreta, p.huella, 'Pedido aprobado por la cátedra', 'demo@catedra')
      else {
        const todos = leer<Record<string, PedidoLocal>>(K.pedidosCelular, {})
        delete todos[libreta]
        escribir(K.pedidosCelular, todos)
        auditar({ accion: 'cambio_celular_rechazado', sesionId: null, libreta, detalle: null })
      }
    },

    async terminarEnsayo() {
      const regs = leer<Registro[]>(K.registros, [])
      const quedan = regs.filter((r) => r.sesionId !== 'ensayo')
      escribir(K.registros, quedan)
      const v = leer<Record<string, Ventana>>(K.ventanas, {})
      delete v.ensayo
      escribir(K.ventanas, v)
      return regs.length - quedan.length
    },

    async fallos() {
      return { recientes: {}, total: {} }
    },

    async auditoria() {
      return leer<EventoAuditoria[]>(K.auditoria, [])
    },

    // Modo demo: cuentas de ejemplo guardadas en este navegador.
    async esAdmin() {
      return true
    },
    async cuentas() {
      const cuentas = leer<Cuenta[]>(K.cuentas, [
        { email: 'demo@catedra', rol: 'admin', creada: true, confirmada: true, ultimoIngreso: Date.now(), agregadoEn: null, agregadoPor: null },
        { email: 'ayudante@ejemplo.edu.ar', rol: 'docente', creada: false, confirmada: false, ultimoIngreso: null, agregadoEn: Date.now(), agregadoPor: 'demo@catedra' },
      ])
      const solicitudes = leer<Solicitud[]>(K.solicitudes, [{ email: 'nueva.docente@ejemplo.edu.ar', creadaEn: Date.now() - 3600e3, confirmada: false }])
      return { yo: 'demo@catedra', cuentas, solicitudes }
    },
    async habilitar(email, rol, confirmar = false) {
      const { cuentas, solicitudes } = await this.cuentas()
      const e = email.trim().toLowerCase()
      const pedido = solicitudes.find((x) => x.email === e)
      if (!cuentas.some((c) => c.email === e)) cuentas.push({ email: e, rol, creada: !!pedido, confirmada: !!pedido && (pedido.confirmada || confirmar), ultimoIngreso: null, agregadoEn: Date.now(), agregadoPor: 'demo@catedra' })
      escribir(K.cuentas, cuentas)
      escribir(K.solicitudes, solicitudes.filter((x) => x.email !== e))
      auditar({ accion: 'cuenta_habilitada', sesionId: null, libreta: null, cuenta: e, detalle: rol })
    },
    async quitarCuenta(email) {
      const { cuentas } = await this.cuentas()
      if (email === 'demo@catedra') throw new Error('No podés quitarte el acceso a vos mismo.')
      escribir(K.cuentas, cuentas.filter((c) => c.email !== email))
      auditar({ accion: 'cuenta_quitada', sesionId: null, libreta: null, cuenta: email, detalle: null })
    },
    async cambiarRol(email, rol) {
      const { cuentas } = await this.cuentas()
      escribir(K.cuentas, cuentas.map((c) => (c.email === email ? { ...c, rol } : c)))
      auditar({ accion: 'rol_cambiado', sesionId: null, libreta: null, cuenta: email, detalle: rol })
    },
    async crearCuenta(email, rol) {
      const { cuentas } = await this.cuentas()
      const e = email.trim().toLowerCase()
      if (cuentas.some((c) => c.email === e && c.creada)) throw new Error('Ya existe una cuenta con ese email. Si se olvidó la contraseña, usá «Cambiar contraseña».')
      escribir(K.cuentas, [...cuentas.filter((c) => c.email !== e), { email: e, rol, creada: true, confirmada: true, ultimoIngreso: null, agregadoEn: Date.now(), agregadoPor: 'demo@catedra' }])
      auditar({ accion: 'cuenta_creada', sesionId: null, libreta: null, cuenta: e, detalle: rol })
    },
    async cambiarClave(email) {
      auditar({ accion: 'clave_cambiada', sesionId: null, libreta: null, cuenta: email, detalle: null })
    },
    async suspenderClase(sesionId, motivo) {
      const m = motivo?.trim().slice(0, 200) ?? null
      if (motivo !== null && !m) throw new Error('Escribí el motivo de la suspensión (los alumnos lo van a ver).')
      const todas = leer<Record<string, Ventana>>(K.ventanas, {})
      const v = { ...ventanaDefault(), ...todas[sesionId] }
      if (m) {
        todas[sesionId] = { ...v, suspendida: true, motivoSuspension: m, manualDesde: null, manualHasta: null }
        auditar({ accion: 'clase_suspendida', sesionId, libreta: null, detalle: m })
      } else if (v.suspendida) {
        todas[sesionId] = { ...v, suspendida: false, motivoSuspension: null }
        auditar({ accion: 'clase_reanudada', sesionId, libreta: null, detalle: v.motivoSuspension ?? null })
      }
      escribir(K.ventanas, todas)
    },
    async rechazar(email) {
      const { solicitudes } = await this.cuentas()
      escribir(K.solicitudes, solicitudes.filter((x) => x.email !== email))
      auditar({ accion: 'solicitud_rechazada', sesionId: null, libreta: null, cuenta: email, detalle: null })
    },

    demo: {
      async simularLlegadas(sesionId, cantidad) {
        const presentes = new Set(leer<Registro[]>(K.registros, []).filter((r) => r.sesionId === sesionId).map((r) => r.libreta))
        const libres = (await cargarPadron()).filter((a) => !presentes.has(a.libreta)).sort(() => Math.random() - 0.5)
        for (const a of libres.slice(0, cantidad)) {
          await new Promise((r) => setTimeout(r, 180 + Math.random() * 900))
          const regs = leer<Registro[]>(K.registros, [])
          regs.push({ sesionId, libreta: a.libreta, nombre: a.nombre, marcadoEn: Date.now(), metodo: Math.random() < 0.85 ? 'qr' : 'poster', distanciaM: Math.round(8 + Math.random() * 70), precisionM: Math.round(10 + Math.random() * 30) })
          escribir(K.registros, regs)
        }
      },

      async poblarHistorico() {
        const alumnos = await cargarPadron()
        const hoy = hoyIso()
        const pasadas = CRONOGRAMA.filter((s) => s.fecha < hoy || (s.fecha === hoy && infoVentana(s.fecha, ventanaDe(s.id)).estado === 'cerrada'))
        // Cada alumno tiene una "constancia" propia para que el tablero muestre una distribución creíble.
        const constancia = new Map(alumnos.map((a) => [a.libreta, 0.45 + 0.55 * Math.sqrt(Math.random())]))
        const regs = leer<Registro[]>(K.registros, []).filter((r) => !pasadas.some((s) => s.id === r.sesionId))
        for (const s of pasadas) {
          const base = instante(s.fecha, '07:40')
          for (const a of alumnos) {
            if (Math.random() > constancia.get(a.libreta)!) continue
            const minutos = Math.min(29.5, Math.max(0, 17 + (Math.random() + Math.random() + Math.random() - 1.5) * 12))
            regs.push({ sesionId: s.id, libreta: a.libreta, nombre: a.nombre, marcadoEn: base + Math.round(minutos * 60e3), metodo: Math.random() < 0.8 ? 'qr' : 'poster', distanciaM: Math.round(5 + Math.random() * (Math.random() < 0.04 ? 2400 : 90)), precisionM: Math.round(8 + Math.random() * 35) })
          }
        }
        escribir(K.registros, regs)
      },

      async reiniciar() {
        for (const k of Object.values(K)) localStorage.removeItem(k)
        avisar()
      },
    },
  }
}
