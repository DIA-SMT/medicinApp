import { Activity, CalendarCheck, CalendarOff, CircleCheck, FlaskConical, KeyRound, ShieldCheck, TriangleAlert, UserCheck, UserX, ClipboardList, CloudDownload, Database, Download, FileText, FingerprintPattern, History, ListChecks, LogOut, Printer, Projector, RotateCcw, Search, Smartphone, Unlink, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAvisos } from '../components/Avisos'
import { claveSugerida } from '../lib/clave'
import { copiarTexto } from '../lib/copiar'
import { Kpi, PildoraEstado } from '../components/ui'
import { useAdmin } from '../data/admin'
import type { AccionAuditoria, Alumno, Cuenta, DispositivoVinculado, EventoAuditoria, PedidoCelular, Registro, Rol, Solicitud } from '../data/types'
import { MOTIVOS_MANUALES, UMBRAL_REGULARIDAD } from '../lib/config'
import { descargarCsv } from '../lib/csv'
import { AREAS, CRONOGRAMA, docentesSesion, sesionPorId, type Sesion } from '../lib/cronograma'
import { huellaCorta } from '../lib/device'
import { pct, sinTildes } from '../lib/format'
import { useNow, useVentanas } from '../lib/hooks'
import { clasesVigentes, cuenta as cuentaRegresiva, diaSemana, fechaCorta, hmArt, hoyIso, horaArt, infoVentana, sesionVigente, suspendida, ventanaDefault } from '../lib/time'

type Avisar = (texto: string, deshacer?: () => Promise<unknown> | void) => void

type Condicion = 'Regular' | 'En riesgo' | 'Libre'
const COLOR_COND: Record<Condicion, string> = { Regular: '#0e9f68', 'En riesgo': '#c27c03', Libre: '#e0246f' }
type Pestana = 'regularidad' | 'manual' | 'clase' | 'dispositivos' | 'historial' | 'cuentas'

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
  const { ventanas } = useVentanas()
  return (
    <select className="campo !w-auto max-w-full !py-2.5" value={valor} onChange={(e) => onCambiar(e.target.value)}>
      {CRONOGRAMA.map((s) => (
        <option key={s.id} value={s.id}>
          {etiquetaSesion(s)}
          {suspendida(ventanas, s.id) ? ' (suspendida)' : ''}
        </option>
      ))}
    </select>
  )
}

// Recordatorio de respaldo: la base gratuita no hace copias automáticas, así que la planilla exportada
// al terminar cada clase es la copia de seguridad. Se recuerda por computadora (localStorage).
const claveExportada = (id: string) => `ciclo:exportado:${id}`
const exportada = (id: string) => {
  try {
    return localStorage.getItem(claveExportada(id)) === '1'
  } catch {
    return false
  }
}
const marcarExportadas = (ids: string[]) => {
  try {
    for (const id of ids) localStorage.setItem(claveExportada(id), '1')
  } catch {
    /* sin almacenamiento: el aviso vuelve a aparecer */
  }
}

/** Aviso tras el cierre de una clase con presentes que todavía no se exportó desde esta computadora. */
function RecordatorioExportar({ registros, onExportar }: { registros: Registro[]; onExportar: () => void }) {
  const now = useNow(30_000)
  const { ventanas } = useVentanas()
  const [, forzar] = useState(0)
  const hoy = hoyIso(now)
  const pendiente = [...CRONOGRAMA]
    .reverse()
    .find((s) => s.fecha <= hoy && !suspendida(ventanas, s.id) && registros.some((r) => r.sesionId === s.id) && infoVentana(s.fecha, ventanas?.[s.id] ?? ventanaDefault(), now).estado === 'cerrada' && !exportada(s.id))
  if (!pendiente) return null
  const n = registros.filter((r) => r.sesionId === pendiente.id).length
  const hasta = CRONOGRAMA.filter((s) => s.fecha <= pendiente.fecha).map((s) => s.id)

  return (
    <div role="status" className="entrada mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-ambar/30 bg-ambar-suave p-4 sm:p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-ambar">
        <CloudDownload className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-tinta">
          La clase del {diaSemana(pendiente.fecha).toLowerCase()} {fechaCorta(pendiente.fecha)} ya cerró · {n} presente{n === 1 ? '' : 's'}
        </div>
        <p className="text-sm text-slate-600">Descargá la planilla al terminar cada clase: es la copia de seguridad (la base no guarda copias automáticas).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primario" onClick={() => (onExportar(), marcarExportadas(hasta), forzar((x) => x + 1))}>
          <Download className="h-4 w-4" /> Descargar planilla
        </button>
        <button className="btn btn-secundario" onClick={() => (marcarExportadas(hasta), forzar((x) => x + 1))}>
          Ya la tengo
        </button>
      </div>
    </div>
  )
}

/** Lo primero que ve el docente: qué clase toca, cómo está el registro y los accesos para esa clase. */
const NOMBRE_FALLO: Record<string, string> = {
  CODIGO_INVALIDO: 'código vencido',
  PASE_VENCIDO: 'tardaron más de 3 min',
  DNI_DESCONOCIDO: 'DNI no encontrado',
  DISPOSITIVO_OCUPADO: 'celular de otra persona',
  DISPOSITIVO_AJENO: 'cambió de celular',
  FIRMA_INVALIDA: 'hora del celular mal',
  PROGRAMADA: 'antes de abrir',
  CERRADA: 'con el registro cerrado',
}

