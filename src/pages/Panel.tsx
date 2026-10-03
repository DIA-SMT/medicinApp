import { Activity, CalendarCheck, CircleCheck, ClipboardList, Database, Download, FingerprintPattern, ListChecks, LogOut, Printer, Projector, RotateCcw, Search, Smartphone, Unlink, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAvisos } from '../components/Avisos'
import { Kpi, PildoraEstado } from '../components/ui'
import { useAdmin } from '../data/admin'
import type { Alumno, DispositivoVinculado, Registro } from '../data/types'
import { MOTIVOS_MANUALES, UMBRAL_REGULARIDAD } from '../lib/config'
import { descargarCsv } from '../lib/csv'
import { AREAS, CRONOGRAMA, docentesSesion, sesionPorId, type Sesion } from '../lib/cronograma'
import { huellaCorta } from '../lib/device'
import { pct, sinTildes } from '../lib/format'
import { useNow, useVentanas } from '../lib/hooks'
import { cuenta as cuentaRegresiva, diaSemana, fechaCorta, hmArt, hoyIso, horaArt, infoVentana, sesionVigente, ventanaDefault } from '../lib/time'

type Avisar = (texto: string, deshacer?: () => Promise<unknown> | void) => void

type Condicion = 'Regular' | 'En riesgo' | 'Libre'
const COLOR_COND: Record<Condicion, string> = { Regular: '#0e9f68', 'En riesgo': '#c27c03', Libre: '#e0246f' }
type Pestana = 'regularidad' | 'manual' | 'clase' | 'dispositivos'

interface Fila {
  a: Alumno
  presentes: number
  porcentaje: number
  condicion: Condicion
  marcas: Map<string, Registro>
}

const leerUmbral = () => {
  try {
    return Number(localStorage.getItem('ciclo:umbral')) || UMBRAL_REGULARIDAD
  } catch {
    return UMBRAL_REGULARIDAD
  }
}

const etiquetaSesion = (s: Sesion) => `Nº ${String(s.n).padStart(2, '0')} · ${fechaCorta(s.fecha)} · ${s.temas.map((t) => t.titulo).join(' + ')}`

function SelectorSesion({ valor, onCambiar }: { valor: string; onCambiar: (id: string) => void }) {
  return (
    <select className="campo !w-auto max-w-full !py-2.5" value={valor} onChange={(e) => onCambiar(e.target.value)}>
      {CRONOGRAMA.map((s) => (
        <option key={s.id} value={s.id}>
          {etiquetaSesion(s)}
        </option>
      ))}
    </select>
  )
}

