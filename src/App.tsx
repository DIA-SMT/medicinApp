import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Background } from './components/Background'
import { Nav } from './components/Nav'
import { Acceso } from './pages/Acceso'

// Cada pantalla se descarga por separado. El registro del alumno ni siquiera usa React: vive en /p/.
const Aula = lazy(() => import('./pages/Aula').then((m) => ({ default: m.Aula })))
const Cronograma = lazy(() => import('./pages/Cronograma').then((m) => ({ default: m.Cronograma })))
const Inicio = lazy(() => import('./pages/Inicio').then((m) => ({ default: m.Inicio })))
const Panel = lazy(() => import('./pages/Panel').then((m) => ({ default: m.Panel })))
const Poster = lazy(() => import('./pages/Poster').then((m) => ({ default: m.Poster })))

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
    </HashRouter>
  )
}