function ClaseDeHoy({ registros, total, onManual, onVer }: { registros: Registro[]; total: number; onManual: (id: string) => void; onVer: (id: string) => void }) {
  const api = useAdmin()
  const now = useNow(1000)
  const { ventanas } = useVentanas()
  const s = sesionVigente(ventanas, now)
  const esHoy = !!s && s.fecha === hoyIso(now)
  // Avisos de los alumnos de hoy (sólo el tipo de error), cada 20 s.
  const [fallos, setFallos] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!s || !esHoy) return
    const leer = () => api.fallos(s.id).then((f) => setFallos(f.total)).catch(() => {})
    leer()
    const t = setInterval(leer, 20_000)
    return () => clearInterval(t)
  }, [api, s, esHoy])
  if (!s) return null
  const info = infoVentana(s.fecha, ventanas?.[s.id] ?? ventanaDefault(), now)
  const suspendidaHoy = CRONOGRAMA.find((x) => x.fecha === hoyIso(now) && suspendida(ventanas, x.id))
  const n = registros.filter((r) => r.sesionId === s.id).length
  const avisos = Object.entries(fallos).sort((a, b) => b[1] - a[1])
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
          {suspendidaHoy && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ambar">
              <CalendarOff className="h-3.5 w-3.5" /> Hoy no hay clase: la del {fechaCorta(suspendidaHoy.fecha)} está suspendida ({ventanas?.[suspendidaHoy.id]?.motivoSuspension}).
            </p>
          )}
          {avisos.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ambar">
              <TriangleAlert className="h-3.5 w-3.5" /> Avisos de los alumnos hoy:
              {avisos.map(([codigo, cant]) => (
                <span key={codigo} className="rounded-full bg-ambar-suave px-2 py-0.5 font-medium">
                  {NOMBRE_FALLO[codigo] ?? codigo} ×{cant}
                </span>
              ))}
            </p>
          )}
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
        <Link to="/aula/ensayo" className="btn btn-secundario sm:ml-auto" title="Probar el circuito completo con celulares reales, sin que cuente para la regularidad">
          <FlaskConical className="h-4 w-4 text-ambar" /> Hacer un ensayo
        </Link>
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
  const [orden, setOrden] = useState<'planilla' | 'apellido' | 'asistencia'>('planilla')
  const [umbral, setUmbral] = useState(leerUmbral)
  const [busquedaDisp, setBusquedaDisp] = useState('')
  // Administradores: pestaña «Cuentas» y aviso de pedidos de acceso pendientes.
  const [esAdmin, setEsAdmin] = useState(false)
  const [verMiClave, setVerMiClave] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const revisarCuentas = useCallback(() => {
    api
      .esAdmin()
      .then(async (si) => {
        setEsAdmin(si)
        if (si) setPendientes((await api.cuentas()).solicitudes.length)
      })
      .catch(() => {})
  }, [api])
  useEffect(revisarCuentas, [revisarCuentas])
  const [, setExportes] = useState(0)
  const [generando, setGenerando] = useState(false)

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

  // Pedidos de cambio de celular (alumnos sin el anterior): se revisan cada 20 s, porque suelen llegar en clase.
  const [pedidosCel, setPedidosCel] = useState<PedidoCelular[]>([])
  const cargarPedidos = useCallback(() => {
    api.pedidosCelular().then(setPedidosCel).catch(() => {})
  }, [api])
  useEffect(() => {
    cargarPedidos()
    const t = setInterval(cargarPedidos, 20_000)
    return () => clearInterval(t)
  }, [cargarPedidos])

  useEffect(() => {
    try {
      localStorage.setItem('ciclo:umbral', String(umbral))
    } catch {
      /* sin almacenamiento */
    }
  }, [umbral])

  // Cuentan para regularidad las clases ya dictadas en las que se tomó asistencia
  // (una carga manual anticipada no vuelve "dictada" a una clase futura). Las suspendidas no cuentan.
  const { ventanas } = useVentanas()
  const vigentes = useMemo(() => clasesVigentes(ventanas), [ventanas])
  const computables = useMemo(() => vigentes.filter((s) => s.fecha <= hoy && registros.some((r) => r.sesionId === s.id)), [vigentes, registros, hoy])
  const restantes = vigentes.filter((s) => s.fecha >= hoy && !computables.includes(s)).length
  const suspendidas = CRONOGRAMA.length - vigentes.length

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
    const lista = filas.filter((f) => (filtro === 'Todos' || f.condicion === filtro) && (!q || sinTildes(`${f.a.nombre} ${f.a.libreta} ${f.a.dni}`).includes(q)))
    // «Menor asistencia primero»: para encontrar rápido a quién avisar antes de que quede libre.
    if (orden === 'apellido') return [...lista].sort((x, y) => x.a.nombre.localeCompare(y.a.nombre, 'es'))
    if (orden === 'asistencia') return [...lista].sort((x, y) => x.porcentaje - y.porcentaje || x.a.nombre.localeCompare(y.a.nombre, 'es'))
    return lista
  }, [filas, busqueda, filtro, orden])
  const porCondicion = useMemo(() => {
    const n: Record<Condicion | 'Todos', number> = { Todos: filas.length, Regular: 0, 'En riesgo': 0, Libre: 0 }
    for (const f of filas) n[f.condicion]++
    return n
  }, [filas])

  if (error) return <p className="mx-auto max-w-3xl p-10 text-rosa-oscuro">No se pudieron cargar los datos: {error}</p>
  if (!alumnos)
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-busy="true">
        <div className="h-3 w-56 animate-pulse rounded bg-rosa-suave" />
        <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded-lg bg-rosa-suave" />
        <div className="tarjeta mt-8 h-44 animate-pulse" />
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="tarjeta h-24 animate-pulse" />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">Cargando el padrón y la asistencia…</p>
      </main>
    )

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

  /** PDF con el diseño de la app (jsPDF se descarga recién acá). */
  const exportarPlanilla = async () => {
    setGenerando(true)
    try {
      const { planillaPdf, descargar } = await import('../lib/pdf')
      descargar(await planillaPdf({ filas, computables, umbral }))
      marcarExportadas(computables.map((s) => s.id))
      setExportes((x) => x + 1)
    } catch (e) {
      mostrar(`No se pudo generar el PDF: ${String((e as Error).message ?? e)}`)
    } finally {
      setGenerando(false)
    }
  }

  /** Los mismos datos en CSV, para abrir en Excel o guardar como copia de los datos. */
  const exportarCsv = () => {
    descargarCsv(`planilla-regularidad-ginecologia-${hoy}.csv`, [
      ['Folio', 'Orden', 'Libreta', 'Apellido y Nombre', 'Documento', ...computables.map((s) => `Clase ${s.n} (${fechaCorta(s.fecha)})`), 'Presentes', 'Clases', '%', 'Condición'],
      ...filas.map((f) => [f.a.folio, f.a.orden, f.a.libreta, f.a.nombre, f.a.dni, ...computables.map((s) => (!f.marcas.has(s.id) ? 'A' : f.marcas.get(s.id)!.metodo === 'manual' ? 'PM' : 'P')), f.presentes, computables.length, f.porcentaje, f.condicion]),
    ])
    marcarExportadas(computables.map((s) => s.id))
    setExportes((x) => x + 1)
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
          <button className="btn btn-primario" onClick={exportarPlanilla} disabled={generando}>
            <FileText className="h-4 w-4" /> {generando ? 'Generando PDF…' : 'Descargar planilla (PDF)'}
          </button>
          <button className="btn btn-secundario !px-3" onClick={exportarCsv} title="Los mismos datos en CSV, para Excel o como copia de los datos">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button className="btn btn-secundario" onClick={() => setVerMiClave((x) => !x)} title="Cambiar tu contraseña">
            <KeyRound className="h-4 w-4" /> Mi contraseña
          </button>
          {api.modo === 'supabase' && (
            <button className="btn btn-secundario" onClick={() => api.salir().then(() => location.reload())} title="Cerrar la sesión de la cátedra en esta computadora">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          )}
        </div>
      </div>

      {verMiClave && <MiClave avisar={mostrar} onCerrar={() => setVerMiClave(false)} />}

      {esAdmin && pendientes > 0 && tab !== 'cuentas' && (
        <button
          onClick={() => ir({ tab: 'cuentas' })}
          className="entrada mt-8 flex w-full flex-wrap items-center gap-3 rounded-2xl border border-rosa/30 bg-rosa-suave p-4 text-left transition hover:border-rosa/60"
        >
          <UserCheck className="h-5 w-5 shrink-0 text-rosa" />
          <span className="flex-1 font-medium text-tinta">
            {pendientes === 1 ? 'Hay 1 pedido de cuenta de la cátedra' : `Hay ${pendientes} pedidos de cuenta de la cátedra`} esperando aprobación
          </span>
          <span className="text-sm font-semibold text-rosa">Revisar →</span>
        </button>
      )}

      {pedidosCel.length > 0 && tab !== 'dispositivos' && (
        <button
          onClick={() => ir({ tab: 'dispositivos' })}
          className="entrada mt-8 flex w-full flex-wrap items-center gap-3 rounded-2xl border border-ambar/30 bg-ambar-suave p-4 text-left transition hover:border-ambar/60"
        >
          <Smartphone className="h-5 w-5 shrink-0 text-ambar" />
          <span className="flex-1 font-medium text-tinta">
            {pedidosCel.length === 1 ? '1 alumno pidió' : `${pedidosCel.length} alumnos pidieron`} pasar su presente a un celular nuevo
          </span>
          <span className="text-sm font-semibold text-ambar">Revisar →</span>
        </button>
      )}

      <RecordatorioExportar registros={registros} onExportar={exportarPlanilla} />

      <ClaseDeHoy registros={registros} total={alumnos.length} onManual={(s) => ir({ tab: 'manual', s })} onVer={(s) => ir({ tab: 'clase', s })} />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi etiqueta="Alumnos" valor={alumnos.length} icono={Users} nota="Planilla de regularidades" />
        <Kpi etiqueta="Clases con registro" valor={computables.length} sufijo={`/ ${vigentes.length}`} icono={CalendarCheck} nota={`${restantes} por dictar${suspendidas ? ` · ${suspendidas} suspendida${suspendidas === 1 ? '' : 's'}` : ''}`} />
        <Kpi etiqueta="Asistencia media" valor={promedio} sufijo="%" color="#b3175a" icono={Activity} />
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
            const susp = suspendida(ventanas, s.id)
            return (
              <button key={s.id} onClick={() => ir({ tab: 'clase', s: s.id })} className={`group flex h-full flex-1 flex-col items-center justify-end gap-2 ${susp ? 'opacity-50' : ''}`} title={`${fechaCorta(s.fecha)} · ${s.temas[0].titulo}: ${susp ? 'suspendida' : `${n} presentes`}`}>
                <span className="font-mono text-[0.65rem] text-slate-500 tabular-nums opacity-0 transition group-hover:opacity-100">{n || ''}</span>
                <div className="relative w-full flex-1 overflow-hidden rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-lg transition-[height] duration-700"
                    style={{ height: `${f * 100}%`, background: `linear-gradient(to top, ${color}66, ${color})` }}
                  />
                  {susp && <CalendarOff className="absolute inset-x-0 bottom-2 mx-auto h-4 w-4 text-slate-400" />}
                  {sesionSel === s.id && tab === 'clase' && <div className="absolute inset-0 rounded-lg ring-2 ring-tinta/50" />}
                </div>
                <span className={`font-mono text-[0.6rem] text-slate-400 tabular-nums ${susp ? 'line-through' : ''}`}>{fechaCorta(s.fecha)}</span>
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
            ['dispositivos', `Dispositivos (${dispositivos.length})${pedidosCel.length ? ` · ${pedidosCel.length} pedido${pedidosCel.length === 1 ? '' : 's'}` : ''}`, Smartphone],
            ['historial', 'Historial', History],
            ...(esAdmin ? ([['cuentas', `Cuentas${pendientes ? ` (${pendientes} pedido${pendientes === 1 ? '' : 's'})` : ''}`, ShieldCheck]] as const) : []),
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
                  {c} <span className="opacity-70">({porCondicion[c]})</span>
                </button>
              ))}
            </div>
            <select className="campo !w-auto !py-1.5 text-xs" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} aria-label="Ordenar alumnos">
              <option value="planilla">Orden de la planilla</option>
              <option value="apellido">Por apellido</option>
              <option value="asistencia">Menor asistencia primero</option>
            </select>
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

      {tab === 'clase' && <DetalleClase esAdmin={esAdmin} sesion={sesionPorId(sesionSel)!} alumnos={alumnos} registros={registros} onCambiar={(s) => ir({ s })} recargar={cargar} avisar={mostrar} />}

      {tab === 'dispositivos' && (
        <div className="tarjeta hud mt-4 p-5">
          <PedidosCelular pedidos={pedidosCel} avisar={mostrar} alCambiar={() => (cargarPedidos(), cargar())} />
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <FingerprintPattern className="mt-0.5 h-4 w-4 shrink-0 text-cian" />
            Cada alumno queda vinculado al primer celular con el que da el presente. Si cambia de teléfono, lo pasa solo con un código desde el anterior («Mi
            asistencia» → «Cambiar de celular»); si lo perdió, lo pide y aparece arriba para aprobar. También podés liberar el vínculo: el próximo registro crea uno
            nuevo.
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
      {tab === 'historial' && <Historial alumnos={alumnos} cambios={registros.length + dispositivos.length} />}
      {tab === 'cuentas' && esAdmin && <Cuentas avisar={mostrar} alCambiar={revisarCuentas} />}
      {aviso}
    </main>
  )
}

