import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Background } from './components/Background'
import { Elena } from './components/Elena'
import { Fallo } from './components/Fallo'
import { Nav } from './components/Nav'
import { sesionPorId } from './lib/cronograma'
import { Acceso } from './pages/Acceso'

// Cada pantalla se descarga por separado. El registro del alumno ni siquiera usa React: vive en /p/.
const Aula = lazy(() => import('./pages/Aula').then((m) => ({ default: m.Aula })))
const Cronograma = lazy(() => import('./pages/Cronograma').then((m) => ({ default: m.Cronograma })))
const Inicio = lazy(() => import('./pages/Inicio').then((m) => ({ default: m.Inicio })))
const Panel = lazy(() => import('./pages/Panel').then((m) => ({ default: m.Panel })))
const Poster = lazy(() => import('./pages/Poster').then((m) => ({ default: m.Poster })))

/** Título de la pestaña según la pantalla (también sirve para el historial y los marcadores). */
function titulo(pathname: string) {
  const [, ruta, id] = pathname.split('/')
  const clase = id ? sesionPorId(id) : undefined
  const n = clase ? ` · Clase Nº ${clase.n}` : ''
  const nombres: Record<string, string> = { cronograma: 'Cronograma', panel: 'Panel de la cátedra', aula: `Proyector${n}`, poster: `Póster${n}` }
  return nombres[ruta] ? `${nombres[ruta]} · CICLO` : 'CICLO · Ginecología FM-UNT'
}

function Titulo() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = titulo(pathname)
  }, [pathname])
  return null
}

/** La pantalla de error se reinicia al cambiar de página: un fallo en una sección no bloquea las demás. */
function FalloPorPagina({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <Fallo key={pathname}>{children}</Fallo>
}

function ConNav() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <>
      <Nav />
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </>
  )
}

/** Enlaces viejos o escritos a mano (#/presente) van a la página liviana de registro. */
function IrARegistro() {
  useEffect(() => {
    location.replace('/p/')
  }, [])
  return null
}

export function App() {
  return (
    <HashRouter>
      <Background />
      <Titulo />
      <FalloPorPagina>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<ConNav />}>
              <Route path="/" element={<Inicio />} />
              <Route path="/cronograma" element={<Cronograma />} />
              <Route path="/panel" element={<Acceso><Panel /></Acceso>} />
            </Route>
            <Route path="/aula/:id?" element={<Acceso><Aula /></Acceso>} />
            <Route path="/poster/:id" element={<Acceso><Poster /></Acceso>} />
            <Route path="/presente" element={<IrARegistro />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </FalloPorPagina>
      <Elena />
    </HashRouter>
  )
}
