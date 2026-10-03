import { CircleCheck, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Aviso {
  id: number
  texto: string
  deshacer?: () => Promise<unknown> | void
}

/**
 * Avisos al pie de la pantalla con «Deshacer»: cada corrección del panel (un clic en la grilla,
 * quitar un presente) se puede revertir durante unos segundos en lugar de pedir confirmación.
 */
export function useAvisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const cerrar = useCallback(() => setAviso(null), [])
  const mostrar = useCallback((texto: string, deshacer?: Aviso['deshacer']) => {
    clearTimeout(timer.current)
    setAviso({ id: Date.now(), texto, deshacer })
    timer.current = setTimeout(() => setAviso(null), deshacer ? 7000 : 4000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const nodo = aviso && (
    <div key={aviso.id} role="status" className="entrada fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-tinta px-4 py-3 text-sm text-white shadow-2xl sm:bottom-6">
      <CircleCheck className="h-4 w-4 shrink-0 text-vital" />
      <span className="min-w-0 flex-1">{aviso.texto}</span>
      {aviso.deshacer && (
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 font-semibold text-white hover:bg-white/20"
          onClick={async () => {
            const d = aviso.deshacer!
            setAviso(null)
            await d()
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Deshacer
        </button>
      )}
      <button onClick={cerrar} className="shrink-0 text-white/50 hover:text-white" aria-label="Cerrar aviso">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
  return { nodo, mostrar }
}