/** Cualquier cuenta de la cátedra cambia su propia contraseña (por ejemplo, la inicial que le dio un administrador). */
function MiClave({ avisar, onCerrar }: { avisar: Avisar; onCerrar: () => void }) {
  const api = useAdmin()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="entrada tarjeta hud mt-6 grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        if (clave.length < 8) return setError('Al menos 8 caracteres.')
        if (clave !== repetir) return setError('Las dos contraseñas no coinciden.')
        setEnviando(true)
        try {
          await api.cambiarMiClave(clave)
          avisar('Listo: tu contraseña quedó cambiada.')
          onCerrar()
        } catch (err) {
          setError(String((err as Error).message ?? err))
        } finally {
          setEnviando(false)
        }
      }}
    >
      <div className="sm:col-span-3">
        <div className="etiqueta">Cambiar mi contraseña</div>
        <p className="mt-1 text-sm text-slate-500">Elegí una propia, de al menos 8 caracteres. Desde ahora entrás con esta.</p>
      </div>
      <label className="text-sm text-slate-600">
        Nueva contraseña
        <input type="password" autoComplete="new-password" className="campo mt-1" value={clave} onChange={(e) => setClave(e.target.value)} required />
      </label>
      <label className="text-sm text-slate-600">
        Repetila
        <input type="password" autoComplete="new-password" className="campo mt-1" value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
      {error && <p className="text-sm text-rosa-oscuro sm:col-span-3">{error}</p>}
    </form>
  )
}

