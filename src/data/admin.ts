import { createContext, useContext } from 'react'
import type { AdminApi } from './types'

// supabase-js (auth + tiempo real) sólo se descarga cuando alguien de la cátedra entra al panel o al proyector.
let api: Promise<AdminApi> | null = null
export const cargarAdmin = () =>
  (api ??= __DEMO__ ? import('./local').then((m) => m.crearLocal()) : import('./supabase-admin').then((m) => m.crearSupabaseAdmin()))

export const AdminContext = createContext<AdminApi | null>(null)

export function useAdmin() {
  const a = useContext(AdminContext)
  if (!a) throw new Error('useAdmin fuera de <Acceso>')
  return a
}
