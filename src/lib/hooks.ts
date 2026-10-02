import { useCallback, useEffect, useState } from 'react'
import { publico } from '../data/publico'
import type { Ventana } from './time'

/** Reloj que re-renderiza cada `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Ventanas horarias de todas las sesiones, refrescadas cada 15 s (y al instante en modo demo). */
export function useVentanas() {
  const [ventanas, setVentanas] = useState<Record<string, Ventana> | null>(null)
  const cargar = useCallback(() => {
    publico()
      .then((p) => p.ventanas())
      .then(setVentanas)
      .catch(() => {})
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 15_000)
    // En modo demo el proveedor local avisa los cambios (misma pestaña y otras pestañas).
    window.addEventListener('ciclo:cambio', cargar)
    window.addEventListener('storage', cargar)
    return () => {
      clearInterval(t)
      window.removeEventListener('ciclo:cambio', cargar)
      window.removeEventListener('storage', cargar)
    }
  }, [cargar])
  return { ventanas, recargar: cargar }
}
