// Elena, la asistente de Ginecoapp: Vercel Function que responde dudas sobre la asistencia y la app.
// Es pública (la usan los alumnos sin cuenta), así que cada pregunta pasa por un cupo en Supabase
// (elena_cupo: por IP y por día) y la respuesta se acota en largo. La clave del modelo vive sólo en Vercel.
import { sistemaElena, type FilaSesion } from './_elena.js'

declare const process: { env: Record<string, string | undefined> }

interface Mensaje {
  rol: 'usuario' | 'elena'
  contenido: string
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: { 'cache-control': 'no-store' } })

function validar(cuerpo: unknown): { mensajes: Mensaje[]; pagina: string } | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const { mensajes, pagina } = cuerpo as { mensajes?: unknown; pagina?: unknown }
  if (!Array.isArray(mensajes) || mensajes.length < 1 || mensajes.length > 20) return null
  const limpios: Mensaje[] = []
  for (const m of mensajes) {
    const { rol, contenido } = (m ?? {}) as Partial<Mensaje>
    if ((rol !== 'usuario' && rol !== 'elena') || typeof contenido !== 'string') return null
    const texto = contenido.trim()
    if (!texto || texto.length > 1500) return null
    limpios.push({ rol, contenido: texto })
  }
  if (limpios.at(-1)!.rol !== 'usuario') return null
  return { mensajes: limpios, pagina: typeof pagina === 'string' ? pagina.slice(0, 20) : '' }
}

async function supabase(ruta: string, init?: RequestInit) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return fetch(`${url}/rest/v1${ruta}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
}

async function hayCupo(ip: string) {
  try {
    // La clave interna prueba que la consulta viene de esta función y no de alguien llamando a la base directo.
    const r = await supabase('/rpc/elena_cupo', { method: 'POST', body: JSON.stringify({ p_ip: ip, p_clave: process.env.ELENA_CLAVE ?? null }) })
    return r.ok && (await r.json()) === true
  } catch {
    return false // sin poder medir el uso, no se llama al modelo
  }
}

async function sesiones(): Promise<FilaSesion[] | null> {
  try {
    const r = await supabase('/sesiones?select=id,apertura,cierre,manual_desde,manual_hasta,cerrada_en,suspendida,motivo_suspension')
    return r.ok ? ((await r.json()) as FilaSesion[]) : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  // Sólo desde la propia app (un navegador en otro sitio manda su Origin).
  const origen = request.headers.get('origin')
  if (origen && new URL(origen).host !== new URL(request.url).host) return json({ error: 'origen no permitido' }, 403)

  const entrada = validar(await request.json().catch(() => null))
  if (!entrada) return json({ error: 'mensajes inválidos' }, 400)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return json({ error: 'Elena todavía no está configurada' }, 503)

  // x-real-ip la pone Vercel (no la puede elegir el cliente).
  const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') ?? '').split(',').at(-1)!.trim() || 'desconocida'
  const [cupo, filas] = await Promise.all([hayCupo(ip), sesiones()])
  if (!cupo) {
    return json({ respuesta: 'Uy, recibí muchas preguntas seguidas. Esperá unos minutos y escribime de nuevo 🙏' })
  }

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-title': 'Ginecoapp Elena' },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4.5',
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: 'system', content: sistemaElena(filas, entrada.pagina) },
        ...entrada.mensajes.slice(-10).map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido })),
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null)

  if (!r?.ok) return json({ error: 'Elena no pudo responder' }, 502)
  const data = (await r.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null
  const respuesta = data?.choices?.[0]?.message?.content?.trim()
  if (!respuesta) return json({ error: 'respuesta vacía' }, 502)
  return json({ respuesta })
}