/** Lo primero que ve el docente: qué clase toca, cómo está el registro y los accesos para esa clase. */
function ClaseDeHoy({ registros, total, onManual, onVer }: { registros: Registro[]; total: number; onManual: (id: string) => void; onVer: (id: string) => void }) {
  const now = useNow(1000)
  const { ventanas } = useVentanas()
  const s = sesionVigente(ventanas, now)
  if (!s) return null
  const info = infoVentana(s.fecha, ventanas?.[s.id] ?? ventanaDefault(), now)
  const esHoy = s.fecha === hoyIso(now)
  const n = registros.filter((r) => r.sesionId === s.id).length
  const estado =
    info.estado === 'abierta'
      ? `Registro abierto: cierra a las ${hmArt(info.cierra)} (en ${cuentaRegresiva(info.cierra - now)}). Los presentes se suman solos.`
      : info.estado === 'programada' && esHoy
        ? `El registro abre solo a las ${hmArt(info.abre)} (en ${cuentaRegresiva(info.abre - now)}). Abrí el proyector unos minutos antes.`
        : info.estado === 'programada'
          ? `El registro abre solo a las ${hmArt(info.abre)} y cierra a las ${hmArt(info.cierra)}. Si van a usar póster, imprimilo la noche anterior.`
          : `El registro cerró a las ${hmArt(info.cierra)}.`

  return (
    <div className="tarjeta hud mt-8 overflow-hidden">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="etiqueta">
              {esHoy ? 'Clase de hoy' : 'Próxima clase'} · Nº {String(s.n).padStart(2, '0')} · {diaSemana(s.fecha)} {fechaCorta(s.fecha)}
            </span>
            <PildoraEstado estado={info.estado} />
          </div>
          <h2 className="mt-2 font-display text-2xl leading-tight font-semibold text-tinta sm:text-3xl">{s.temas.map((t) => t.titulo).join(' + ')}</h2>
          <p className="mt-1 text-sm text-slate-500">{docentesSesion(s)}</p>
          <p className={`mt-3 text-sm font-medium ${info.estado === 'abierta' ? 'text-vital' : 'text-slate-600'}`}>{estado}</p>
        </div>
        {(esHoy || n > 0) && (
          <div className="flex items-baseline gap-2 lg:flex-col lg:items-end lg:gap-0">
            <span className="etiqueta">Presentes</span>
            <span className="font-display text-5xl font-bold text-tinta tabular-nums">
              <span key={n} className="entrada inline-block">
                {n}
              </span>
              <span className="text-2xl text-slate-300"> / {total}</span>
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-linea bg-slate-50/70 px-5 py-3 sm:px-6">
        <Link to={`/aula/${s.id}`} className="btn btn-primario">
          <Projector className="h-4 w-4" /> Abrir proyector
        </Link>
        <Link to={`/poster/${s.id}`} className="btn btn-secundario">
          <Printer className="h-4 w-4" /> Póster para imprimir
        </Link>
        <button className="btn btn-secundario" onClick={() => onManual(s.id)}>
          <UserPlus className="h-4 w-4 text-violeta" /> Presente manual
        </button>
        <button className="btn btn-secundario" onClick={() => onVer(s.id)}>
          <ListChecks className="h-4 w-4 text-cian" /> Lista de la clase
        </button>
      </div>
    </div>
  )
}

export function Panel() {
  const api = useAdmin()
  const { nodo: aviso, mostrar } = useAvisos()
  const [params, setParams] = useSearchParams()
  const hoy = hoyIso()
  const tab = (params.get('tab') as Pestana) || 'regularidad'
  const sesionSel = (params.get('s') && sesionPorId(params.get('s')!)?.id) || CRONOGRAMA.find((s) => s.fecha >= hoy)?.id || CRONOGRAMA[CRONOGRAMA.length - 1].id
  const ir = (cambios: { tab?: Pestana; s?: string }) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (cambios.tab) n.set('tab', cambios.tab)
      if (cambios.s) n.set('s', cambios.s)
      return n
    })

  const [alumnos, setAlumnos] = useState<Alumno[] | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [dispositivos, setDispositivos] = useState<DispositivoVinculado[]>([])
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Condicion | 'Todos'>('Todos')
  const [umbral, setUmbral] = useState(leerUmbral)
  const [busquedaDisp, setBusquedaDisp] = useState('')

  const cargar = useCallback(() => {
    Promise.all([api.alumnos(), api.registros(), api.dispositivos()])
      .then(([a, r, d]) => {
        setAlumnos(a)
        setRegistros(r)
        setDispositivos(d)
      })
      .catch((e) => setError(String(e.message ?? e)))
  }, [api])
  useEffect(() => {
    cargar()
    return api.suscribir(cargar)
  }, [api, cargar])

  useEffect(() => {
    try {
      localStorage.setItem('ciclo:umbral', String(umbral))
    } catch {
      /* sin almacenamiento */
    }
  }, [umbral])

  // Cuentan para regularidad las clases ya dictadas en las que se tomó asistencia
  // (una carga manual anticipada no vuelve "dictada" a una clase futura).
  const computables = useMemo(() => CRONOGRAMA.filter((s) => s.fecha <= hoy && registros.some((r) => r.sesionId === s.id)), [registros, hoy])
  const restantes = CRONOGRAMA.filter((s) => s.fecha >= hoy && !computables.includes(s)).length

  const filas: Fila[] = useMemo(() => {
    if (!alumnos) return []
    const porAlumno = new Map<string, Map<string, Registro>>()
    for (const r of registros) {
      if (!porAlumno.has(r.libreta)) porAlumno.set(r.libreta, new Map())
      porAlumno.get(r.libreta)!.set(r.sesionId, r)
    }
    const n = computables.length
    return alumnos.map((a) => {
      const marcas = porAlumno.get(a.libreta) ?? new Map()
      const presentes = computables.filter((s) => marcas.has(s.id)).length
      const porcentaje = pct(presentes, n)
      const maximo = pct(presentes + restantes, n + restantes)
      const condicion: Condicion = !n || porcentaje >= umbral ? 'Regular' : maximo >= umbral ? 'En riesgo' : 'Libre'
      return { a, presentes, porcentaje, condicion, marcas }
    })
  }, [alumnos, registros, computables, restantes, umbral])

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim())
    return filas.filter((f) => (filtro === 'Todos' || f.condicion === filtro) && (!q || sinTildes(`${f.a.nombre} ${f.a.libreta} ${f.a.dni}`).includes(q)))
  }, [filas, busqueda, filtro])

  if (error) return <p className="mx-auto max-w-3xl p-10 text-rosa-oscuro">No se pudieron cargar los datos: {error}</p>
  if (!alumnos) return <p className="mx-auto max-w-3xl p-10 font-mono text-slate-400">Cargando padrón…</p>

  /** Clic en un casillero de la grilla: se corrige al instante y el aviso permite deshacerlo. */
  const alternarPresente = async (s: Sesion, a: Alumno, r: Registro | undefined) => {
    const quien = `${a.nombre.split(',')[0]} · ${fechaCorta(s.fecha)}`
    if (r) {
      // Un presente por QR no se recupera tal cual (volvería como manual): para ese caso se pregunta antes.
      if (r.metodo !== 'manual' && !confirm(`¿Quitar el presente que ${a.nombre} dio con el QR el ${fechaCorta(s.fecha)}?`)) return
      await api.quitarPresente(s.id, [a.libreta])
      cargar()
      mostrar(`Presente quitado: ${quien}`, r.metodo === 'manual' ? () => api.marcarManual(s.id, [a.libreta], r.motivo ?? 'Corrección desde el panel').then(cargar) : undefined)
    } else {
      await api.marcarManual(s.id, [a.libreta], 'Corrección desde el panel')
      cargar()
      mostrar(`Presente manual cargado: ${quien}`, () => api.quitarPresente(s.id, [a.libreta]).then(cargar))
    }
  }

  const promedio = filas.length ? Math.round(filas.reduce((s, f) => s + f.porcentaje, 0) / filas.length) : 0
  const cuenta = (c: Condicion) => filas.filter((f) => f.condicion === c).length
  const manuales = registros.filter((r) => r.metodo === 'manual').length

  const exportarPlanilla = () => {
    descargarCsv(`planilla-regularidad-ginecologia-${hoy}.csv`, [
      ['Folio', 'Orden', 'Libreta', 'Apellido y Nombre', 'Documento', ...computables.map((s) => `Clase ${s.n} (${fechaCorta(s.fecha)})`), 'Presentes', 'Clases', '%', 'Condición'],
      ...filas.map((f) => [f.a.folio, f.a.orden, f.a.libreta, f.a.nombre, f.a.dni, ...computables.map((s) => (!f.marcas.has(s.id) ? 'A' : f.marcas.get(s.id)!.metodo === 'manual' ? 'PM' : 'P')), f.presentes, computables.length, f.porcentaje, f.condicion]),
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="etiqueta mb-2 flex items-center gap-2">
            <span className="h-px w-6 bg-gradient-to-r from-rosa to-cian" /> Cátedra de Ginecología · 4º Cursado 2026
          </div>
          <h1 className="font-display text-3xl font-bold text-tinta sm:text-4xl">Panel de asistencia</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {api.demo && (
            <>
              <button className="btn btn-secundario" onClick={() => api.demo!.poblarHistorico()} title="Genera asistencias de ejemplo para las clases ya dictadas">
                <Database className="h-4 w-4 text-ambar" /> Datos de ejemplo
              </button>
              <button className="btn btn-secundario" onClick={() => confirm('¿Borrar todos los datos de la demostración?') && api.demo!.reiniciar()}>
                <RotateCcw className="h-4 w-4" /> Reiniciar demo
              </button>
            </>
          )}
          <button className="btn btn-secundario" onClick={() => ir({ tab: 'manual' })}>
            <UserPlus className="h-4 w-4 text-violeta" /> Presente manual
          </button>
          <button className="btn btn-primario" onClick={exportarPlanilla}>
            <Download className="h-4 w-4" /> Exportar planilla
          </button>
          {api.modo === 'supabase' && (
            <button className="btn btn-secundario" onClick={() => api.salir().then(() => location.reload())} title="Cerrar la sesión de la cátedra en esta computadora">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          )}
        </div>
      </div>

      <ClaseDeHoy registros={registros} total={alumnos.length} onManual={(s) => ir({ tab: 'manual', s })} onVer={(s) => ir({ tab: 'clase', s })} />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi etiqueta="Alumnos" valor={alumnos.length} icono={Users} nota="Planilla de regularidades" />
        <Kpi etiqueta="Clases con registro" valor={computables.length} sufijo={`/ ${CRONOGRAMA.length}`} icono={CalendarCheck} nota={`${restantes} por dictar`} />
        <Kpi etiqueta="Asistencia media" valor={promedio} sufijo="%" color="#08798f" icono={Activity} />
        <Kpi etiqueta="Regulares" valor={cuenta('Regular')} color="#0e9f68" nota={`${cuenta('En riesgo')} en riesgo · ${cuenta('Libre')} libres`} />
        <Kpi etiqueta="Presentes manuales" valor={manuales} color={manuales ? '#6b5cf6' : '#0b1220'} icono={ClipboardList} nota="Cargados por la cátedra" />
      </div>

      {/* Barras por clase */}
      <div className="tarjeta hud mt-6 p-5">
        <div className="flex items-center justify-between">
          <span className="etiqueta">Presentes por clase</span>
          <span className="font-mono text-xs text-slate-400">Clic en una barra para ver el detalle</span>
        </div>
        <div className="mt-5 flex h-44 items-end gap-2 sm:gap-3">
          {CRONOGRAMA.map((s) => {
            const n = registros.filter((r) => r.sesionId === s.id).length
            const f = alumnos.length ? n / alumnos.length : 0
            const color = AREAS[s.temas[0].area].color
            return (
              <button key={s.id} onClick={() => ir({ tab: 'clase', s: s.id })} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${fechaCorta(s.fecha)} · ${s.temas[0].titulo}: ${n} presentes`}>
                <span className="font-mono text-[0.65rem] text-slate-500 tabular-nums opacity-0 transition group-hover:opacity-100">{n || ''}</span>
                <div className="relative w-full flex-1 overflow-hidden rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-lg transition-[height] duration-700"
                    style={{ height: `${f * 100}%`, background: `linear-gradient(to top, ${color}66, ${color})` }}
                  />
                  {sesionSel === s.id && tab === 'clase' && <div className="absolute inset-0 rounded-lg ring-2 ring-tinta/50" />}
                </div>
                <span className="font-mono text-[0.6rem] text-slate-400 tabular-nums">{fechaCorta(s.fecha)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {(
          [
            ['regularidad', 'Regularidad', Users],
            ['manual', 'Presente manual', UserPlus],
            ['clase', 'Por clase', CalendarCheck],
            ['dispositivos', `Dispositivos (${dispositivos.length})`, Smartphone],
          ] as const
        ).map(([k, t, I]) => (
          <button key={k} onClick={() => ir({ tab: k })} className={`btn ${tab === k ? 'btn-primario' : 'btn-secundario'} !py-2`}>
            <I className="h-4 w-4" /> {t}
          </button>
        ))}
      </div>

      {tab === 'regularidad' && (
        <div className="tarjeta hud mt-4">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="campo !py-2.5 !pl-9" placeholder="Buscar por nombre, libreta o DNI" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <div className="flex gap-1.5">
              {(['Todos', 'Regular', 'En riesgo', 'Libre'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setFiltro(c)}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[0.65rem] tracking-wider uppercase transition ${filtro === c ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white text-slate-500 hover:text-tinta'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 font-mono text-xs text-slate-500">
              Umbral
              <input type="range" min={50} max={100} step={5} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} className="accent-rosa" />
              <span className="w-9 text-tinta tabular-nums">{umbral}%</span>
            </label>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                <tr className="text-left font-mono text-[0.62rem] tracking-wider text-slate-400 uppercase">
                  <th className="border-b border-linea px-4 py-3 font-normal">Alumno</th>
                  {computables.map((s) => (
                    <th key={s.id} className="border-b border-linea px-1 py-3 text-center font-normal" title={s.temas[0].titulo}>
                      {fechaCorta(s.fecha)}
                    </th>
                  ))}
                  <th className="border-b border-linea px-3 py-3 text-right font-normal">%</th>
                  <th className="border-b border-linea px-4 py-3 font-normal">Condición</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.a.libreta} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-4 py-2">
                      <div className="font-medium text-tinta">{f.a.nombre}</div>
                      <div className="font-mono text-[0.65rem] text-slate-400">
                        {f.a.libreta} · DNI {f.a.dni}
                      </div>
                    </td>
                    {computables.map((s) => {
                      const r = f.marcas.get(s.id)
                      const color = !r ? '#eef1f6' : r.metodo === 'manual' ? '#6b5cf6' : '#0e9f68'
                      return (
                        <td key={s.id} className="border-b border-slate-100 px-1 py-2 text-center">
                          <button
                            onClick={() => alternarPresente(s, f.a, r)}
                            className="mx-auto block h-5 w-5 rounded-md transition hover:scale-125 hover:ring-2 hover:ring-tinta/30"
                            style={{ background: color }}
                            title={r ? `${horaArt(r.marcadoEn)} · ${r.metodo === 'manual' ? `manual: ${r.motivo ?? ''}` : r.metodo} — clic para quitar` : 'Ausente — clic para marcar presente (manual)'}
                            aria-label={`${f.a.nombre}, ${fechaCorta(s.fecha)}: ${r ? 'presente' : 'ausente'}`}
                          />
                        </td>
                      )
                    })}
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-tinta tabular-nums">{computables.length ? `${f.porcentaje}%` : '—'}</td>
                    <td className="border-b border-slate-100 px-4 py-2">
                      <span className="rounded-full px-2.5 py-1 font-mono text-[0.62rem] font-medium tracking-wider uppercase" style={{ color: COLOR_COND[f.condicion], background: `${COLOR_COND[f.condicion]}12`, border: `1px solid ${COLOR_COND[f.condicion]}44` }}>
                        {f.condicion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {computables.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">
                Todavía no hay clases dictadas con asistencia registrada. {api.demo ? 'Usá «Datos de ejemplo» para ver el tablero con información simulada.' : 'Aparecerán acá a partir de la primera clase.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-linea px-4 py-3 font-mono text-[0.65rem] text-slate-500">
            {[
              ['#0e9f68', 'Presente (QR)'],
              ['#6b5cf6', 'Presente manual'],
              ['#eef1f6', 'Ausente'],
            ].map(([c, t]) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-slate-200" style={{ background: c }} /> {t}
              </span>
            ))}
            <span className="ml-auto">
              {visibles.length} de {filas.length} alumnos
            </span>
          </div>
        </div>
      )}

      {tab === 'manual' && <CargaManual sesionId={sesionSel} onSesion={(s) => ir({ s })} alumnos={alumnos} registros={registros} recargar={cargar} avisar={mostrar} />}

      {tab === 'clase' && <DetalleClase sesion={sesionPorId(sesionSel)!} alumnos={alumnos} registros={registros} onCambiar={(s) => ir({ s })} recargar={cargar} avisar={mostrar} />}

      {tab === 'dispositivos' && (
        <div className="tarjeta hud mt-4 p-5">
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <FingerprintPattern className="mt-0.5 h-4 w-4 shrink-0 text-cian" />
            Cada alumno queda vinculado al primer celular con el que da el presente. Si cambia de teléfono o borra los datos del navegador, liberá el vínculo y el
            próximo registro creará uno nuevo.
          </p>
          {dispositivos.length > 0 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="campo !py-2.5 !pl-9" placeholder="Buscar alumno por nombre, libreta o DNI" value={busquedaDisp} onChange={(e) => setBusquedaDisp(e.target.value)} />
            </div>
          )}
          <div className="mt-2 divide-y divide-slate-100">
            {dispositivos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Ningún dispositivo vinculado todavía.</p>}
            {dispositivos
              .map((d) => ({ d, a: alumnos.find((x) => x.libreta === d.libreta) }))
              .filter(({ d, a }) => !busquedaDisp.trim() || sinTildes(`${a?.nombre ?? ''} ${d.libreta} ${a?.dni ?? ''}`).includes(sinTildes(busquedaDisp.trim())))
              .sort((x, y) => (x.a?.nombre ?? '').localeCompare(y.a?.nombre ?? ''))
              .map(({ d, a }) => (
                <div key={d.huella} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium text-tinta">{a?.nombre ?? d.libreta}</div>
                    <div className="font-mono text-[0.65rem] text-slate-400">
                      {d.libreta} · huella {huellaCorta(d.huella, 6)} · desde {fechaCorta(new Date(d.creadoEn).toISOString().slice(0, 10))}
                    </div>
                  </div>
                  <button
                    className="btn btn-secundario !py-1.5 !text-xs"
                    onClick={() =>
                      confirm(`¿Liberar el celular de ${a?.nombre ?? d.libreta}? En la próxima clase se registra de nuevo con su DNI.`) &&
                      api.liberarDispositivo(d.libreta).then(() => {
                        cargar()
                        mostrar(`Celular liberado: ${a?.nombre ?? d.libreta}`)
                      })
                    }
                  >
                    <Unlink className="h-3.5 w-3.5" /> Liberar
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
      {aviso}
    </main>
  )
}

/** Carga de presentes por la cátedra: alumnos sin celular, problemas técnicos, ausencias justificadas… */
function CargaManual({ sesionId, onSesion, alumnos, registros, recargar, avisar }: { sesionId: string; onSesion: (id: string) => void; alumnos: Alumno[]; registros: Registro[]; recargar: () => void; avisar: Avisar }) {
  const api = useAdmin()
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState(MOTIVOS_MANUALES[0])
  const [lista, setLista] = useState('')
  const [noEncontrados, setNoEncontrados] = useState<string[]>([])
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  const presentes = useMemo(() => new Map(registros.filter((r) => r.sesionId === sesionId).map((r) => [r.libreta, r])), [registros, sesionId])
  const porLibreta = useMemo(() => new Map(alumnos.map((a) => [a.libreta, a])), [alumnos])
  const q = sinTildes(busqueda.trim())
  const visibles = alumnos.filter((a) => !q || sinTildes(`${a.nombre} ${a.libreta} ${a.dni}`).includes(q))
  const manualesDeLaClase = [...presentes.values()].filter((r) => r.metodo === 'manual').sort((a, b) => b.marcadoEn - a.marcadoEn)

  useEffect(() => {
    setSeleccion(new Set())
    setAviso('')
  }, [sesionId])

  const alternar = (libreta: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(libreta)) n.delete(libreta)
      else n.add(libreta)
      return n
    })

  const agregarLista = () => {
    const porDni = new Map(alumnos.map((a) => [a.dni, a]))
    const faltan: string[] = []
    const n = new Set(seleccion)
    for (const t of lista.split(/[\s,;]+/).filter(Boolean)) {
      const limpio = t.replace(/\./g, '').toUpperCase()
      const a = porLibreta.get(limpio) ?? porDni.get(limpio.replace(/\D/g, ''))
      if (a && !presentes.has(a.libreta)) n.add(a.libreta)
      else if (!a) faltan.push(t)
    }
    setSeleccion(n)
    setNoEncontrados(faltan)
    setLista('')
  }

  const confirmar = async () => {
    setEnviando(true)
    setAviso('')
    try {
      const libretas = [...seleccion]
      const n = await api.marcarManual(sesionId, libretas, motivo.trim() || 'Sin especificar')
      setSeleccion(new Set())
      recargar()
      avisar(`${n} presente${n === 1 ? '' : 's'} cargado${n === 1 ? '' : 's'} en la clase del ${fechaCorta(sesionId)}`, () => api.quitarPresente(sesionId, libretas).then(recargar))
    } catch (e) {
      setAviso(`No se pudo guardar: ${String((e as Error).message ?? e)}`)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="tarjeta hud">
        <div className="space-y-3 border-b border-linea p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SelectorSesion valor={sesionId} onCambiar={onSesion} />
            {sesionId > hoyIso() && <span className="rounded-full bg-violeta-suave px-2.5 py-1 font-mono text-[0.62rem] tracking-wider text-violeta uppercase">Carga anticipada</span>}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="campo !py-2.5 !pl-9" placeholder="Buscar alumno por nombre, libreta o DNI" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-600">Pegar una lista de DNIs o libretas</summary>
            <textarea
              className="campo mt-2 h-24 font-mono text-xs"
              placeholder="Uno por línea o separados por coma: 30123456, MD0000000…"
              value={lista}
              onChange={(e) => setLista(e.target.value)}
            />
            <button className="btn btn-secundario mt-2 !py-1.5 !text-xs" onClick={agregarLista} disabled={!lista.trim()}>
              Agregar a la selección
            </button>
            {noEncontrados.length > 0 && <p className="mt-2 text-xs text-rosa-oscuro">No están en el padrón: {noEncontrados.join(', ')}</p>}
          </details>
        </div>
        <div className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
          {visibles.map((a) => {
            const r = presentes.get(a.libreta)
            const sel = seleccion.has(a.libreta)
            return (
              <label key={a.libreta} className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${r ? 'cursor-default opacity-60' : sel ? 'bg-violeta-suave' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" className="h-4 w-4 accent-violeta" checked={sel || !!r} disabled={!!r} onChange={() => alternar(a.libreta)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-tinta">{a.nombre}</div>
                  <div className="font-mono text-[0.65rem] text-slate-400">
                    {a.libreta} · DNI {a.dni}
                  </div>
                </div>
                {r && (
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[0.6rem] uppercase ${r.metodo === 'manual' ? 'bg-violeta-suave text-violeta' : 'bg-vital-suave text-vital'}`}>
                    {r.metodo === 'manual' ? 'Manual' : 'Presente'} · {horaArt(r.marcadoEn).slice(0, 5)}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="tarjeta hud p-5">
          <div className="etiqueta">Seleccionados</div>
          <div className="mt-1 font-display text-4xl font-bold text-violeta tabular-nums">{seleccion.size}</div>
          <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
            {[...seleccion].map((l) => (
              <button key={l} onClick={() => alternar(l)} className="flex items-center gap-1 rounded-full border border-violeta/30 bg-violeta-suave px-2 py-0.5 text-xs text-violeta hover:border-violeta">
                {porLibreta.get(l)?.nombre.split(',')[0] ?? l} <X className="h-3 w-3" />
              </button>
            ))}
          </div>

          <div className="etiqueta mt-5">Motivo</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOTIVOS_MANUALES.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${motivo === m ? 'border-violeta bg-violeta text-white' : 'border-linea bg-white text-slate-600 hover:border-violeta/50'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <input className="campo mt-2 !py-2 text-sm" placeholder="u otro motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} />

          <button className="btn btn-primario mt-5 w-full !py-3" disabled={!seleccion.size || enviando} onClick={confirmar}>
            <CircleCheck className="h-4 w-4" /> Dar presente a {seleccion.size || ''} {seleccion.size === 1 ? 'alumno' : 'alumnos'}
          </button>
          {aviso && <p className="entrada mt-3 rounded-xl bg-rosa-suave px-3 py-2 text-sm text-rosa-oscuro">{aviso}</p>}
        </div>

        <div className="tarjeta p-5">
          <div className="etiqueta mb-3">Cargas manuales de esta clase ({manualesDeLaClase.length})</div>
          {manualesDeLaClase.length === 0 && <p className="text-sm text-slate-400">Ninguna todavía.</p>}
          <ul className="space-y-2">
            {manualesDeLaClase.map((r) => (
              <li key={r.libreta} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-tinta">{porLibreta.get(r.libreta)?.nombre ?? r.nombre}</div>
                  <div className="text-xs text-slate-400">
                    {r.motivo ?? 'Sin motivo'}
                    {r.cargadoPor ? ` · ${r.cargadoPor}` : ''}
                  </div>
                </div>
                <button
                  className="shrink-0 text-xs text-slate-400 hover:text-rosa"
                  onClick={() =>
                    api.quitarPresente(sesionId, [r.libreta]).then(() => {
                      recargar()
                      avisar(`Presente quitado: ${(porLibreta.get(r.libreta)?.nombre ?? r.nombre).split(',')[0]}`, () => api.marcarManual(sesionId, [r.libreta], r.motivo ?? 'Sin especificar').then(recargar))
                    })
                  }
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function DetalleClase({ sesion, alumnos, registros, onCambiar, recargar, avisar }: { sesion: Sesion; alumnos: Alumno[]; registros: Registro[]; onCambiar: (id: string) => void; recargar: () => void; avisar: Avisar }) {
  const api = useAdmin()
  const [verAusentes, setVerAusentes] = useState(false)
  const regs = registros.filter((r) => r.sesionId === sesion.id).sort((a, b) => a.marcadoEn - b.marcadoEn)
  const presentes = new Set(regs.map((r) => r.libreta))
  const ausentes = alumnos.filter((a) => !presentes.has(a.libreta))
  const porAlumno = new Map(alumnos.map((a) => [a.libreta, a]))

  const exportar = () =>
    descargarCsv(`asistencia-${sesion.id}.csv`, [
      ['Libreta', 'Apellido y Nombre', 'Documento', 'Estado', 'Hora', 'Método', 'Motivo (manual)', 'Cargado por'],
      ...alumnos.map((a) => {
        const r = regs.find((x) => x.libreta === a.libreta)
        return [a.libreta, a.nombre, a.dni, r ? 'Presente' : 'Ausente', r ? horaArt(r.marcadoEn) : '', r?.metodo ?? '', r?.motivo ?? '', r?.cargadoPor ?? '']
      }),
    ])

  return (
    <div className="tarjeta hud mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea p-4">
        <SelectorSesion valor={sesion.id} onCambiar={onCambiar} />
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-tinta">
            <span className="text-vital">{regs.length}</span> presentes · <span className="text-rosa">{ausentes.length}</span> ausentes
          </span>
          <button className="btn btn-secundario !py-2" onClick={() => setVerAusentes((x) => !x)}>
            {verAusentes ? 'Ver presentes' : 'Ver ausentes'}
          </button>
          <button className="btn btn-secundario !py-2" onClick={exportar}>
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        {!verAusentes ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white/95 font-mono text-[0.62rem] tracking-wider text-slate-400 uppercase">
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Hora</th>
                <th className="px-4 py-3 font-normal">Alumno</th>
                <th className="px-4 py-3 font-normal">Método</th>
                <th className="px-4 py-3 font-normal">Detalle</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.libreta} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-slate-500 tabular-nums">{horaArt(r.marcadoEn)}</td>
                  <td className="px-4 py-2">
                    <div className="text-tinta">{porAlumno.get(r.libreta)?.nombre ?? r.nombre}</div>
                    <div className="font-mono text-[0.65rem] text-slate-400">{r.libreta}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[0.6rem] uppercase ${r.metodo === 'manual' ? 'bg-violeta-suave text-violeta' : 'bg-vital-suave text-vital'}`}>
                      {r.metodo === 'qr' ? 'QR dinámico' : r.metodo === 'poster' ? 'Póster' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.metodo === 'manual' ? `${r.motivo ?? ''}${r.cargadoPor ? ` · ${r.cargadoPor}` : ''}` : r.distanciaM != null ? `${r.distanciaM} m de la sede` : ''}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-xs text-slate-400 hover:text-rosa"
                      onClick={async () => {
                        const nombre = porAlumno.get(r.libreta)?.nombre ?? r.nombre
                        if (r.metodo !== 'manual' && !confirm(`¿Quitar el presente que ${nombre} dio con el ${r.metodo === 'poster' ? 'póster' : 'QR'}?`)) return
                        await api.quitarPresente(sesion.id, [r.libreta])
                        recargar()
                        avisar(`Presente quitado: ${nombre.split(',')[0]}`, r.metodo === 'manual' ? () => api.marcarManual(sesion.id, [r.libreta], r.motivo ?? 'Sin especificar').then(recargar) : undefined)
                      }}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {regs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    Sin registros para esta clase.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="divide-y divide-slate-100">
            {ausentes.map((a) => (
              <div key={a.libreta} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                <div>
                  <div className="text-tinta">{a.nombre}</div>
                  <div className="font-mono text-[0.65rem] text-slate-400">
                    {a.libreta} · DNI {a.dni}
                  </div>
                </div>
                <button
                  className="btn btn-secundario !py-1.5 !text-xs"
                  onClick={() =>
                    api.marcarManual(sesion.id, [a.libreta], 'Cargado desde «Por clase»').then(() => {
                      recargar()
                      avisar(`Presente manual cargado: ${a.nombre.split(',')[0]}`, () => api.quitarPresente(sesion.id, [a.libreta]).then(recargar))
                    })
                  }
                >
                  Marcar presente
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
