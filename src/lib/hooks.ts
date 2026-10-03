import { useCallback, useEffect, useState } from 'react'
import { publico } from '../data/publico'
import type { Ventana } from './time'

/**
 * ¿Alguien de la cátedra inició sesión en este navegador? Sólo para decidir si mostrar accesos como
 * «Proyectar» o «Póster» en las páginas públicas: no da permisos (eso lo controla la base).
 * Mira la sesión que guarda supabase-js (sb-<proyecto>-auth-token, en localStorage o sessionStorage) sin descargar el cliente.
 */
export function esCatedra() {
  if (__DEMO__) return true
  try {
    return [localStorage, sessionStorage].some((s) => Object.keys(s).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')))
  } catch {
    return false
  }
}

/** Reloj que re-renderiza cada `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/**
 * Diferencia con el reloj del servidor (ms), medida al entrar y cada 5 minutos. El proyector genera el QR
 * con la hora de la PC del aula: si esa PC atrasa o adelanta más de ~40 s, ningún código serviría.
 */
export function useDesfase() {
  const [desfase, setDesfase] = useState(0)
  const [medido, setMedido] = useState(false)
  useEffect(() => {
    let vivo = true
    const medir = () =>
      publico()
        .then((p) => p.desfase())
        .then((d) => {
          if (!vivo) return
          setDesfase(d)
          setMedido(true)
        })
        .catch(() => {
          /* sin red: se sigue con el último valor (o con el reloj local) */
        })
    medir()
    const t = setInterval(medir, 5 * 60_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])
  return { desfase, medido }
}

/** ¿Hay conexión? Para avisar en el proyector si se cortó internet. */
export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  useEffect(() => {
    const si = () => setEnLinea(true)
    const no = () => setEnLinea(false)
    window.addEventListener('online', si)
    window.addEventListener('offline', no)
    return () => {
      window.removeEventListener('online', si)
      window.removeEventListener('offline', no)
    }
  }, [])
  return enLinea
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
