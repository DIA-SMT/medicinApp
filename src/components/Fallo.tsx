import { RotateCcw, ScanLine } from 'lucide-react'
import { Component, type ReactNode } from 'react'

const CLAVE_RECARGA = 'ciclo:recarga-por-version'

/** Tras publicar una versión nueva, los archivos viejos de cada pantalla dejan de existir. */
const esVersionVieja = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(String((e as Error)?.message ?? e))

/**
 * Si una pantalla falla, en lugar de dejar la página en blanco se muestra qué hacer.
 * Si el problema es que se publicó una versión nueva mientras la app estaba abierta, recarga sola (una vez).
 */
export class Fallo extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (!esVersionVieja(error)) return
    try {
      if (sessionStorage.getItem(CLAVE_RECARGA)) return
      sessionStorage.setItem(CLAVE_RECARGA, '1')
    } catch {
      return
    }
    location.reload()
  }

  componentDidMount() {
    try {
      sessionStorage.removeItem(CLAVE_RECARGA)
    } catch {
      /* ok */
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="tarjeta hud w-full max-w-sm p-7 text-center">
          <h1 className="font-display text-2xl font-semibold text-tinta">Algo no cargó bien</h1>
          <p className="mt-2 text-sm text-slate-600">
            Puede ser la conexión o una actualización de la app. Recargá la página; si estás en clase y necesitás dar presente, entrá directo a la página del QR.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button className="btn btn-primario w-full" onClick={() => location.reload()}>
              <RotateCcw className="h-4 w-4" /> Recargar
            </button>
            <a href="/p/" className="btn btn-secundario w-full">
              <ScanLine className="h-4 w-4" /> Dar presente
            </a>
          </div>
        </div>
      </div>
    )
  }
}
