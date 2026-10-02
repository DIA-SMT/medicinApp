import { CalendarDays, LayoutDashboard, Projector, ScanLine } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Marca } from './Logo'

const enlaces = [
  { to: '/cronograma', texto: 'Cronograma', icono: CalendarDays },
  { to: '/aula', texto: 'Aula', icono: Projector },
  { to: '/panel', texto: 'Panel', icono: LayoutDashboard },
]

export function Nav() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-linea/80 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Marca />
        <nav className="flex items-center gap-1 sm:gap-2">
          {enlaces.map(({ to, texto, icono: I }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition sm:px-3 ${isActive ? 'bg-slate-100 text-tinta' : 'text-slate-500 hover:text-tinta'}`
              }
              title={texto}
            >
              <I className="h-4 w-4" />
              <span className="hidden md:inline">{texto}</span>
            </NavLink>
          ))}
          {__DEMO__ && (
            <span title="Modo demostración: los datos se guardan sólo en este navegador" className="ml-1 hidden rounded-full border border-ambar/40 bg-ambar-suave px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.2em] text-ambar uppercase lg:inline">
              Demo
            </span>
          )}
          {/* Página de registro independiente (sin React): navegación completa */}
          <a href="/p/" className="btn btn-primario ml-1 !px-3 sm:!px-4">
            <ScanLine className="h-4 w-4" />
            <span className="hidden sm:inline">Dar presente</span>
          </a>
        </nav>
      </div>
    </header>
  )
}
