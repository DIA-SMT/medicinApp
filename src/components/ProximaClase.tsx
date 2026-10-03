import { Printer, Projector, ScanLine, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { docentesSesion, type Sesion } from '../lib/cronograma'
import { esCatedra, useNow, useVentanas } from '../lib/hooks'
import { diaSemana, estadoClase, fechaLarga, hmArt, infoVentana, partesCuenta, ventanaDefault } from '../lib/time'
import { Agendar } from './Agendar'
import { ChipArea, ChipParcial, PildoraEstado } from './ui'

function Digito({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="min-w-[3.6rem] rounded-xl border border-linea bg-slate-50 px-2 py-2 text-center font-mono text-3xl font-semibold text-tinta tabular-nums shadow-[inset_0_-10px_20px_-16px_rgb(10_162_192/0.5)] sm:text-4xl">
        {String(v).padStart(2, '0')}
      </div>
      <span className="mt-1.5 font-mono text-[0.6rem] tracking-[0.2em] text-slate-400 uppercase">{l}</span>
    </div>
  )
}

export function ProximaClase({ sesion }: { sesion: Sesion }) {
  const now = useNow(1000)
  const { ventanas } = useVentanas()
  const v = ventanas?.[sesion.id] ?? ventanaDefault()
  const info = infoVentana(sesion.fecha, v, now)
  const ec = estadoClase(sesion, now)
  const p = partesCuenta((info.estado === 'programada' ? info.abre : info.cierra) - now)

  return (
    <div className="tarjeta hud relative p-6 sm:p-7">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-rosa/10 blur-3xl" />
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <span className="etiqueta">
          {ec === 'hoy' ? 'Hoy' : 'Próxima clase'} · Nº {String(sesion.n).padStart(2, '0')}
        </span>
        <PildoraEstado estado={info.estado} />
      </div>

      <div className="relative mt-5 font-mono text-sm font-medium text-cian-oscuro">
        {diaSemana(sesion.fecha)} · {fechaLarga(sesion.fecha).split(', ')[1] ?? fechaLarga(sesion.fecha)}
      </div>
      <h3 className="relative mt-2 font-display text-2xl leading-tight font-semibold text-tinta sm:text-[1.7rem]">{sesion.temas.map((t) => t.titulo).join(' + ')}</h3>
      {sesion.temas.some((t) => t.detalle) && <p className="relative mt-1.5 text-sm text-slate-500">{sesion.temas.map((t) => t.detalle).filter(Boolean).join(' · ')}</p>}

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        {[...new Set(sesion.temas.map((t) => t.area))].map((a) => (
          <ChipArea key={a} area={a} />
        ))}
        {sesion.parcial && <ChipParcial texto={sesion.parcial} />}
      </div>
      <div className="relative mt-4 flex items-center gap-2 text-sm text-slate-600">
        <Stethoscope className="h-4 w-4 text-rosa" />
        {docentesSesion(sesion)}
      </div>

      <div className="relative mt-6 border-t border-linea pt-5">
        <div className="etiqueta mb-3">
          {info.estado === 'programada' && `Registro abre a las ${hmArt(info.abre)}`}
          {info.estado === 'abierta' && `Registro cierra a las ${hmArt(info.cierra)}`}
          {info.estado === 'cerrada' && `Registro cerrado a las ${hmArt(info.cierra)}`}
        </div>
        {info.estado !== 'cerrada' ? (
          <div className="flex gap-2.5">
            {p.d > 0 && <Digito v={p.d} l="días" />}
            <Digito v={p.h} l="horas" />
            <Digito v={p.m} l="min" />
            <Digito v={p.s} l="seg" />
          </div>
        ) : (
          <p className="text-sm text-slate-500">La asistencia de esta clase quedó consolidada en la planilla de la cátedra.</p>
        )}
      </div>

      <div className="relative mt-6 flex flex-wrap gap-2">
        {info.estado === 'abierta' && (
          <a href="/p/" className="btn btn-primario">
            <ScanLine className="h-4 w-4" /> Dar presente
          </a>
        )}
        <Agendar sesion={sesion} />
        {esCatedra() && (
          <>
            <Link to={`/aula/${sesion.id}`} className="btn btn-secundario" title="Sólo para la cátedra">
              <Projector className="h-4 w-4" /> Proyectar QR
            </Link>
            <Link to={`/poster/${sesion.id}`} className="btn btn-secundario" title="Sólo para la cátedra">
              <Printer className="h-4 w-4" /> Póster
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
