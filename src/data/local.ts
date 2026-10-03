// Modo demostración: misma lógica de validación que el backend, pero persistida en localStorage.
// Proyector y celular se sincronizan entre pestañas del mismo navegador (evento `storage`).
import { GEO_MODO, PASE_TTL_S, SEDE, TOTP_PASO_S, TOTP_TOLERANCIA } from '../lib/config'
import { CRONOGRAMA, sesionPorId } from '../lib/cronograma'
import { huellaDe, verificar } from '../lib/device'
import { comprobante, libretaOculta, nombreCorto, normalizarNombre } from '../lib/format'
import { haversine } from '../lib/geo'
import { hoyIso, infoVentana, instante, ventanaDefault, type Ventana } from '../lib/time'
import { clavePoster, contador, firmaPase, nuevoSecreto, totp, cryptoDisponible } from '../lib/totp'
import type { AdminApi, Alumno, DispositivoVinculado, Fallo, Metodo, Progreso, PublicoApi, Registro } from './types'

/** Igual que public._progreso en SQL y que la planilla del panel. */
function progresoDe(regs: Registro[], libreta: string, sesionId: string): Progreso {
  const hoy = hoyIso()
  const dictadas = CRONOGRAMA.filter((s) => (s.fecha <= hoy || s.id === sesionId) && regs.some((r) => r.sesionId === s.id))
  return {
    presentes: dictadas.filter((s) => regs.some((r) => r.sesionId === s.id && r.libreta === libreta)).length,
    dictadas: dictadas.length,
    restantes: CRONOGRAMA.filter((s) => s.fecha >= hoy && !dictadas.includes(s)).length,
  }
}

const K = {
  secretos: 'ciclo:v1:secretos',
  ventanas: 'ciclo:v1:ventanas',
  registros: 'ciclo:v1:registros',
  dispositivos: 'ciclo:v1:dispositivos',
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

export function crearLocal(): PublicoApi & AdminApi {
  return {
    modo: 'demo',

    async ventanas() {
      const guardadas = leer<Record<string, Ventana>>(K.ventanas, {})
      return Object.fromEntries(CRONOGRAMA.map((s) => [s.id, { ...ventanaDefault(), ...guardadas[s.id] }]))
    },

    async abrirPase(sesionId, codigo) {
      if (!cryptoDisponible()) return fallo('SIN_CRYPTO')
      const s = sesionPorId(sesionId)
      if (!s) return fallo('SESION_INEXISTENTE')
      const info = infoVentana(s.fecha, ventanaDe(sesionId))
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

    async marcar(p) {
      const metodo = await validarPase(p.sesionId, p.pase)
      if (typeof metodo !== 'string') return metodo
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
        nuevos++
      }
      escribir(K.registros, regs)
      return nuevos
    },

    async quitarPresente(sesionId, libretas) {
      const quitar = new Set(libretas)
      escribir(K.registros, leer<Registro[]>(K.registros, []).filter((r) => !(r.sesionId === sesionId && quitar.has(r.libreta))))
    },

    async dispositivos() {
      return Object.values(leer<Record<string, DispositivoVinculado>>(K.dispositivos, {}))
    },

    async liberarDispositivo(libreta) {
      const disp = leer<Record<string, DispositivoVinculado>>(K.dispositivos, {})
      for (const [h, d] of Object.entries(disp)) if (d.libreta === libreta) delete disp[h]
      escribir(K.dispositivos, disp)
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
