import { Check, Printer, Projector, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AREAS, type Sesion } from '../lib/cronograma'
import { useNow } from '../lib/hooks'
import { diaSemana, estadoClase, fechaCorta } from '../lib/time'
import { ChipArea, ChipParcial, IconoArea } from './ui'

const ETIQUETA = { dictada: 'Dictada', hoy: 'Hoy', proxima: 'Próxima', futura: '' } as const

export function TarjetaSesion({ sesion, compacta }: { sesion: Sesion; compacta?: boolean }) {
  const now = useNow(60_000)
  const e = estadoClase(sesion, now)
  const color = AREAS[sesion.temas[0].area].color
  const destacada = e === 'hoy' || e === 'proxima'

  return (
    <article
      className={`tarjeta group relative h-full overflow-hidden p-5 transition duration-300 hover:-translate-y-0.5 ${e === 'dictada' ? 'opacity-70 hover:opacity-100' : ''} ${destacada ? 'hud' : ''}`}
      style={destacada ? { boxShadow: `0 0 0 1px ${color}55, 0 18px 40px -24px ${color}` } : undefined}
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[0.65rem] tracking-[0.2em] text-slate-400 uppercase">
            {diaSemana(sesion.fecha)} · Nº {String(sesion.n).padStart(2, '0')}
          </div>
          <div className="font-display text-2xl font-semibold text-tinta tabular-nums">{fechaCorta(sesion.fecha)}</div>
        </div>
        {e === 'dictada' ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-vital-suave text-vital">
            <Check className="h-4 w-4" />
          </span>
        ) : ETIQUETA[e] ? (
          <span className="rounded-full px-2.5 py-1 font-mono text-[0.6rem] font-medium tracking-[0.18em] uppercase" style={{ color, background: `${color}12`, border: `1px solid ${color}55` }}>
            {ETIQUETA[e]}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {sesion.temas.map((t) => (
          <div key={t.titulo} className="flex gap-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-linea bg-slate-50">
              <IconoArea area={t.area} />
            </div>
            <div className="min-w-0">
              <h3 className="leading-snug font-semibold text-tinta">{t.titulo}</h3>
              {!compacta && t.detalle && <p className="mt-0.5 text-sm text-slate-500">{t.detalle}</p>}
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Stethoscope className="h-3 w-3" /> {t.docente}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!compacta ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(sesion.temas.map((t) => t.area))].map((a) => (
              <ChipArea key={a} area={a} />
            ))}
            {sesion.parcial && <ChipParcial texto={sesion.parcial} />}
          </div>
          {e !== 'dictada' && (
            <div className="flex gap-1.5 opacity-80 transition group-hover:opacity-100">
              <Link to={`/aula/${sesion.id}`} className="btn btn-secundario !px-2.5 !py-1.5 !text-xs" title="Proyectar QR dinámico">
                <Projector className="h-3.5 w-3.5" /> Proyectar
              </Link>
              <Link to={`/poster/${sesion.id}`} className="btn btn-secundario !px-2.5 !py-1.5 !text-xs" title="Póster imprimible">
                <Printer className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      ) : (
        sesion.parcial && (
          <div className="mt-4">
            <ChipParcial texto={sesion.parcial} />
          </div>
        )
      )}
    </article>
  )
}
