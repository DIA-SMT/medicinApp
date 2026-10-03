import { Eye, EyeOff, LoaderCircle, LockKeyhole, ScanLine } from 'lucide-react'
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
  const [verClave, setVerClave] = useState(false)

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
        <p className="mt-4 text-sm text-slate-500">Para abrir el proyector, imprimir el póster y ver la planilla. La cuenta la crea el administrador de la app.</p>
        <label className="etiqueta mt-6 block" htmlFor="email">
          Correo
        </label>
        <input id="email" type="email" autoComplete="username" className="campo mt-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="etiqueta mt-4 block" htmlFor="clave">
          Contraseña
        </label>
        <div className="relative mt-2">
          <input id="clave" type={verClave ? 'text' : 'password'} autoComplete="current-password" className="campo !pr-11" value={clave} onChange={(e) => setClave(e.target.value)} required />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:text-tinta"
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rosa-oscuro">{error}</p>}
        <button className="btn btn-primario mt-6 w-full !py-3" disabled={enviando || !api}>
          {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Ingresar
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">¿Te olvidaste la contraseña? Pedile al administrador de la app que te la renueve.</p>
        <a href="/p/" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-rosa/50 hover:text-tinta">
          <ScanLine className="h-4 w-4 text-rosa" /> ¿Sos alumno? Para dar presente no necesitás cuenta
        </a>
      </form>
    </div>
  )
}
