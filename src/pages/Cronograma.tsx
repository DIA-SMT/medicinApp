import { ArrowDown, EyeOff, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Agendar } from '../components/Agendar'
import { TarjetaSesion } from '../components/TarjetaSesion'
import { IconoArea } from '../components/ui'
import { CATEDRA } from '../lib/config'
import { AREAS, CRONOGRAMA, type Area } from '../lib/cronograma'
import { useNow, useVentanas } from '../lib/hooks'
import { clasesVigentes, cuenta, diaSemana, estadoClase, fechaCorta, hmArt, infoVentana, instante, sesionVigente, suspendida, ventanaDefault } from '../lib/time'
import { Pie } from './Pie'

type Filtro = Area | 'parciales' | 'todas'

const leerOcultas = () => {
  try {
    return localStorage.getItem('ciclo:cronograma:ocultar-dictadas') === '1'
  } catch {
    return false
  }
}

export function Cronograma() {
  const now = useNow(1000)
  const { ventanas } = useVentanas()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [ocultarDictadas, setOcultarDictadas] = useState(leerOcultas)
  useEffect(() => {
    try {
      localStorage.setItem('ciclo:cronograma:ocultar-dictadas', ocultarDictadas ? '1' : '0')
    } catch {
      /* sin almacenamiento: la preferencia dura lo que la pestaña */
    }
  }, [ocultarDictadas])

  const inicio = instante(CRONOGRAMA[0].fecha, '00:00')
  const fin = instante(CRONOGRAMA[CRONOGRAMA.length - 1].fecha, '23:59')
  const avance = Math.min(1, Math.max(0, (now - inicio) / (fin - inicio)))
  const dictadas = CRONOGRAMA.filter((s) => estadoClase(s, now) === 'dictada' && !suspendida(ventanas, s.id)).length
  const vigentes = clasesVigentes(ventanas).length
  const proxima = sesionVigente(ventanas, now)
  const infoProx = proxima && infoVentana(proxima.fecha, ventanas?.[proxima.id] ?? ventanaDefault(), now)

  const areasPresentes = [...new Set(CRONOGRAMA.flatMap((s) => s.temas.map((t) => t.area)))]
  const visibles = CRONOGRAMA.filter(
    (s) =>
      (!ocultarDictadas || estadoClase(s, now) !== 'dictada') &&
      (filtro === 'todas' || (filtro === 'parciales' ? !!s.parcial : s.temas.some((t) => t.area === filtro))),
  )

  const irAProxima = () => {
    if (!proxima) return
    setFiltro('todas')
    requestAnimationFrame(() => document.getElementById(`clase-${proxima.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const chip = (valor: Filtro, texto: React.ReactNode, color?: string) => (
    <button
      key={valor}
      onClick={() => setFiltro(valor)}
      aria-pressed={filtro === valor}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${filtro === valor ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white text-slate-600 hover:border-slate-300 hover:text-tinta'}`}
      style={filtro === valor && color ? { background: color, borderColor: color } : undefined}
    >
      {texto}
    </button>
  )

  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="etiqueta mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-gradient-to-r from-rosa to-cian" />
          {CATEDRA.cursado} · {CATEDRA.periodo}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-tinta sm:text-5xl">Cronograma de clases teóricas</h1>
            <p className="mt-3 max-w-2xl text-slate-600">Miércoles y viernes a las 8:00. El registro de asistencia abre a las 07:30 y cierra a las 08:10.</p>
          </div>
          <Agendar ventanas={ventanas} />
        </div>

        <div className="tarjeta hud mt-8 p-5">
          <div className="flex items-center justify-between font-mono text-xs text-slate-500">
            <span>{fechaCorta(CRONOGRAMA[0].fecha)}</span>
            <span className="text-tinta">
              {dictadas}/{vigentes} clases{vigentes < CRONOGRAMA.length ? ` (${CRONOGRAMA.length - vigentes} suspendida${CRONOGRAMA.length - vigentes === 1 ? '' : 's'})` : ''} · {Math.round(avance * 100)} % del cursado
            </span>
            <span>{fechaCorta(CRONOGRAMA[CRONOGRAMA.length - 1].fecha)}</span>
          </div>
          <div className="relative mt-3 h-2 rounded-full bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rosa via-violeta to-cian" style={{ width: `${avance * 100}%` }} />
            {CRONOGRAMA.map((s) => {
              const pos = (instante(s.fecha, '08:00') - inicio) / (fin - inicio)
              return (
                <button
                  key={s.id}
                  onClick={() => document.getElementById(`clase-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  title={`${fechaCorta(s.fecha)} · ${s.temas[0].titulo}${s.parcial ? ` · ${s.parcial}` : ''}`}
                  aria-label={`Ir a la clase del ${fechaCorta(s.fecha)}`}
                  className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition hover:scale-150 ${s.parcial ? 'bg-ambar' : pos <= avance ? 'bg-tinta' : 'bg-slate-300'}`}
                  style={{ left: `${pos * 100}%` }}
                />
              )
            })}
          </div>
          {proxima && infoProx && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-tinta">
                  {infoProx.estado === 'abierta' ? 'Ahora' : 'Próxima'}: {diaSemana(proxima.fecha)} {fechaCorta(proxima.fecha)}
                </span>{' '}
                ·{' '}
                {infoProx.estado === 'abierta' ? (
                  <span className="text-vital">registro abierto, cierra en {cuenta(infoProx.cierra - now)}</span>
                ) : (
                  <>
                    el registro abre a las {hmArt(infoProx.abre)} · faltan <span className="font-mono text-tinta tabular-nums">{cuenta(infoProx.abre - now)}</span>
                  </>
                )}
              </div>
              <button className="btn btn-secundario !py-1.5 !text-xs" onClick={irAProxima}>
                <ArrowDown className="h-3.5 w-3.5" /> Ir a la próxima
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {chip('todas', 'Todas')}
          {chip('parciales', 'Parciales', '#c27c03')}
          {areasPresentes.map((a) =>
            chip(
              a,
              <>
                <IconoArea area={a} className="h-3.5 w-3.5" color={filtro === a ? '#fff' : undefined} />
                {AREAS[a].label}
              </>,
              AREAS[a].color,
            ),
          )}
          <button onClick={() => setOcultarDictadas((x) => !x)} className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-tinta">
            {ocultarDictadas ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {ocultarDictadas ? 'Mostrar las ya dictadas' : 'Ocultar las ya dictadas'}
          </button>
        </div>

        <ol className="relative mt-8 space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[0.6rem] before:w-px before:bg-gradient-to-b before:from-rosa/50 before:via-violeta/30 before:to-cian/50 sm:before:left-[7.5rem]">
          {visibles.map((s) => {
            const e = estadoClase(s, now, ventanas)
            const activo = (e === 'hoy' || e === 'proxima') && !suspendida(ventanas, s.id)
            return (
              <li key={s.id} id={`clase-${s.id}`} className="al-ver relative grid scroll-mt-28 has-[details[open]]:z-20 gap-4 pl-8 sm:grid-cols-[6.5rem_1fr] sm:gap-10 sm:pl-0">
                <div className="hidden pt-5 text-right sm:block">
                  <div className="font-mono text-xs text-slate-400">Nº {String(s.n).padStart(2, '0')}</div>
                  {s.parcial && <div className="mt-1 font-mono text-[0.6rem] tracking-wider text-ambar uppercase">{s.parcial}</div>}
                </div>
                <span
                  className={`absolute top-6 left-[0.6rem] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow sm:left-[7.5rem] ${activo ? 'bg-rosa shadow-[0_0_0_6px_rgb(224_36_111/0.15)]' : e === 'dictada' ? 'bg-tinta' : 'bg-slate-300'}`}
                >
                  {activo && <span className="animate-latido absolute inset-0 rounded-full bg-rosa" />}
                </span>
                <TarjetaSesion sesion={s} ventanas={ventanas} />
              </li>
            )
          })}
          {visibles.length === 0 && <li className="pl-8 text-sm text-slate-500 sm:pl-[8.5rem]">No hay clases con ese filtro.</li>}
        </ol>
      </div>
      <Pie />
    </main>
  )
}
