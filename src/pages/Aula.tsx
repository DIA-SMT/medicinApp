import { ArrowLeft, Clock, ExternalLink, Lock, Maximize, Minimize, Plus, Printer, Square, Stethoscope, Unlock, UserPlus, Users, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EcgLine } from '../components/EcgLine'
import { Marca, SelloUNT } from '../components/Logo'
import { MarcoProgreso, QrCode } from '../components/QrCode'
import { ChipArea, PildoraEstado } from '../components/ui'
import { useAdmin } from '../data/admin'
import type { ResumenSesion } from '../data/types'
import { TOTP_PASO_S, TOTP_TOLERANCIA } from '../lib/config'
import { CRONOGRAMA, docentesSesion, sesionPorId } from '../lib/cronograma'
import { enlaceRegistro } from '../lib/enlaces'
import { nombreCorto, pct } from '../lib/format'
import { useNow, useVentanas } from '../lib/hooks'
import { cuenta, diaSemana, fechaCorta, hmArt, horaArt, infoVentana, sesionActual, ventanaDefault, type Ventana } from '../lib/time'
import { contador, segundosRestantes, totp } from '../lib/totp'

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

function Medidor({ valor, total }: { valor: number; total: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const f = total ? Math.min(1, valor / total) : 0
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
      <defs>
        <linearGradient id="medidor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0e9f68" />
          <stop offset="1" stopColor="#0aa2c0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#eef1f6" strokeWidth="9" />
      {Array.from({ length: 40 }, (_, i) => (
        <line key={i} x1="60" y1="2" x2="60" y2="5" stroke="#cbd5e1" strokeWidth="0.8" transform={`rotate(${i * 9} 60 60)`} />
      ))}
      <circle
        cx="60" cy="60" r={r} fill="none" stroke="url(#medidor)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c}
        style={{ strokeDashoffset: c * (1 - f), transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
    </svg>
  )
}

export function Aula() {
  const api = useAdmin()
  const { id } = useParams()
  const navigate = useNavigate()
  const now = useNow(250)
  const sesion = (id && sesionPorId(id)) || sesionActual(now) || CRONOGRAMA[CRONOGRAMA.length - 1]
  const { ventanas, recargar } = useVentanas()
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
  const cargar = useCallback(() => {
    api
      .resumen(sesion.id)
      .then((r) => {
        if (r.presentes > previos.current && previos.current > 0) setLatido((x) => x + 1)
        previos.current = r.presentes
        setResumen(r)
      })
      .catch(() => {})
  }, [api, sesion.id])
  useEffect(() => {
    previos.current = 0
    cargar()
    return api.suscribir(cargar)
  }, [api, cargar])

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
  const abrirAhora = (min: number) => guardar({ manualDesde: Date.now(), manualHasta: Date.now() + min * 60e3, cerradaEn: null })
  const extender = (min: number) => guardar({ manualDesde: info.abre, manualHasta: Math.max(info.cierra, Date.now()) + min * 60e3, cerradaEn: null })
  const cerrarAhora = () => guardar({ manualHasta: null, manualDesde: null, cerradaEn: Date.now() })

  const total = resumen?.total ?? 0
  const presentes = resumen?.presentes ?? 0
  const progresoVentana = Math.min(1, Math.max(0, (now - info.abre) / (info.cierra - info.abre)))

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
          {CRONOGRAMA.map((s) => (
            <option key={s.id} value={s.id}>
              Nº {String(s.n).padStart(2, '0')} · {fechaCorta(s.fecha)} · {s.temas[0].titulo.slice(0, 32)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-cian" />
          <span className="font-mono text-2xl font-semibold text-tinta tabular-nums lg:text-3xl">{horaArt(now)}</span>
        </div>
      </header>

      <main className="grid flex-1 gap-6 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[auto_1fr] lg:gap-10 lg:overflow-hidden lg:p-8">
        {/* ── QR ── */}
        <section className="flex flex-col items-center justify-center">
          <div className="relative w-[min(84vw,60vh)] lg:w-[min(66vh,44vw,640px)]">
            {abierta && <MarcoProgreso progreso={restante / TOTP_PASO_S} color={restante < 5 ? '#e0246f' : '#0aa2c0'} />}
            <div
              className={`relative aspect-square overflow-hidden rounded-[1.75rem] border border-linea bg-white ${abierta && token ? 'p-[5%] shadow-[0_30px_80px_-30px_rgb(10_162_192/0.55)]' : ''}`}
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
                  ) : (
                    <>
                      <div className="relative grid h-20 w-20 place-items-center rounded-full border border-linea bg-white shadow-sm">
                        <Lock className="h-9 w-9 text-slate-500" />
                      </div>
                      <div className="relative font-display text-2xl font-semibold text-tinta">{info.estado === 'programada' ? 'Registro programado' : 'Registro cerrado'}</div>
                      <div className="relative font-mono text-slate-500">
                        {info.estado === 'programada' ? `Abre ${hmArt(info.abre)} · en ${cuenta(info.abre - now)}` : `Cerró a las ${hmArt(info.cierra)}`}
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
              Clase Nº {String(sesion.n).padStart(2, '0')} · {diaSemana(sesion.fecha)} {fechaCorta(sesion.fecha)}
            </div>
            <h1 className="mt-2 font-display leading-[1.02] font-bold text-tinta" style={{ fontSize: 'clamp(1.8rem, 3.4vw, 3.6rem)' }}>
              {sesion.temas.map((t) => t.titulo).join(' + ')}
            </h1>
            {sesion.temas.some((t) => t.detalle) && <p className="mt-2 text-slate-500 lg:text-lg">{sesion.temas.map((t) => t.detalle).filter(Boolean).join(' · ')}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-slate-700">
                <Stethoscope className="h-4 w-4 text-rosa" /> {docentesSesion(sesion)}
              </span>
              {[...new Set(sesion.temas.map((t) => t.area))].map((a) => (
                <ChipArea key={a} area={a} />
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="tarjeta hud p-5">
              <div className="flex items-center justify-between">
                <PildoraEstado estado={info.estado} />
                {info.manual && <span className="font-mono text-[0.6rem] tracking-widest text-ambar uppercase">manual</span>}
              </div>
              <div className="mt-4 font-mono text-[0.7rem] tracking-[0.2em] text-slate-400 uppercase">
                {info.estado === 'programada' ? 'Abre en' : info.estado === 'abierta' ? 'Cierra en' : 'Cerrado'}
              </div>
              <div className={`font-mono font-bold tabular-nums ${info.estado === 'abierta' ? 'text-tinta' : 'text-slate-400'}`} style={{ fontSize: 'clamp(2.4rem, 4.6vw, 4.6rem)', lineHeight: 1 }}>
                {info.estado === 'programada' ? cuenta(info.abre - now) : info.estado === 'abierta' ? cuenta(info.cierra - now) : hmArt(info.cierra)}
              </div>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-vital via-ambar to-rosa transition-[width] duration-500" style={{ width: `${progresoVentana * 100}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-400">
                  <span>{hmArt(info.abre)}</span>
                  <span>{hmArt(info.cierra)}</span>
                </div>
              </div>
            </div>

            <div className="tarjeta hud relative overflow-hidden p-5">
              {latido > 0 && <div key={latido} className="destello pointer-events-none absolute inset-0 bg-vital/10" />}
              <div className="relative flex items-center gap-5">
                <div className="relative h-28 w-28 shrink-0">
                  <Medidor valor={presentes} total={total} />
                  <div className="absolute inset-0 grid place-items-center font-display text-xl font-semibold text-tinta">{pct(presentes, total)}%</div>
                </div>
                <div>
                  <div className="etiqueta flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Presentes
                  </div>
                  <div className="font-display font-bold text-tinta tabular-nums" style={{ fontSize: 'clamp(2.4rem, 4.4vw, 4.2rem)', lineHeight: 1 }}>
                    <span key={presentes} className="entrada inline-block">
                      {presentes}
                    </span>
                    <span className="text-2xl text-slate-300"> / {total}</span>
                  </div>
                </div>
              </div>
              <EcgLine key={latido} latidos={5} duracion={2.2} color="#0e9f68" className="relative mt-3 h-8 w-full" />
            </div>
          </div>

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
        <div className="hidden font-mono text-[0.65rem] tracking-wider text-slate-400 md:block">
          TOTP · HMAC-SHA256 · Δt {TOTP_PASO_S}s · ±{TOTP_TOLERANCIA} paso · C = {c}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {api.demo && (
            <>
              <button className="btn btn-secundario !py-1.5 !text-xs" onClick={() => api.demo!.simularLlegadas(sesion.id, 25)} disabled={!abierta}>
                <Zap className="h-3.5 w-3.5 text-ambar" /> Simular 25 llegadas
              </button>
              {abierta && url && (
                <a className="btn btn-secundario !py-1.5 !text-xs" href={url} target="_blank" rel="noreferrer" title="En modo demo el registro funciona en otra pestaña de este mismo navegador">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir como alumno
                </a>
              )}
            </>
          )}
          <Link to={`/panel?tab=manual&s=${sesion.id}`} className="btn btn-secundario !py-1.5 !text-xs" title="Dar presente a alumnos sin celular u otra eventualidad">
            <UserPlus className="h-3.5 w-3.5 text-violeta" /> Presente manual
          </Link>
          {abierta ? (
            <>
              <button className="btn btn-secundario !py-1.5 !text-xs" onClick={() => extender(5)}>
                <Plus className="h-3.5 w-3.5" /> 5 min
              </button>
              <button className="btn btn-secundario !py-1.5 !text-xs" onClick={cerrarAhora}>
                <Square className="h-3.5 w-3.5 text-rosa" /> Cerrar registro
              </button>
            </>
          ) : (
            <button className="btn btn-secundario !py-1.5 !text-xs" onClick={() => abrirAhora(10)}>
              <Unlock className="h-3.5 w-3.5 text-vital" /> Abrir ahora · 10 min
            </button>
          )}
          <Link to={`/poster/${sesion.id}`} className="btn btn-secundario !py-1.5 !text-xs">
            <Printer className="h-3.5 w-3.5" /> Póster
          </Link>
          <button className="btn btn-secundario !py-1.5 !text-xs" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
            {pantalla ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            {pantalla ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
      </footer>
    </div>
  )
}
