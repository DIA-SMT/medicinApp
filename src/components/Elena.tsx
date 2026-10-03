import { Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface Mensaje {
  rol: 'usuario' | 'elena'
  contenido: string
}

const SUGERENCIAS_ALUMNO = [
  '¿Cómo doy el presente?',
  '¿Cuánta asistencia necesito para poder rendir?',
  'Cambié de celular, ¿qué hago?',
  '¿Hasta qué hora puedo escanear el QR?',
  '¿Cuándo son los parciales?',
]
const SUGERENCIAS_CATEDRA = [
  '¿Cómo cargo un presente manual?',
  'Un alumno cambió de celular, ¿cómo lo libero?',
  '¿Cómo extiendo el registro si el docente se demora?',
  '¿Cómo imprimo el póster de una clase?',
]

/** Render mínimo: **texto** → negrita (sin librerías de markdown). */
function ConNegritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-tinta">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

/**
 * Elena — la asistente de CICLO — flotante en la portada, el cronograma y el panel.
 * Se abre sola con /#/?elena=1 y, si además viene &q=…, manda esa pregunta (lo usa /p/ ante un error).
 */
export function Elena() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  const pagina = pathname.split('/')[1] || 'inicio'
  const catedra = pagina === 'panel'

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes, pensando])

  const enviar = async (contenido: string) => {
    const limpio = contenido.trim().slice(0, 1500)
    if (!limpio || pensando) return
    const nuevos: Mensaje[] = [...mensajes, { rol: 'usuario', contenido: limpio }]
    setMensajes(nuevos)
    setTexto('')
    setPensando(true)
    let respuesta: string
    try {
      const r = await fetch('/api/elena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mensajes: nuevos.slice(-12), pagina }),
      })
      const data = (await r.json().catch(() => ({}))) as { respuesta?: string; error?: string }
      respuesta = data.respuesta ?? `Perdón, tuve un problema (${data.error ?? `error ${r.status}`}). Probá de nuevo en un ratito.`
    } catch {
      respuesta = 'Se me cortó la conexión. Revisá los datos o el Wi-Fi y probá de nuevo.'
    }
    setMensajes((m) => [...m, { rol: 'elena', contenido: respuesta }])
    setPensando(false)
  }
  const enviarRef = useRef(enviar)
  enviarRef.current = enviar

  // Enlace desde /p/: abre el chat y, si trae una pregunta, la manda una sola vez.
  useEffect(() => {
    const p = new URLSearchParams(search)
    if (!p.has('elena')) return
    setAbierto(true)
    const q = p.get('q')
    navigate(pathname, { replace: true })
    if (q) void enviarRef.current(q)
  }, [search, pathname, navigate])

  // En el proyector y en el póster no se muestra.
  if (pagina === 'aula' || pagina === 'poster') return null

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="no-print fixed right-3 bottom-3 z-50 flex items-center gap-2 rounded-full border border-rosa/25 bg-white p-1.5 shadow-[0_14px_36px_-16px_rgb(224_36_111/0.55)] transition hover:border-rosa/60 sm:right-4 sm:bottom-4 sm:pr-4"
        aria-label="Abrir el chat con Elena"
        title="Preguntale a Elena cómo dar el presente o cuánta asistencia necesitás"
      >
        <img src="/elena.webp" alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-rosa-suave object-cover" />
        <span className="hidden text-sm font-semibold text-tinta sm:inline">¿Dudas? Elena</span>
        <span className="absolute top-1 right-1 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-vital sm:static sm:h-2 sm:w-2 sm:border-0" />
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Chat con Elena"
      className="tarjeta no-print fixed inset-x-3 bottom-3 z-50 flex h-[min(560px,calc(100dvh-1.5rem))] flex-col overflow-hidden sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[380px]"
    >
      <div className="flex items-center justify-between border-b border-linea px-4 py-3">
        <div className="flex items-center gap-2.5">
          <img src="/elena.webp" alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-rosa-suave object-cover" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-tinta">Elena</div>
            <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-vital" /> Asistente de CICLO · asistencia y regularidad
            </div>
          </div>
        </div>
        <button onClick={() => setAbierto(false)} className="rounded-lg p-1 text-slate-400 hover:text-tinta" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="px-1 text-[0.85rem] text-slate-600">
              ¡Hola! Soy Elena 👋 Te ayudo a dar el presente, con los horarios del registro y con cuánta asistencia necesitás para quedar regular.
            </p>
            {(catedra ? SUGERENCIAS_CATEDRA : SUGERENCIAS_ALUMNO).map((s) => (
              <button
                key={s}
                onClick={() => void enviar(s)}
                className="block w-full rounded-xl border border-linea bg-fondo px-3 py-2 text-left text-[0.8rem] text-slate-600 transition hover:border-rosa/40 hover:text-tinta"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[0.85rem] leading-relaxed whitespace-pre-wrap ${
                m.rol === 'usuario' ? 'rounded-br-sm bg-rosa text-white' : 'rounded-bl-sm border border-linea bg-fondo text-slate-700'
              }`}
            >
              {m.rol === 'elena' ? <ConNegritas texto={m.contenido} /> : m.contenido}
            </div>
          </div>
        ))}
        {pensando && (
          <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
            <img src="/elena.webp" alt="" width={20} height={20} className="h-5 w-5 animate-pulse rounded-full" />
            Elena está escribiendo…
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form
        className="border-t border-linea p-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(texto)
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={1500}
            placeholder="Escribile a Elena…"
            className="campo !py-2.5 text-[0.85rem]"
          />
          <button type="submit" disabled={pensando || !texto.trim()} className="btn btn-primario !p-2.5" aria-label="Enviar">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.62rem] text-slate-400">No compartas tu DNI acá: Elena no lo necesita.</p>
      </form>
    </div>
  )
}
