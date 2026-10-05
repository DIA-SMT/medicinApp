import { ArrowLeft, ArrowRight, CalendarOff, Camera, CircleCheck, Clock, Download, ExternalLink, FlaskConical, IdCard, Lock, Maximize, Minimize, MoreHorizontal, Plus, Printer, Square, Stethoscope, TriangleAlert, Unlock, UserPlus, Users, WifiOff, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Marca, SelloUNT } from '../components/Logo'
import { MarcoProgreso, QrCode } from '../components/QrCode'
import { PildoraEstado } from '../components/ui'
import { useAdmin } from '../data/admin'
import type { ResumenSesion } from '../data/types'
import { TOTP_PASO_S } from '../lib/config'
import { CRONOGRAMA, DNIS_ENSAYO, docentesSesion, sesionPorId } from '../lib/cronograma'
import { enlaceRegistro } from '../lib/enlaces'
import { nombreCorto } from '../lib/format'
import { useDesfase, useEnLinea, useNow, useVentanas } from '../lib/hooks'
import { clasesVigentes, cuenta, diaSemana, fechaCorta, hmArt, hoyIso, horaArt, infoVentana, sesionActual, suspendida, ventanaDefault, type Ventana } from '../lib/time'
import { contador, segundosRestantes, totp } from '../lib/totp'

/** Qué significa cada error que ven los alumnos y qué puede hacer el docente. */
const FALLOS: Record<string, [string, string]> = {
  CODIGO_INVALIDO: ['Código vencido', 'Escanean un QR viejo o una foto. Que escaneen el de la pantalla.'],
  PASE_VENCIDO: ['Tardaron más de 3 min', 'Que vuelvan a escanear.'],
  DNI_DESCONOCIDO: ['DNI no encontrado', 'Error al escribirlo o alumno fuera del padrón.'],
  DISPOSITIVO_OCUPADO: ['Celular de otra persona', 'Comparten celular o quisieron dar presente por otro.'],
  DISPOSITIVO_AJENO: ['Cambió de celular', 'Que toque «Pasar mi presente a este celular». Si no tiene el anterior, aprobalo en Panel → Dispositivos.'],
  FIRMA_INVALIDA: ['Hora del celular mal', 'Que pongan fecha y hora automáticas.'],
  PROGRAMADA: ['Escanearon antes de abrir', 'El registro abre a la hora programada.'],
  CERRADA: ['Escanearon con el registro cerrado', 'Si están en clase: «+5 min» o presente manual.'],
}

const PASOS_ALUMNO = [
  { icono: Camera, texto: 'Escaneá el QR con la cámara' },
  { icono: IdCard, texto: 'La primera vez, tu DNI' },
  { icono: CircleCheck, texto: 'Después es automático' },
]

function useWakeLock(activo: boolean) {
  useEffect(() => {
    if (!activo || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const pedir = () => {
      navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    }
    pedir()
    const vis = () => document.visibilityState === 'visible' && pedir()
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('visibilitychange', vis)
      lock?.release().catch(() => {})
    }
  }, [activo])
}

