import { CalendarPlus, ChevronDown, ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { enlaceGoogle, enlaceOutlook } from '../lib/agenda'
import { CRONOGRAMA, type Sesion } from '../lib/cronograma'
import { diaSemana, fechaCorta, hoyIso, suspendida, type Ventana } from '../lib/time'

/**
 * «Agendar»: abre Google Calendar (u Outlook) con la clase ya cargada; no se descarga ningún archivo.
 * Con una clase, esa; sin clase, la lista de las que faltan para agendarlas de a una.
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
      <div className={`entrada absolute z-30 mt-2 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-linea bg-white p-1.5 text-sm shadow-xl ${sesion ? 'w-64' : 'w-80'} ${derecha ? 'right-0' : 'left-0'}`}>
        {sesion ? (
          <>
            <a href={enlaceGoogle(sesion)} target="_blank" rel="noopener" onClick={cerrar} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
              <span>
                Google Calendar
                <span className="block text-xs text-slate-400">Se abre con la clase ya cargada</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
            </a>
            <a href={enlaceOutlook(sesion)} target="_blank" rel="noopener" onClick={cerrar} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
              <span>
                Outlook / Hotmail
                <span className="block text-xs text-slate-400">Para cuentas de Microsoft</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
            </a>
          </>
        ) : restantes.length ? (
          <>
            <p className="px-3 pt-1.5 pb-1 text-xs text-slate-500">Tocá cada clase: se abre Google Calendar con todo cargado y la guardás.</p>
            <ul className="max-h-80 overflow-auto">
              {restantes.map((s) => (
                <li key={s.id}>
                  <a href={enlaceGoogle(s)} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2 text-tinta hover:bg-slate-50">
                    <span className="w-12 shrink-0 font-mono text-xs text-slate-500">
                      {diaSemana(s.fecha).slice(0, 3)} {fechaCorta(s.fecha)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.temas.map((t) => t.titulo).join(' + ')}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="px-3 py-2 text-slate-500">Ya no quedan clases por agendar.</p>
        )}
      </div>
    </details>
  )
}
