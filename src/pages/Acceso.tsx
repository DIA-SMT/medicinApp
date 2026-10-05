import { Eye, EyeOff, LoaderCircle, LockKeyhole, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { UteroMark } from '../components/Logo'
import { AdminContext, cargarAdmin } from '../data/admin'
import type { AdminApi } from '../data/types'

/**
 * Puerta de la cátedra (proyector, póster y panel). Recién acá se descarga el cliente
 * de Supabase con autenticación: la parte pública y el registro del alumno no lo necesitan.
 * Las cuentas las crean los administradores desde el panel (pestaña «Cuentas»).
 */
export function Acceso({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<AdminApi | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'fuera' | 'dentro'>('cargando')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [recordar, setRecordar] = useState(false)

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
        <LoaderCircle className="h-6 w-6 animate-spin text-rosa" />
      </div>
    )

  return (
    <div className="grid min-h-[80vh] place-items-center px-4">
      <form
        className="tarjeta hud entrada w-full max-w-sm p-7"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!api) return
          setError('')
          setEnviando(true)
          const r = await api.ingresar(email.trim(), clave, recordar)
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
        <p className="mt-4 text-sm text-slate-500">Para abrir el proyector, imprimir el póster y ver la planilla.</p>

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

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rosa" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
          <span>
            Recordarme en esta computadora
            <span className="block text-xs text-slate-400">Dejalo sin marcar en la PC del aula: la sesión se cierra sola al cerrar el navegador.</span>
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-rosa-oscuro">{error}</p>}
        <button className="btn btn-primario mt-6 w-full !py-3" disabled={enviando || !api}>
          {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Ingresar
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">
          ¿No tenés cuenta o te olvidaste la contraseña? Pedíselo a un administrador de la cátedra: te la crea o te la cambia desde el panel.
        </p>

        <a href="/p/" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-rosa/50 hover:text-tinta">
          <ScanLine className="h-4 w-4 text-rosa" /> ¿Sos alumno? Para dar presente no necesitás cuenta
        </a>
      </form>
    </div>
  )
}
