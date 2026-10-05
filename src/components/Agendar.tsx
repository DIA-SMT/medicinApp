import { CalendarPlus, ChevronDown, Download } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { descargarIcs, enlaceGoogle } from '../lib/agenda'
import { CRONOGRAMA, type Sesion } from '../lib/cronograma'
import { hoyIso, suspendida, type Ventana } from '../lib/time'

/**
 * «Agendar»: una clase (Google Calendar o archivo .ics) o todas las que faltan (.ics con recordatorio).
 * Es un <details> nativo: funciona con teclado y sin estado; se cierra al tocar afuera.
 */
export function Agendar({ sesion, className = '', compacto, derecha, ventanas }: { sesion?: Sesion; className?: string; compacto?: boolean; derecha?: boolean; ventanas?: Record<string, Ventana> | null }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const fuera = (e: PointerEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute('open')
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [])

  // Las clases suspendidas no se agendan.
  const restantes = CRONOGRAMA.filter((s) => s.fecha >= hoyIso() && !suspendida(ventanas, s.id))
  const cerrar = () => ref.current?.removeAttribute('open')

  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary className={`btn btn-secundario cursor-pointer list-none [&::-webkit-details-marker]:hidden ${compacto ? '!px-2.5 !py-1.5 !text-xs' : ''}`}>
        <CalendarPlus className={compacto ? 'h-3.5 w-3.5 text-cian' : 'h-4 w-4 text-cian'} />
        {sesion ? 'Agendar' : 'Agendar las clases'}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </summary>
      <div className={`entrada absolute z-30 mt-2 w-64 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-linea bg-white p-1.5 text-sm shadow-xl ${derecha ? 'right-0' : 'left-0'}`}>
        {sesion ? (
          <>
            <a href={enlaceGoogle(sesion)} target="_blank" rel="noopener" onClick={cerrar} className="block rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
              Google Calendar
              <span className="block text-xs text-slate-400">Se abre con los datos de la clase</span>
            </a>
            <button onClick={() => (descargarIcs([sesion], `ginecologia-teorica-${sesion.n}.ics`), cerrar())} className="block w-full rounded-xl px-3 py-2 text-left text-tinta hover:bg-slate-50">
              iPhone, Outlook u otro
              <span className="block text-xs text-slate-400">Descarga un archivo de calendario</span>
            </button>
          </>
        ) : null}
        {restantes.length > 0 && (
          <button
            onClick={() => (descargarIcs(restantes, 'ginecologia-teoricas-2026.ics'), cerrar())}
            className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-tinta hover:bg-slate-50 ${sesion ? 'mt-1 border-t border-linea pt-2.5' : ''}`}
          >
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-cian" />
            <span>
              {restantes.length === 1 ? 'La última clase' : `Las ${restantes.length} clases que faltan`}
              <span className="block text-xs text-slate-400">Un archivo con todas, con aviso 40 min antes</span>
            </span>
          </button>
        )}
      </div>
    </details>
  )
}
