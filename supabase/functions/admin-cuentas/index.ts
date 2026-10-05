// Edge Function «admin-cuentas»: los administradores de la cátedra crean cuentas con contraseña y
// cambian contraseñas olvidadas desde el panel. Usa la llave de servicio que Supabase inyecta en el
// entorno de la función (nunca pasa por el repositorio, Vercel ni el navegador).
// Cada pedido se valida con el token de quien llama: si la base no dice que es administrador, no hace nada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGENES = ['https://medicinapp.vercel.app', 'http://localhost:5173', 'http://localhost:5174']

const cors = (origen: string | null) => ({
  'Access-Control-Allow-Origin': origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})

Deno.serve(async (req) => {
  const origen = req.headers.get('origin')
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(origen), 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origen) })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. ¿Quién llama? Con su propio token, la base decide si es administrador (es_admin: usuario + email confirmado + rol).
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: esAdmin } = await comoUsuario.rpc('es_admin')
  if (esAdmin !== true) return responder({ error: 'Sólo un administrador de la cátedra puede hacer esto.' }, 403)
  const { data: quien } = await comoUsuario.auth.getUser()
  const yo = quien.user?.email?.toLowerCase() ?? null

  const admin = createClient(url, servicio, { auth: { persistSession: false } })
  const cuerpo = (await req.json().catch(() => null)) as { accion?: string; email?: string; clave?: string; rol?: string } | null
  const email = String(cuerpo?.email ?? '').trim().toLowerCase()
  const clave = String(cuerpo?.clave ?? '')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: 'Ese email no parece válido.' }, 400)
  if (clave.length < 8 || clave.length > 72) return responder({ error: 'La contraseña tiene que tener entre 8 y 72 caracteres.' }, 400)

  const buscar = async () => {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    return data.users.find((u) => u.email?.toLowerCase() === email)
  }
  // La contraseña nunca se registra: sólo quién hizo qué y sobre qué cuenta.
  const auditar = (accion: string, detalle: string | null = null) => admin.from('auditoria').insert({ accion, cuenta: email, detalle, por: yo })

  try {
    if (cuerpo?.accion === 'crear') {
      const rol = cuerpo.rol === 'admin' ? 'admin' : 'docente'
      if (await buscar()) return responder({ error: 'Ya existe una cuenta con ese email. Si se olvidó la contraseña, usá «Cambiar contraseña».' }, 409)
      // La crea un administrador, que responde por esa persona: queda confirmada sin correo.
      const { error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true })
      if (error) return responder({ error: `No se pudo crear la cuenta: ${error.message}` }, 400)
      const { error: e2 } = await admin.from('docentes').upsert({ email, rol, agregado_por: yo }, { onConflict: 'email' })
      if (e2) return responder({ error: `La cuenta se creó pero no se pudo habilitar: ${e2.message}` }, 500)
      await auditar('cuenta_creada', rol)
      return responder({ ok: true })
    }

    if (cuerpo?.accion === 'clave') {
      const { data: habilitada } = await admin.from('docentes').select('email').eq('email', email).maybeSingle()
      if (!habilitada) return responder({ error: 'Esa cuenta no es de la cátedra.' }, 404)
      const u = await buscar()
      if (!u) return responder({ error: 'Esa persona todavía no tiene cuenta: creala con «Crear cuenta».' }, 404)
      const { error } = await admin.auth.admin.updateUserById(u.id, { password: clave, email_confirm: true })
      if (error) return responder({ error: `No se pudo cambiar la contraseña: ${error.message}` }, 400)
      await auditar('clave_cambiada')
      return responder({ ok: true })
    }

    return responder({ error: 'Acción desconocida.' }, 400)
  } catch (e) {
    return responder({ error: `Error del servidor: ${(e as Error).message}` }, 500)
  }
})
