import { CircleCheck, Eye, EyeOff, LoaderCircle, LockKeyhole, ScanLine, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { UteroMark } from '../components/Logo'
import { AdminContext, cargarAdmin } from '../data/admin'
import type { AdminApi } from '../data/types'

type Modo = 'ingresar' | 'crear' | 'creada'

/** Campo de contraseña con botón para mostrarla. */
function CampoClave({ id, valor, onCambiar, nueva }: { id: string; valor: string; onCambiar: (v: string) => void; nueva?: boolean }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative mt-2">
      <input
        id={id}
        type={ver ? 'text' : 'password'}
        autoComplete={nueva ? 'new-password' : 'current-password'}
        minLength={nueva ? 8 : undefined}
        className="campo !pr-11"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        required
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:text-tinta"
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

/**
 * Puerta de la cátedra (proyector, póster y panel). Recién acá se descarga el cliente
 * de Supabase con autenticación: la parte pública y el registro del alumno no lo necesitan.
 * Cada docente puede crear su cuenta acá; entra recién cuando el administrador habilita su email.
 */
export function Acceso({ children }: { children: React.ReactNode }) {
  const [api, setApi] = useState<AdminApi | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'fuera' | 'dentro'>('cargando')
  const [modo, setModo] = useState<Modo>('ingresar')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
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

  const cambiarModo = (m: Modo) => {
    setModo(m)
    setError('')
    setClave('')
    setRepetir('')
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!api) return
    setError('')
    if (modo === 'crear') {
      if (clave.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.')
      if (clave !== repetir) return setError('Las dos contraseñas no coinciden.')
    }
    setEnviando(true)
    const r = modo === 'crear' ? await api.registrar(email.trim(), clave) : await api.ingresar(email.trim(), clave, recordar)
    setEnviando(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo completar.')
    if (modo === 'crear') cambiarModo('creada')
    else setEstado('dentro')
  }

  const encabezado = (
    <div className="flex items-center gap-3">
      <UteroMark className="h-10 w-10" />
      <div>
        <div className="etiqueta">Acceso cátedra</div>
        <div className="font-display text-xl font-semibold text-tinta">{modo === 'ingresar' ? 'Docentes y ayudantes' : 'Crear tu cuenta'}</div>
      </div>
    </div>
  )

  if (modo === 'creada')
    return (
      <div className="grid min-h-[80vh] place-items-center px-4">
        <div className="tarjeta hud entrada w-full max-w-sm p-7">
          {encabezado}
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-vital-suave p-4 text-sm text-vital">
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Cuenta creada para <b className="break-all">{email.trim()}</b>.
            </span>
          </div>
          <ol className="mt-5 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rosa text-xs font-bold text-white">1</span>
              <span>
                <b className="text-tinta">Avisale al administrador de la app</b> para que habilite tu email. Por seguridad, ninguna cuenta entra al panel hasta que la habilita.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rosa text-xs font-bold text-white">2</span>
              <span>Si te llega un correo para confirmar la cuenta, tocá el enlace. Si no llega, no pasa nada: el administrador la confirma.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rosa text-xs font-bold text-white">3</span>
              <span>Cuando te confirme, ingresá acá con tu email y tu contraseña.</span>
            </li>
          </ol>
          <button className="btn btn-primario mt-6 w-full !py-3" onClick={() => cambiarModo('ingresar')}>
            <LockKeyhole className="h-4 w-4" /> Ir a ingresar
          </button>
        </div>
      </div>
    )

  return (
    <div className="grid min-h-[80vh] place-items-center px-4">
      <form className="tarjeta hud entrada w-full max-w-sm p-7" onSubmit={enviar}>
        {encabezado}
        <p className="mt-4 text-sm text-slate-500">
          {modo === 'ingresar'
            ? 'Para abrir el proyector, imprimir el póster y ver la planilla.'
            : 'Elegí tu propia contraseña. Vas a poder entrar cuando el administrador habilite tu email.'}
        </p>

        <label className="etiqueta mt-6 block" htmlFor="email">
          Correo
        </label>
        <input id="email" type="email" autoComplete={modo === 'crear' ? 'email' : 'username'} className="campo mt-2" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label className="etiqueta mt-4 block" htmlFor="clave">
          {modo === 'crear' ? 'Contraseña nueva' : 'Contraseña'}
        </label>
        <CampoClave id="clave" valor={clave} onCambiar={setClave} nueva={modo === 'crear'} />

        {modo === 'crear' ? (
          <>
            <label className="etiqueta mt-4 block" htmlFor="repetir">
              Repetí la contraseña
            </label>
            <CampoClave id="repetir" valor={repetir} onCambiar={setRepetir} nueva />
            <p className={`mt-2 text-xs ${clave && clave.length < 8 ? 'text-ambar' : 'text-slate-400'}`}>Al menos 8 caracteres. Mejor si mezcla letras y números.</p>
          </>
        ) : (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rosa" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            <span>
              Recordarme en esta computadora
              <span className="block text-xs text-slate-400">Dejalo sin marcar en la PC del aula: la sesión se cierra sola al cerrar el navegador.</span>
            </span>
          </label>
        )}

        {error && <p className="mt-3 text-sm text-rosa-oscuro">{error}</p>}
        <button className="btn btn-primario mt-6 w-full !py-3" disabled={enviando || !api}>
          {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : modo === 'crear' ? <UserPlus className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
          {modo === 'crear' ? 'Crear cuenta' : 'Ingresar'}
        </button>

        {modo === 'ingresar' ? (
          <>
            <p className="mt-4 text-center text-sm text-slate-500">
              ¿Primera vez?{' '}
              <button type="button" className="font-semibold text-rosa underline-offset-4 hover:underline" onClick={() => cambiarModo('crear')}>
                Crear cuenta de la cátedra
              </button>
            </p>
            <p className="mt-2 text-center text-xs text-slate-400">¿Te olvidaste la contraseña? Pedile al administrador de la app que te la renueve.</p>
          </>
        ) : (
          <p className="mt-4 text-center text-sm text-slate-500">
            ¿Ya tenés cuenta?{' '}
            <button type="button" className="font-semibold text-rosa underline-offset-4 hover:underline" onClick={() => cambiarModo('ingresar')}>
              Ingresar
            </button>
          </p>
        )}

        <a href="/p/" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-rosa/50 hover:text-tinta">
          <ScanLine className="h-4 w-4 text-rosa" /> ¿Sos alumno? Para dar presente no necesitás cuenta
        </a>
      </form>
    </div>
  )
}