export function Aula() {
  const api = useAdmin()
  const { id } = useParams()
  const navigate = useNavigate()
  // Todo el proyector (QR, ventana, cuentas) corre con la hora del servidor, no con la de la PC del aula.
  const { desfase, medido } = useDesfase()
  const now = useNow(250) + desfase
  const enLinea = useEnLinea()
  const { ventanas, recargar } = useVentanas()
  const sesion = (id && sesionPorId(id)) || sesionActual(now, ventanas) || CRONOGRAMA[CRONOGRAMA.length - 1]
  const ventana = ventanas?.[sesion.id] ?? ventanaDefault()
  const info = infoVentana(sesion.fecha, ventana, now)
  const abierta = info.estado === 'abierta'

  const [secreto, setSecreto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setSecreto(null)
    api.secreto(sesion.id).then(setSecreto).catch((e) => setError(String(e.message ?? e)))
  }, [api, sesion.id])

  // Token vigente: se recalcula al cambiar el contador C = ⌊T/Δt⌋
  const c = contador(now)
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    if (!secreto) return
    let vivo = true
    totp(secreto, c).then((t) => vivo && setToken(t))
    return () => {
      vivo = false
    }
  }, [secreto, c])
  const restante = segundosRestantes(now)
  const url = useMemo(() => (token ? enlaceRegistro(sesion.id, token) : ''), [sesion.id, token])

  // Presentes en vivo
  const [resumen, setResumen] = useState<ResumenSesion | null>(null)
  const [latido, setLatido] = useState(0)
  const previos = useRef(0)
  // Errores que vieron los alumnos en los últimos 10 minutos (sólo el tipo, sin datos personales).
  const [fallos, setFallos] = useState<Record<string, number>>({})
  const cargar = useCallback(() => {
    api
      .resumen(sesion.id)
      .then((r) => {
        if (r.presentes > previos.current && previos.current > 0) setLatido((x) => x + 1)
        previos.current = r.presentes
        setResumen(r)
      })
      .catch(() => {})
    api
      .fallos(sesion.id)
      .then((f) => setFallos(f.recientes))
      .catch(() => {})
  }, [api, sesion.id])
  const [terminando, setTerminando] = useState(false)
  const terminarEnsayo = async () => {
    if (!confirm('¿Terminar el ensayo? Se borran los presentes y avisos de la clase de ensayo y queda cerrada.')) return
    setTerminando(true)
    try {
      await api.terminarEnsayo()
      recargar()
      cargar()
    } finally {
      setTerminando(false)
    }
  }
  useEffect(() => {
    previos.current = 0
    cargar()
    return api.suscribir(cargar)
  }, [api, cargar])

  // Menú «Más» de la barra inferior: se cierra al tocar afuera.
  const mas = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const fuera = (e: PointerEvent) => mas.current?.open && !mas.current.contains(e.target as Node) && mas.current.removeAttribute('open')
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [])

  const [pantalla, setPantalla] = useState(false)
  useEffect(() => {
    const f = () => setPantalla(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  useWakeLock(abierta)

  const guardar = async (cambio: Partial<Ventana>) => {
    await api.guardarVentana(sesion.id, { ...ventana, ...cambio })
    recargar()
  }
  const ahora = () => Date.now() + desfase
  const abrirAhora = (min: number) => guardar({ manualDesde: ahora(), manualHasta: ahora() + min * 60e3, cerradaEn: null })
  const extender = (min: number) => guardar({ manualDesde: info.abre, manualHasta: Math.max(info.cierra, ahora()) + min * 60e3, cerradaEn: null })
  const cerrarAhora = () => confirm('¿Cerrar el registro ahora? Los alumnos ya no van a poder dar presente con el QR.') && guardar({ manualHasta: null, manualDesde: null, cerradaEn: ahora() })
  const pantallaCompleta = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})

  // Atajos para no buscar botones con el mouse en el aula: F pantalla completa, + extiende 5 minutos.
  const atajos = useRef({ abierta, extender, pantallaCompleta })
  atajos.current = { abierta, extender, pantallaCompleta }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input, select, textarea'))) return
      if (e.key === 'f' || e.key === 'F') atajos.current.pantallaCompleta()
      if ((e.key === '+' || e.key === '=') && atajos.current.abierta) atajos.current.extender(5)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const total = resumen?.total ?? 0
  const presentes = resumen?.presentes ?? 0
  const porCerrar = abierta && info.cierra - now < 2 * 60e3
  const siguiente = clasesVigentes(ventanas).find((s) => s.fecha > sesion.fecha)
  const suspendidaAhora = info.estado === 'suspendida'
  const esHoy = sesion.fecha === hoyIso(now)

  // Qué mostrar mientras no hay QR. Un día que no es el de la clase no se ofrece abrirla:
  // los alumnos quedarían presentes en una clase que todavía no se dictó (para probar está el ensayo).
  const vista: { titulo: string; detalle: string; texto: string; boton: string | null; cuenta?: boolean } = sesion.ensayo
    ? { titulo: 'Ensayo listo para empezar', detalle: 'No cuenta para la regularidad', texto: 'Abrilo y probá con celulares reales y los DNIs de prueba.', boton: info.estado === 'abierta' ? null : 'Empezar el ensayo' }
    : info.estado === 'programada'
      ? esHoy
        ? { titulo: `El QR aparece solo a las ${hmArt(info.abre)}`, detalle: cuenta(info.abre - now), cuenta: true, texto: 'No hace falta tocar nada: dejá esta pantalla abierta, mejor en pantalla completa.', boton: 'Mostrar el QR ahora' }
        : { titulo: `Clase del ${diaSemana(sesion.fecha).toLowerCase()} ${fechaCorta(sesion.fecha)}`, detalle: `El QR aparece solo ese día a las ${hmArt(info.abre)}`, texto: 'Para probar antes con celulares, usá el ensayo: no cuenta para la regularidad.', boton: null }
      : { titulo: 'Registro cerrado', detalle: `Cerró a las ${hmArt(info.cierra)}`, texto: 'Si todavía hay alumnos sin registrar, reabrilo unos minutos.', boton: 'Reabrir 10 minutos' }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden lg:min-h-[640px]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea bg-white/80 px-4 py-3 backdrop-blur-xl sm:gap-4 lg:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="no-print grid h-9 w-9 place-items-center rounded-xl border border-linea bg-white text-slate-500 hover:text-tinta" title="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Marca compacta />
          <div className="hidden h-8 w-px bg-linea xl:block" />
          <div className="hidden items-center gap-3 xl:flex">
            <SelloUNT className="h-9 w-auto" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-tinta">Cátedra de Ginecología</div>
              <div className="text-xs text-slate-500">Facultad de Medicina · UNT</div>
            </div>
          </div>
        </div>
        <select value={sesion.id} onChange={(e) => navigate(`/aula/${e.target.value}`)} className="campo !w-auto max-w-[15rem] !py-2 font-mono text-xs" aria-label="Elegir clase">
          <option value="ensayo">Ensayo · no cuenta para la regularidad</option>
          {CRONOGRAMA.map((s) => (
            <option key={s.id} value={s.id}>
              Nº {String(s.n).padStart(2, '0')} · {fechaCorta(s.fecha)} · {suspendida(ventanas, s.id) ? 'SUSPENDIDA' : s.temas[0].titulo.slice(0, 32)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          {!enLinea && (
            <span className="flex items-center gap-1.5 rounded-full border border-rosa/30 bg-rosa-suave px-2.5 py-1 text-xs font-medium text-rosa-oscuro" title="El QR sigue funcionando: los alumnos usan los datos de su celular. Los presentes en vivo se actualizan al volver la conexión.">
              <WifiOff className="h-3.5 w-3.5" /> Sin internet
            </span>
          )}
          {medido && Math.abs(desfase) > 15_000 && (
            <span className="hidden rounded-full border border-ambar/30 bg-ambar-suave px-2.5 py-1 text-xs font-medium text-ambar sm:inline" title="El reloj de esta computadora está desfasado. CICLO usa la hora del servidor, así que el QR funciona igual.">
              Reloj de la PC corregido ({desfase > 0 ? '+' : ''}{Math.round(desfase / 1000)} s)
            </span>
          )}
          <Clock className="h-5 w-5 text-cian" />
          <span className="font-mono text-2xl font-semibold text-tinta tabular-nums lg:text-3xl">{horaArt(now)}</span>
        </div>
      </header>

      {sesion.ensayo && (
        <div className="no-print flex flex-wrap items-center gap-3 border-b border-ambar/30 bg-ambar-suave px-4 py-2.5 text-sm lg:px-8">
          <TriangleAlert className="h-4 w-4 shrink-0 text-ambar" />
          <p className="min-w-0 flex-1 text-slate-700">
            <b className="text-tinta">Ensayo:</b> no cuenta para la regularidad. DNIs de prueba: <span className="font-mono">{DNIS_ENSAYO[0]}</span> a{' '}
            <span className="font-mono">{DNIS_ENSAYO[DNIS_ENSAYO.length - 1]}</span> (no vinculan el celular).
          </p>
          <button className="btn btn-secundario !py-1.5 !text-xs" onClick={terminarEnsayo} disabled={terminando}>
            {terminando ? 'Borrando…' : 'Terminar ensayo y borrar'}
          </button>
        </div>
      )}

      <main className="grid flex-1 gap-6 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[auto_1fr] lg:gap-10 lg:overflow-hidden lg:p-8">
        {/* ── QR ── */}
        <section className="flex flex-col items-center justify-center">
          <div className="relative w-[min(84vw,60vh)] lg:w-[min(66vh,44vw,640px)]">
            {abierta && <MarcoProgreso progreso={restante / TOTP_PASO_S} color={restante < 5 ? '#b3175a' : '#f06ba3'} />}
            <div
              className={`relative aspect-square overflow-hidden rounded-[1.75rem] border border-linea bg-white ${abierta && token ? 'p-[5%] shadow-[0_30px_80px_-30px_rgb(224_36_111/0.45)]' : ''}`}
            >
              {abierta && token ? (
                // Animación CSS (no JS): si el navegador deja de pintar, el QR igual queda nítido.
                <div key={token} className="qr-entrada relative h-full w-full">
                  <QrCode value={url} className="h-full w-full" />
                  <div className="qr-barrido pointer-events-none absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-cian/20 to-transparent" />
                </div>
              ) : (
                <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-50 text-center">
                  <QrCode value="CICLO-GINECOLOGIA-FM-UNT-2026" className="absolute inset-[8%] h-[84%] w-[84%] opacity-[0.06]" />
                  {error ? (
                    <p className="relative px-6 text-sm text-rosa-oscuro">No se pudo obtener la semilla de la sesión: {error}</p>
                  ) : suspendidaAhora ? (
                    <>
                      <div className="relative grid h-20 w-20 place-items-center rounded-full border border-ambar/40 bg-white shadow-sm">
                        <CalendarOff className="h-9 w-9 text-ambar" />
                      </div>
                      <div className="relative font-display text-2xl font-semibold text-tinta">Clase suspendida</div>
                      <div className="relative px-6 text-slate-600">{ventana.motivoSuspension}</div>
                      <p className="no-print relative max-w-xs px-4 text-sm text-slate-500">No se toma asistencia y no cuenta para la regularidad. Para reanudarla: Panel → Por clase.</p>
                      <div className="no-print relative flex flex-wrap justify-center gap-2 px-4">
                        <Link to={`/panel?tab=clase&s=${sesion.id}`} className="btn btn-secundario">
                          Ir al panel
                        </Link>
                        {siguiente && (
                          <Link to={`/aula/${siguiente.id}`} className="btn btn-primario">
                            Próxima: {fechaCorta(siguiente.fecha)} <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative grid h-20 w-20 place-items-center rounded-full border border-linea bg-white shadow-sm">
                        {info.estado === 'programada' ? <Clock className="h-9 w-9 text-cian" /> : <Lock className="h-9 w-9 text-slate-500" />}
                      </div>
                      <div className="relative px-6 font-display text-2xl leading-tight font-semibold text-tinta lg:text-3xl">{vista.titulo}</div>
                      <div className={`relative font-mono ${vista.cuenta ? 'text-4xl font-semibold text-cian-oscuro tabular-nums' : 'text-slate-500'}`}>{vista.detalle}</div>
                      <p className="no-print relative max-w-xs px-4 text-sm text-slate-500">{vista.texto}</p>
                      <div className="no-print relative flex flex-wrap justify-center gap-2 px-4">
                        {vista.boton && (
                          <button className="btn btn-primario !px-5 !py-3 text-base" onClick={() => abrirAhora(10)}>
                            <Unlock className="h-5 w-5" /> {vista.boton}
                          </button>
                        )}
                        {!vista.boton && !sesion.ensayo && (
                          <Link to="/aula/ensayo" className="btn btn-primario">
                            <FlaskConical className="h-4 w-4" /> Hacer un ensayo
                          </Link>
                        )}
                        {info.estado === 'cerrada' && !sesion.ensayo && (
                          <Link to="/panel" className="btn btn-secundario" title="Copia de seguridad de la asistencia">
                            <Download className="h-4 w-4" /> Descargar planilla
                          </Link>
                        )}
                        {info.estado === 'cerrada' && !sesion.ensayo && siguiente && (
                          <Link to={`/aula/${siguiente.id}`} className="btn btn-secundario">
                            Próxima: {fechaCorta(siguiente.fecha)} <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {abierta && token && (
            <div className="mt-6 flex items-center gap-3 sm:gap-5">
              <div className="hidden text-right sm:block">
                <div className="etiqueta">Código manual</div>
                <div className="text-xs text-slate-400">si la cámara no lee el QR</div>
              </div>
              <div className="font-mono text-3xl font-bold tracking-[0.18em] text-tinta tabular-nums sm:text-4xl lg:text-5xl">
                {token.slice(0, 3)}
                <span className="text-slate-300">·</span>
                {token.slice(3)}
              </div>
              <div className="w-16 text-left font-mono text-sm">
                <span className={restante < 5 ? 'text-rosa' : 'text-cian-oscuro'}>{Math.ceil(restante)}s</span>
              </div>
            </div>
          )}
        </section>

        {/* ── Información de la clase ── */}
        <section className="flex min-h-0 flex-col gap-5">
          <div>
            <div className="etiqueta">
              {sesion.ensayo ? 'Prueba del circuito' : `Clase Nº ${String(sesion.n).padStart(2, '0')} · ${diaSemana(sesion.fecha)} ${fechaCorta(sesion.fecha)}`}
            </div>
            <h1 className="mt-2 font-display leading-[1.02] font-bold text-tinta" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 3.6rem)' }}>
              {sesion.temas.map((t) => t.titulo).join(' + ')}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-slate-600">
              <Stethoscope className="h-4 w-4 text-rosa" /> {docentesSesion(sesion)}
            </p>
          </div>

          {/* Estado y presentes en un solo bloque: lo que importa de un vistazo, sin adornos */}
          <div className={`tarjeta hud relative grid grid-cols-2 overflow-hidden transition ${porCerrar ? 'ring-2 ring-ambar/60' : ''}`}>
            {latido > 0 && <div key={latido} className="destello pointer-events-none absolute inset-0 bg-vital/10" />}
            <div className="relative border-r border-linea p-5">
              <PildoraEstado estado={info.estado} />
              <div className="mt-3 font-mono text-[0.7rem] tracking-[0.2em] text-slate-400 uppercase">
                {info.estado === 'programada' ? 'Abre en' : info.estado === 'abierta' ? 'Cierra en' : info.estado === 'suspendida' ? 'Suspendida' : 'Cerró a las'}
              </div>
              <div className={`font-mono font-bold tabular-nums ${info.estado === 'abierta' ? (porCerrar ? 'text-ambar' : 'text-tinta') : 'text-slate-400'}`} style={{ fontSize: 'clamp(2.2rem, 4.2vw, 4.2rem)', lineHeight: 1 }}>
                {info.estado === 'programada' ? cuenta(info.abre - now) : info.estado === 'abierta' ? cuenta(info.cierra - now) : info.estado === 'suspendida' ? '—' : hmArt(info.cierra)}
              </div>
              {porCerrar && (
                <button className="btn btn-secundario no-print mt-3 !border-ambar/50 !py-1.5 !text-sm text-ambar" onClick={() => extender(5)}>
                  <Plus className="h-4 w-4" /> 5 minutos más
                </button>
              )}
            </div>
            <div className="relative p-5">
              <div className="etiqueta flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Presentes
              </div>
              <div className="mt-3 font-display font-bold text-tinta tabular-nums" style={{ fontSize: 'clamp(2.2rem, 4.2vw, 4.2rem)', lineHeight: 1 }}>
                <span key={presentes} className="entrada inline-block">
                  {presentes}
                </span>
                <span className="text-2xl text-slate-300"> / {total}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-vital to-cian transition-[width] duration-700" style={{ width: `${total ? Math.min(100, (presentes / total) * 100) : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Avisos para el docente: qué errores están viendo los alumnos ahora */}
          {Object.keys(fallos).length > 0 && (
            <div className="no-print tarjeta border-ambar/40 p-4">
              <div className="etiqueta flex items-center gap-1.5 !text-ambar">
                <TriangleAlert className="h-3.5 w-3.5" /> Avisos de los alumnos · últimos 10 min
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {Object.entries(fallos)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([codigo, n]) => (
                    <li key={codigo} className="flex items-baseline gap-2">
                      <span className="rounded-md bg-ambar-suave px-1.5 font-mono text-xs font-semibold text-ambar tabular-nums">×{n}</span>
                      <span className="font-medium text-tinta">{FALLOS[codigo]?.[0] ?? codigo}</span>
                      <span className="hidden text-xs text-slate-500 xl:inline">· {FALLOS[codigo]?.[1]}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Lo que leen los alumnos desde el fondo del aula */}
          {abierta && (
            <ol className="grid grid-cols-3 gap-3">
              {PASOS_ALUMNO.map(({ icono: Icono, texto }) => (
                <li key={texto} className="flex items-center gap-3 rounded-2xl border border-linea bg-white px-3 py-3 lg:px-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rosa-suave text-rosa lg:h-11 lg:w-11">
                    <Icono className="h-5 w-5 lg:h-6 lg:w-6" />
                  </span>
                  <span className="text-sm leading-tight font-semibold text-tinta lg:text-base xl:text-lg">{texto}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="tarjeta hud min-h-0 flex-1 overflow-hidden p-5">
            <div className="etiqueta mb-3">Últimos registros</div>
            <ul className="space-y-1.5">
              {(resumen?.ultimos ?? []).slice(0, 6).map((u) => (
                <li key={u.nombre + u.marcadoEn} className="entrada flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2.5 text-tinta">
                    <span className="h-1.5 w-1.5 rounded-full bg-vital shadow-[0_0_0_3px_rgb(14_159_104/0.15)]" />
                    {nombreCorto(u.nombre)}
                  </span>
                  <span className="font-mono text-sm text-slate-400 tabular-nums">{horaArt(u.marcadoEn)}</span>
                </li>
              ))}
              {resumen && resumen.ultimos.length === 0 && <li className="px-3 py-2 text-slate-400">Esperando el primer escaneo…</li>}
            </ul>
          </div>
        </section>
      </main>

      <footer className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-white/80 px-5 py-2.5 backdrop-blur-xl lg:px-8">
        {/* La acción que corresponde a este momento; lo demás, en «Más». */}
        <div className="flex flex-wrap items-center gap-2">
          {abierta ? (
            <>
              <button className="btn btn-secundario !py-2 !text-sm" onClick={() => extender(5)} title="Atajo: tecla +">
                <Plus className="h-4 w-4" /> 5 minutos más
              </button>
              <button className="btn btn-secundario !py-2 !text-sm" onClick={cerrarAhora}>
                <Square className="h-4 w-4 text-rosa" /> Cerrar registro
              </button>
            </>
          ) : (
            !suspendidaAhora &&
            vista.boton && (
              <button className="btn btn-secundario !py-2 !text-sm" onClick={() => abrirAhora(10)}>
                <Unlock className="h-4 w-4 text-vital" /> {vista.boton}
              </button>
            )
          )}
          <span className="hidden text-xs text-slate-400 lg:inline">
            Teclas: <kbd className="rounded border border-linea bg-white px-1.5 font-mono">F</kbd> pantalla completa
            {abierta && (
              <>
                {' '}· <kbd className="rounded border border-linea bg-white px-1.5 font-mono">+</kbd> 5 min
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details ref={mas} className="relative">
            <summary className="btn btn-secundario cursor-pointer list-none !py-2 !text-sm [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-4 w-4" /> Más
            </summary>
            <div className="entrada absolute right-0 bottom-full z-30 mb-2 w-60 rounded-2xl border border-linea bg-white p-1.5 text-sm shadow-xl">
              <Link to={`/panel?tab=manual&s=${sesion.id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
                <UserPlus className="h-4 w-4 text-violeta" /> Presente manual
              </Link>
              <Link to={`/poster/${sesion.id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
                <Printer className="h-4 w-4" /> Póster para imprimir
              </Link>
              {!sesion.ensayo && (
                <Link to="/aula/ensayo" className="flex items-center gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
                  <FlaskConical className="h-4 w-4 text-ambar" /> Hacer un ensayo
                </Link>
              )}
              <Link to="/panel" className="flex items-center gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" /> Volver al panel
              </Link>
              {api.demo && (
                <>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-tinta hover:bg-slate-50 disabled:opacity-50" onClick={() => api.demo!.simularLlegadas(sesion.id, 25)} disabled={!abierta}>
                    <Zap className="h-4 w-4 text-ambar" /> Simular 25 llegadas (demo)
                  </button>
                  {abierta && url && (
                    <a className="flex items-center gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50" href={url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" /> Abrir como alumno (demo)
                    </a>
                  )}
                </>
              )}
            </div>
          </details>
          <button className="btn btn-primario !py-2 !text-sm" onClick={pantallaCompleta} title="Atajo: tecla F">
            {pantalla ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {pantalla ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
        </div>
      </footer>
    </div>
  )
}