const hace = (ms: number | null) => {
  if (!ms) return ''
  const min = Math.round((Date.now() - ms) / 60e3)
  if (min < 60) return `hace ${Math.max(1, min)} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `el ${fechaCorta(hoyIso(ms))}`
}

/** Administradores: aprobar pedidos de acceso, habilitar emails por adelantado, roles y quitar acceso. */
function Cuentas({ avisar, alCambiar }: { avisar: Avisar; alCambiar: () => void }) {
  const api = useAdmin()
  const [datos, setDatos] = useState<{ yo: string; cuentas: Cuenta[]; solicitudes: Solicitud[] } | null>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('docente')
  const [clave, setClave] = useState(claveSugerida)
  const [ocupado, setOcupado] = useState(false)
  // Datos para pasarle a la persona después de crear la cuenta o cambiar la contraseña (se muestran una sola vez).
  const [credenciales, setCredenciales] = useState<{ email: string; clave: string; nueva: boolean } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [copiaManual, setCopiaManual] = useState(false)

  const cargar = useCallback(() => {
    api.cuentas().then(setDatos).catch((e) => setError(String(e.message ?? e)))
  }, [api])
  useEffect(cargar, [cargar])

  /** Ejecuta una acción de cuentas, recarga y avisa (los errores llegan ya en castellano). Devuelve si salió bien. */
  const hacer = async (accion: () => Promise<void>, ok: string) => {
    setOcupado(true)
    try {
      await accion()
      avisar(ok)
      cargar()
      alCambiar()
      return true
    } catch (e) {
      avisar(String((e as Error).message ?? e))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const crear = async () => {
    const e = email.trim().toLowerCase()
    if (!e || clave.length < 8) return
    if (await hacer(() => api.crearCuenta(e, rol, clave), `Cuenta creada: ${e}`)) {
      setCredenciales({ email: e, clave, nueva: true })
      setCopiado(false)
      setCopiaManual(false)
      setEmail('')
      setClave(claveSugerida())
    }
  }

  const cambiarClave = async (c: Cuenta) => {
    const nueva = claveSugerida()
    if (!confirm(`¿Cambiar la contraseña de ${c.email}?\n\nLa actual deja de funcionar y la nueva va a ser:\n${nueva}`)) return
    if (await hacer(() => api.cambiarClave(c.email, nueva), `Contraseña cambiada: ${c.email}`)) {
      setCredenciales({ email: c.email, clave: nueva, nueva: false })
      setCopiado(false)
      setCopiaManual(false)
    }
  }

  const textoCredenciales = credenciales
    ? `Acceso a CICLO (cátedra de Ginecología)\n${location.origin}/#/panel\nEmail: ${credenciales.email}\nContraseña: ${credenciales.clave}\nAl entrar, cambiala en «Mi contraseña».`
    : ''
  const copiar = async () => {
    if (!credenciales) return
    const ok = await copiarTexto(textoCredenciales)
    setCopiado(ok)
    // Si el navegador no deja copiar, mostramos el mensaje armado y ya seleccionado: alcanza con Ctrl+C.
    if (!ok) setCopiaManual(true)
  }

  if (error) return <p className="tarjeta mt-4 p-5 text-sm text-rosa-oscuro">No se pudieron cargar las cuentas: {error}</p>
  if (!datos) return <p className="tarjeta mt-4 p-5 font-mono text-sm text-slate-400">Cargando cuentas…</p>

  const estado = (c: Cuenta) =>
    !c.creada ? ['Sin cuenta todavía', 'bg-ambar-suave text-ambar'] : !c.confirmada ? ['Falta confirmar', 'bg-ambar-suave text-ambar'] : ['Activa', 'bg-vital-suave text-vital']

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        {credenciales && (
          <div className="entrada tarjeta border-vital/40 p-5">
            <div className="etiqueta flex items-center gap-1.5 !text-vital">
              <CircleCheck className="h-3.5 w-3.5" /> {credenciales.nueva ? 'Cuenta lista' : 'Contraseña nueva'} · pasale estos datos
            </div>
            <dl className="mt-3 grid gap-1 rounded-xl bg-rosa-claro p-3 font-mono text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Dirección</dt>
                <dd className="break-all text-tinta">{location.host}/#/panel</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Email</dt>
                <dd className="break-all text-tinta">{credenciales.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Contraseña</dt>
                <dd className="font-semibold text-tinta select-all">{credenciales.clave}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Se muestra sólo ahora. Pasáselo por un canal privado y pedile que la cambie al entrar, en «Mi contraseña».</p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primario !py-1.5 !text-xs" onClick={copiar}>
                {copiado ? '¡Copiado!' : 'Copiar los datos'}
              </button>
              <button className="btn btn-secundario !py-1.5 !text-xs" onClick={() => setCredenciales(null)}>
                Listo, ocultar
              </button>
            </div>
            {copiaManual && (
              <div className="mt-3">
                <p className="text-xs text-ambar">Este navegador no deja copiar solo: el mensaje ya está seleccionado, apretá Ctrl+C (o mantené apretado y «Copiar» en el celular).</p>
                <textarea
                  readOnly
                  rows={5}
                  className="campo mt-1 font-mono text-xs"
                  value={textoCredenciales}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}
          </div>
        )}

        <div className="tarjeta hud p-5">
          <div className="etiqueta flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Cuentas de la cátedra ({datos.cuentas.length})
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {datos.cuentas.map((c) => {
              const [texto, clases] = estado(c)
              const soyYo = c.email === datos.yo
              return (
                <li key={c.email} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-tinta">{c.email}</span>
                      {soyYo && <span className="text-xs text-slate-400">(vos)</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${c.rol === 'admin' ? 'bg-rosa-suave text-rosa-oscuro' : 'bg-slate-100 text-slate-600'}`}>
                        {c.rol === 'admin' ? 'Administrador' : 'Docente'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 ${clases}`}>{texto}</span>
                      {c.ultimoIngreso && <span>Último ingreso {hace(c.ultimoIngreso)}</span>}
                    </div>
                  </div>
                  {!c.creada ? (
                    <button
                      className="btn btn-primario !py-1.5 !text-xs"
                      disabled={ocupado}
                      onClick={() => {
                        setEmail(c.email)
                        setRol(c.rol)
                        document.getElementById('crear-email')?.focus()
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Crearle la cuenta
                    </button>
                  ) : (
                    <button className="btn btn-secundario !py-1.5 !text-xs" disabled={ocupado} onClick={() => cambiarClave(c)} title="Para una contraseña olvidada: genera una nueva">
                      <KeyRound className="h-3.5 w-3.5" /> Cambiar contraseña
                    </button>
                  )}
                  <button
                    className="btn btn-secundario !py-1.5 !text-xs"
                    disabled={ocupado}
                    onClick={() => hacer(() => api.cambiarRol(c.email, c.rol === 'admin' ? 'docente' : 'admin'), c.rol === 'admin' ? `${c.email} ya no es administrador` : `${c.email} ahora es administrador`)}
                  >
                    {c.rol === 'admin' ? 'Quitar administrador' : 'Hacer administrador'}
                  </button>
                  {!soyYo && (
                    <button
                      className="btn btn-secundario !py-1.5 !text-xs hover:!text-rosa-oscuro"
                      disabled={ocupado}
                      onClick={() => confirm(`¿Quitarle el acceso a ${c.email}? Ya no va a poder entrar al panel ni al proyector.`) && hacer(() => api.quitarCuenta(c.email), `Acceso quitado: ${c.email}`)}
                    >
                      Quitar acceso
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Pedidos de cuentas creadas por cuenta propia (ya no se ofrece crearlas así, pero si aparece alguno se resuelve acá). */}
        {datos.solicitudes.length > 0 && (
          <div className="tarjeta hud p-5">
            <div className="etiqueta flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> Pedidos de acceso ({datos.solicitudes.length})
            </div>
            <p className="mt-1 text-sm text-slate-500">Cuentas creadas sin pasar por un administrador. Aprobá sólo a quien conocés; si no sabés quién es, rechazalo.</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {datos.solicitudes.map((x) => (
                <li key={x.email} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-tinta">{x.email}</div>
                    <div className="text-xs text-slate-500">
                      Creada {hace(x.creadaEn)} · {x.confirmada ? 'email confirmado' : 'email sin confirmar'}
                    </div>
                  </div>
                  <button
                    className="btn btn-primario !py-1.5 !text-xs"
                    disabled={ocupado}
                    onClick={() =>
                      (x.confirmada || confirm(`¿Aprobar y confirmar ${x.email}? Hacelo sólo si sabés que esa persona creó la cuenta.`)) &&
                      hacer(() => api.habilitar(x.email, 'docente', !x.confirmada), `Cuenta aprobada: ${x.email}`)
                    }
                  >
                    Aprobar
                  </button>
                  <button
                    className="btn btn-secundario !py-1.5 !text-xs"
                    disabled={ocupado}
                    onClick={() => confirm(`¿Rechazar y borrar la cuenta ${x.email}?`) && hacer(() => api.rechazar(x.email), `Pedido rechazado: ${x.email}`)}
                  >
                    <UserX className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form
        className="tarjeta hud space-y-3 p-5 lg:sticky lg:top-24 lg:self-start"
        onSubmit={(e) => {
          e.preventDefault()
          crear()
        }}
      >
        <div className="etiqueta">Crear una cuenta</div>
        <p className="text-sm text-slate-500">Queda lista para entrar, sin correos de confirmación. Después le pasás el email y la contraseña.</p>
        <input id="crear-email" className="campo" type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="flex gap-2">
          {(['docente', 'admin'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRol(r)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${rol === r ? 'border-rosa bg-rosa-suave font-semibold text-rosa-oscuro' : 'border-linea bg-white text-slate-600'}`}
            >
              {r === 'admin' ? 'Administrador' : 'Docente'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Docente: proyector, presente manual y planilla. Administrador: además gestiona estas cuentas.</p>
        <label className="etiqueta block" htmlFor="crear-clave">
          Contraseña inicial
        </label>
        <div className="flex gap-2">
          <input id="crear-clave" className="campo font-mono text-sm" value={clave} onChange={(e) => setClave(e.target.value)} minLength={8} required />
          <button type="button" className="btn btn-secundario !px-3 !text-xs" onClick={() => setClave(claveSugerida())} title="Generar otra">
            Otra
          </button>
        </div>
        {clave.length > 0 && clave.length < 8 && <p className="text-xs text-ambar">Al menos 8 caracteres.</p>}
        <button className="btn btn-primario w-full" disabled={ocupado || !email.trim() || clave.length < 8}>
          <UserPlus className="h-4 w-4" /> Crear cuenta
        </button>
      </form>
    </div>
  )
}

const ACCIONES: Record<AccionAuditoria, { texto: string; color: string }> = {
  presente_manual: { texto: 'Presente manual', color: '#6b5cf6' },
  presente_quitado: { texto: 'Presente quitado', color: '#e0246f' },
  presente_cambiado: { texto: 'Presente modificado', color: '#c27c03' },
  celular_liberado: { texto: 'Celular liberado', color: '#b04aa6' },
  cuenta_habilitada: { texto: 'Cuenta habilitada', color: '#0e9f68' },
  cuenta_confirmada: { texto: 'Cuenta confirmada', color: '#0e9f68' },
  cuenta_quitada: { texto: 'Acceso quitado', color: '#e0246f' },
  rol_cambiado: { texto: 'Rol cambiado', color: '#c27c03' },
  cuenta_creada: { texto: 'Cuenta creada', color: '#0e9f68' },
  clave_cambiada: { texto: 'Contraseña cambiada', color: '#c27c03' },
  solicitud_rechazada: { texto: 'Pedido rechazado', color: '#e0246f' },
  clase_suspendida: { texto: 'Clase suspendida', color: '#c27c03' },
  clase_reanudada: { texto: 'Clase reanudada', color: '#0e9f68' },
  celular_cambiado: { texto: 'Celular cambiado', color: '#b04aa6' },
  cambio_celular_rechazado: { texto: 'Cambio de celular rechazado', color: '#e0246f' },
}

/** Quién cambió qué y cuándo. Lo escribe la base (trigger), así que no depende de que la app lo registre. */
function Historial({ alumnos, cambios }: { alumnos: Alumno[]; cambios: number }) {
  const api = useAdmin()
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.auditoria().then(setEventos).catch((e) => setError(String(e.message ?? e)))
  }, [api, cambios])
  const nombre = useMemo(() => new Map(alumnos.map((a) => [a.libreta, a.nombre])), [alumnos])

  return (
    <div className="tarjeta hud mt-4 p-5">
      <p className="flex items-start gap-2 text-sm text-slate-600">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-cian" />
        Cada presente cargado o quitado a mano, cada celular liberado y cada cambio de cuentas de la cátedra queda registrado con quién lo hizo y
        cuándo. Los presentes por QR no aparecen acá: se ven en «Por clase».
      </p>
      {error && <p className="mt-4 text-sm text-rosa-oscuro">No se pudo cargar el historial: {error}</p>}
      {!eventos && !error && <p className="mt-4 font-mono text-sm text-slate-400">Cargando…</p>}
      {eventos && eventos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Todavía no hay cambios manuales.</p>}
      {eventos && eventos.length > 0 && (
        <ul className="mt-4 max-h-[60vh] divide-y divide-slate-100 overflow-auto">
          {eventos.map((e, i) => {
            const a = ACCIONES[e.accion]
            return (
              <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="w-28 shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                  {fechaCorta(hoyIso(e.en))} {horaArt(e.en).slice(0, 5)}
                </span>
                <span className="w-36 shrink-0 font-medium" style={{ color: a.color }}>
                  {a.texto}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-tinta">{e.cuenta ?? (e.libreta ? (nombre.get(e.libreta) ?? e.libreta) : '')}</span>
                  {e.sesionId && <span className="text-slate-500"> · clase del {fechaCorta(e.sesionId)}</span>}
                  {e.detalle && <span className="block text-xs text-slate-400">{e.cuenta ? (e.detalle === 'admin' ? 'como administrador' : e.detalle === 'docente' ? 'como docente' : e.detalle) : e.detalle}</span>}
                </span>
                <span className="text-xs text-slate-400">{e.por ?? 'sistema'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
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

/** Alumnos sin el celular anterior que piden pasar su presente a uno nuevo. Aprobar mueve el vínculo al instante. */
function PedidosCelular({ pedidos, avisar, alCambiar }: { pedidos: PedidoCelular[]; avisar: Avisar; alCambiar: () => void }) {
  const api = useAdmin()
  const [ocupado, setOcupado] = useState<string | null>(null)
  if (!pedidos.length) return null
  const dia = (ms: number) => fechaCorta(hoyIso(ms))
  const resolver = async (p: PedidoCelular, aprobar: boolean) => {
    if (
      aprobar &&
      !confirm(`¿Pasar el presente de ${p.nombre} al celular nuevo?\n\nAprobalo sólo si sabés que lo pidió el alumno (en persona o por un canal de la cátedra). El celular anterior deja de servir.`)
    )
      return
    if (!aprobar && !confirm(`¿Rechazar el pedido de ${p.nombre}? Sigue con su celular actual.`)) return
    setOcupado(p.libreta)
    try {
      await api.resolverCambio(p.libreta, aprobar)
      avisar(aprobar ? `Celular nuevo aprobado: ${p.nombre.split(',')[0]}` : `Pedido rechazado: ${p.nombre.split(',')[0]}`)
      alCambiar()
    } catch (e) {
      avisar(String((e as Error).message ?? e))
    } finally {
      setOcupado(null)
    }
  }
  return (
    <div className="mb-5 rounded-2xl border border-ambar/30 bg-ambar-suave/60 p-4">
      <div className="etiqueta flex items-center gap-1.5 !text-ambar">
        <Smartphone className="h-3.5 w-3.5" /> Pedidos de cambio de celular ({pedidos.length})
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Alumnos sin el celular anterior (perdido, roto o con los datos borrados). Aprobá sólo si sabés que lo pidió el alumno: si no, alguien podría dar presente por
        otro.
      </p>
      <ul className="mt-2 divide-y divide-ambar/20">
        {pedidos.map((p) => (
          <li key={p.libreta} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-tinta">{p.nombre}</div>
              <div className="text-xs text-slate-500">
                {p.libreta} · pedido {hace(p.pedidoEn)}
                {p.vinculadoDesde ? ` · celular actual desde el ${dia(p.vinculadoDesde)}` : ''}
                {p.ultimoUso ? ` · lo usó por última vez el ${dia(p.ultimoUso)}` : ' · todavía no dio presente con el actual'}
              </div>
            </div>
            <button className="btn btn-primario !py-1.5 !text-xs" disabled={ocupado === p.libreta} onClick={() => resolver(p, true)}>
              Aprobar
            </button>
            <button className="btn btn-secundario !py-1.5 !text-xs" disabled={ocupado === p.libreta} onClick={() => resolver(p, false)}>
              Rechazar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const MOTIVOS_SUSPENSION = ['Paro docente', 'Feriado o asueto', 'Clase reprogramada']

/**
 * Suspender una clase (paro, feriado…): no se toma asistencia y no cuenta para la regularidad de nadie.
 * Sólo administradores; los demás ven el aviso. Es reversible: los presentes que hubiera se conservan.
 */
function SuspensionClase({ sesion, esAdmin, presentes, avisar }: { sesion: Sesion; esAdmin: boolean; presentes: number; avisar: Avisar }) {
  const api = useAdmin()
  const { ventanas, recargar } = useVentanas()
  const v = ventanas?.[sesion.id]
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    setAbierto(false)
    setMotivo('')
  }, [sesion.id])

  const aplicar = async (m: string | null) => {
    setOcupado(true)
    try {
      await api.suspenderClase(sesion.id, m)
      recargar()
      // Que se enteren las demás partes del panel (contadores, barras, clase de hoy).
      window.dispatchEvent(new Event('ciclo:cambio'))
      setAbierto(false)
      setMotivo('')
      avisar(m ? `Clase del ${fechaCorta(sesion.fecha)} suspendida: ya no cuenta para la regularidad.` : `Clase del ${fechaCorta(sesion.fecha)} reanudada: vuelve a contar.`)
    } catch (e) {
      avisar(String((e as Error).message ?? e))
    } finally {
      setOcupado(false)
    }
  }

  if (!v) return null
  if (v.suspendida)
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-ambar/30 bg-ambar-suave px-4 py-3">
        <CalendarOff className="h-5 w-5 shrink-0 text-ambar" />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-tinta">Clase suspendida</span>
          <span className="text-slate-600"> · {v.motivoSuspension}. No se puede dar presente y no cuenta para la regularidad.</span>
          {presentes > 0 && (
            <span className="block text-xs text-slate-500">
              {presentes === 1 ? 'El presente que tenía se guarda' : `Los ${presentes} presentes que tenía se guardan`}: si la reanudás, vuelve{presentes === 1 ? '' : 'n'} a contar.
            </span>
          )}
        </div>
        {esAdmin && (
          <button className="btn btn-secundario !py-1.5 !text-xs" disabled={ocupado} onClick={() => confirm(`¿Reanudar la clase del ${fechaCorta(sesion.fecha)}? Vuelve a contar para la regularidad.`) && aplicar(null)}>
            Reanudar la clase
          </button>
        )}
      </div>
    )
  if (!esAdmin) return null
  if (!abierto)
    return (
      <div className="flex justify-end border-b border-linea px-4 py-2">
        <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-ambar" onClick={() => setAbierto(true)}>
          <CalendarOff className="h-3.5 w-3.5" /> Suspender esta clase
        </button>
      </div>
    )
  return (
    <form
      className="entrada space-y-3 border-b border-ambar/30 bg-ambar-suave/60 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (motivo.trim()) aplicar(motivo)
      }}
    >
      <div>
        <div className="etiqueta flex items-center gap-1.5 !text-ambar">
          <CalendarOff className="h-3.5 w-3.5" /> Suspender la clase del {diaSemana(sesion.fecha).toLowerCase()} {fechaCorta(sesion.fecha)}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          No se va a poder dar presente y deja de contar para la regularidad de todos: ni como dictada ni como clase por venir. Los alumnos ven el motivo en la app.
          {presentes > 0 && (presentes === 1 ? ' Tiene 1 presente: se guarda, pero no cuenta mientras esté suspendida.' : ` Tiene ${presentes} presentes: se guardan, pero no cuentan mientras esté suspendida.`)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS_SUSPENSION.map((m) => (
          <button key={m} type="button" onClick={() => setMotivo(m)} className={`rounded-full border px-3 py-1 text-xs transition ${motivo === m ? 'border-ambar bg-white font-semibold text-ambar' : 'border-linea bg-white text-slate-600'}`}>
            {m}
          </button>
        ))}
      </div>
      <input className="campo" placeholder="Motivo (lo ven los alumnos)" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
      <div className="flex gap-2">
        <button className="btn btn-primario !py-2" disabled={ocupado || !motivo.trim()}>
          {ocupado ? 'Suspendiendo…' : 'Suspender la clase'}
        </button>
        <button type="button" className="btn btn-secundario !py-2" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function DetalleClase({ esAdmin, sesion, alumnos, registros, onCambiar, recargar, avisar }: { esAdmin: boolean; sesion: Sesion; alumnos: Alumno[]; registros: Registro[]; onCambiar: (id: string) => void; recargar: () => void; avisar: Avisar }) {
  const api = useAdmin()
  const [verAusentes, setVerAusentes] = useState(false)
  const regs = registros.filter((r) => r.sesionId === sesion.id).sort((a, b) => a.marcadoEn - b.marcadoEn)
  const presentes = new Set(regs.map((r) => r.libreta))
  const ausentes = alumnos.filter((a) => !presentes.has(a.libreta))
  const porAlumno = new Map(alumnos.map((a) => [a.libreta, a]))

  const [generando, setGenerando] = useState(false)
  const exportarPdf = async () => {
    setGenerando(true)
    try {
      const { listaClasePdf, descargar } = await import('../lib/pdf')
      descargar(await listaClasePdf({ sesion, alumnos, registros }))
    } catch (e) {
      avisar(`No se pudo generar el PDF: ${String((e as Error).message ?? e)}`)
    } finally {
      setGenerando(false)
    }
  }

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
      <SuspensionClase sesion={sesion} esAdmin={esAdmin} presentes={regs.length} avisar={avisar} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea p-4">
        <SelectorSesion valor={sesion.id} onCambiar={onCambiar} />
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-tinta">
            <span className="text-vital">{regs.length}</span> presentes · <span className="text-rosa">{ausentes.length}</span> ausentes
          </span>
          <button className="btn btn-secundario !py-2" onClick={() => setVerAusentes((x) => !x)}>
            {verAusentes ? 'Ver presentes' : 'Ver ausentes'}
          </button>
          <button className="btn btn-primario !py-2" onClick={exportarPdf} disabled={generando}>
            <FileText className="h-4 w-4" /> {generando ? 'Generando…' : 'PDF'}
          </button>
          <button className="btn btn-secundario !px-3 !py-2" onClick={exportar} title="Los mismos datos en CSV, para Excel">
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
