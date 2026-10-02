import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { useEffect, useState } from 'react'
import { UteroMark } from '../components/Logo'
import { AdminContext, cargarAdmin } from '../data/admin'
import type { AdminApi } from '../data/types'

/**
 * Puerta de la cátedra (proyector, póster y panel). Recién acá se descarga el cliente
 * de Supabase con autenticación: la parte pública y el registro del alumno no lo necesitan.
 */
export function Acceso({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<AdminApi | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'fuera' | 'dentro'>('cargando')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    cargarAdmin()
      .then(async (a) => {
        setApi(a)
        setEstado((await a.autenticado()) ? 'dentro' : 'fuera')
      })
      .catch(() => setEstado('fuera'))
  }, [])

  if (estado === 'dentro' && api) return <AdminContext.Provider value={api}>{children}</AdminContext.Provider>
  if (estado === 'cargando')
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-cian" />
      </div>
    )

  return (
    <div className="grid min-h-[80vh] place-items-center px-4">
      <form
        className="tarjeta hud entrada w-full max-w-sm p-7"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!api) return
          setEnviando(true)
          const r = await api.ingresar(email, clave)
          setEnviando(false)
          if (r.ok) setEstado('dentro')
          else setError(r.error ?? 'No se pudo ingresar.')
        }}
      >
        <div className="flex items-center gap-3">
          <UteroMark className="h-10 w-10" />
          <div>
            <div className="etiqueta">Acceso cátedra</div>
            <div className="font-display text-xl font-semibold text-tinta">Docentes y ayudantes</div>
          </div>
        </div>
        <label className="etiqueta mt-7 block" htmlFor="email">
          Correo
        </label>
        <input id="email" type="email" autoComplete="username" className="campo mt-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="etiqueta mt-4 block" htmlFor="clave">
          Contraseña
        </label>
        <input id="clave" type="password" autoComplete="current-password" className="campo mt-2" value={clave} onChange={(e) => setClave(e.target.value)} required />
        {error && <p className="mt-3 text-sm text-rosa-oscuro">{error}</p>}
        <button className="btn btn-primario mt-6 w-full !py-3" disabled={enviando || !api}>
          {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Ingresar
        </button>
      </form>
    </div>
  )
}
