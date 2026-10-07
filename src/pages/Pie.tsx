import { SelloUNT, UteroMark } from '../components/Logo'
import { CATEDRA, SEDE } from '../lib/config'

export function Pie() {
  return (
    <footer className="no-print border-t border-linea bg-white/70">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-4">
          <SelloUNT className="h-14 w-auto" />
          <div>
            <div className="font-display font-semibold text-tinta">Cátedra de {CATEDRA.materia}</div>
            <div className="text-sm font-medium text-rosa-oscuro">{CATEDRA.titularCompleta}</div>
            <div className="text-sm text-slate-500">
              {CATEDRA.facultad} · {CATEDRA.universidad}
            </div>
            <div className="text-xs text-slate-400">{SEDE.direccion}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[0.65rem] tracking-[0.2em] text-slate-400 uppercase">
          <UteroMark className="h-5 w-5" />
          Ginecoapp · asistencia a teóricas · 2026
        </div>
      </div>
    </footer>
  )
}
