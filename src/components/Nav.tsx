import { CalendarDays, House, LockKeyhole, ScanLine } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { Marca } from './Logo'

// «Aula» (proyector) y «Panel» se agrupan en «Cátedra»: el panel tiene el acceso al proyector de la clase del día.
const enlaces = [
  { to: '/', texto: 'Inicio', icono: House, fin: true },
  { to: '/cronograma', texto: 'Cronograma', icono: CalendarDays },
  { to: '/panel', texto: 'Cátedra', icono: LockKeyhole, titulo: 'Panel de la cátedra (docentes y ayudantes)' },
]

export function Nav() {
  const { pathname } = useLocation()
  return (
    <header className="no-print sticky top-0 z-40 border-b border-linea/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-2 px-3 sm:h-[4.5rem] sm:gap-3 sm:px-6">
        <Marca />
        <nav className="flex items-center gap-0.5 sm:gap-2" aria-label="Principal">
          {enlaces.map(({ to, texto, icono: I, fin, titulo }) => (
            <NavLink
              key={to}
              to={to}
              end={fin}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.62rem] font-medium transition sm:flex-row sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
                  isActive || (to === '/panel' && pathname.startsWith('/aula')) ? 'bg-rosa-suave text-rosa-oscuro' : 'text-slate-500 hover:text-tinta'
                } ${to === '/' ? 'hidden md:flex' : ''}`
              }
              title={titulo ?? texto}
            >
              <I className="h-4 w-4" />
              <span>{texto}</span>
            </NavLink>
          ))}
          {__DEMO__ && (
            <span title="Modo demostración: los datos se guardan sólo en este navegador" className="ml-1 hidden rounded-full border border-ambar/40 bg-ambar-suave px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.2em] text-ambar uppercase lg:inline">
              Demo
            </span>
          )}
          {/* Página de registro independiente (sin React): navegación completa */}
          <a href="/p/" className="btn btn-primario ml-1 !gap-1.5 !px-3 !py-2 !text-[0.8rem] sm:!px-4 sm:!text-sm">
            <ScanLine className="h-4 w-4" />
            Dar presente
          </a>
        </nav>
      </div>
    </header>
  )
}
