import { TarjetaSesion } from '../components/TarjetaSesion'
import { CATEDRA } from '../lib/config'
import { CRONOGRAMA } from '../lib/cronograma'
import { useNow } from '../lib/hooks'
import { estadoClase, fechaCorta, instante } from '../lib/time'
import { Pie } from './Pie'

export function Cronograma() {
  const now = useNow(60_000)
  const inicio = instante(CRONOGRAMA[0].fecha, '00:00')
  const fin = instante(CRONOGRAMA[CRONOGRAMA.length - 1].fecha, '23:59')
  const avance = Math.min(1, Math.max(0, (now - inicio) / (fin - inicio)))
  const dictadas = CRONOGRAMA.filter((s) => estadoClase(s, now) === 'dictada').length

  return (
    <main>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="etiqueta mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-gradient-to-r from-rosa to-cian" />
          {CATEDRA.cursado} · {CATEDRA.periodo}
        </div>
        <h1 className="font-display text-4xl font-bold text-tinta sm:text-5xl">Cronograma de clases teóricas</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Miércoles y viernes. El registro de asistencia se habilita cada mañana y cierra a la hora de corte.</p>

        <div className="tarjeta hud mt-8 p-5">
          <div className="flex items-center justify-between font-mono text-xs text-slate-500">
            <span>{fechaCorta(CRONOGRAMA[0].fecha)}</span>
            <span className="text-tinta">
              {dictadas}/{CRONOGRAMA.length} clases · {Math.round(avance * 100)} % del cursado
            </span>
            <span>{fechaCorta(CRONOGRAMA[CRONOGRAMA.length - 1].fecha)}</span>
          </div>
          <div className="relative mt-3 h-2 rounded-full bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rosa via-violeta to-cian" style={{ width: `${avance * 100}%` }} />
            {CRONOGRAMA.map((s) => {
              const pos = (instante(s.fecha, '08:00') - inicio) / (fin - inicio)
              return (
                <span
                  key={s.id}
                  title={`${fechaCorta(s.fecha)}${s.parcial ? ` · ${s.parcial}` : ''}`}
                  className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${s.parcial ? 'bg-ambar' : pos <= avance ? 'bg-tinta' : 'bg-slate-300'}`}
                  style={{ left: `${pos * 100}%` }}
                />
              )
            })}
          </div>
        </div>

        <ol className="relative mt-12 space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[0.6rem] before:w-px before:bg-gradient-to-b before:from-rosa/50 before:via-violeta/30 before:to-cian/50 sm:before:left-[7.5rem]">
          {CRONOGRAMA.map((s) => {
            const e = estadoClase(s, now)
            const activo = e === 'hoy' || e === 'proxima'
            return (
              <li key={s.id} className="al-ver relative grid gap-4 pl-8 sm:grid-cols-[6.5rem_1fr] sm:gap-10 sm:pl-0">
                <div className="hidden pt-5 text-right sm:block">
                  <div className="font-mono text-xs text-slate-400">Nº {String(s.n).padStart(2, '0')}</div>
                </div>
                <span
                  className={`absolute top-6 left-[0.6rem] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow sm:left-[7.5rem] ${activo ? 'bg-rosa shadow-[0_0_0_6px_rgb(224_36_111/0.15)]' : e === 'dictada' ? 'bg-tinta' : 'bg-slate-300'}`}
                >
                  {activo && <span className="animate-latido absolute inset-0 rounded-full bg-rosa" />}
                </span>
                <TarjetaSesion sesion={s} />
              </li>
            )
          })}
        </ol>
      </div>
      <Pie />
    </main>
  )
}
