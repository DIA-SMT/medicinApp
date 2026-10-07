import { ArrowLeft, Camera, CircleCheck, Clock, FileText, IdCard, Printer, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EcgLine } from '../components/EcgLine'
import { SelloUNT, UteroMark } from '../components/Logo'
import { QrCode } from '../components/QrCode'
import { useAdmin } from '../data/admin'
import { CATEDRA } from '../lib/config'
import { docentesSesion, sesionPorId } from '../lib/cronograma'
import { enlaceRegistro } from '../lib/enlaces'
import { useVentanas } from '../lib/hooks'
import { diaSemana, fechaCorta, ventanaDefault } from '../lib/time'
import { clavePoster } from '../lib/totp'

const PASOS = [
  { icono: Camera, texto: 'Abrí la cámara del celular' },
  { icono: Smartphone, texto: 'Escaneá el código y tocá el enlace' },
  { icono: IdCard, texto: 'Ingresá tu DNI (sólo la primera vez)' },
  { icono: CircleCheck, texto: 'Listo: las próximas veces es un solo toque' },
]

/** Póster A4 con QR fijo de la clase. Sólo es válido dentro de la ventana horaria de esa fecha. */
export function Poster() {
  const api = useAdmin()
  const { id = '' } = useParams()
  const sesion = sesionPorId(id)
  const { ventanas } = useVentanas()
  const v = ventanas?.[id] ?? ventanaDefault()
  const [clave, setClave] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (sesion) api.secreto(sesion.id).then((s) => clavePoster(s, sesion.id)).then(setClave).catch(() => {})
  }, [api, sesion])

  if (!sesion) return <p className="p-10 text-tinta">Clase inexistente.</p>
  const url = clave ? enlaceRegistro(sesion.id, clave) : ''

  return (
    <div className="min-h-dvh py-8 print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] items-center justify-between px-4">
        <Link to={`/aula/${sesion.id}`} className="btn btn-secundario">
          <ArrowLeft className="h-4 w-4" /> Volver al aula
        </Link>
        <div className="flex gap-2">
          <button
            className="btn btn-primario"
            disabled={!clave || generando}
            onClick={async () => {
              setGenerando(true)
              try {
                const { posterPdf, descargar } = await import('../lib/pdf')
                descargar(await posterPdf({ sesion, url, apertura: v.apertura, cierre: v.cierre }))
              } finally {
                setGenerando(false)
              }
            }}
          >
            <FileText className="h-4 w-4" /> {generando ? 'Generando…' : 'Descargar PDF'}
          </button>
          <button className="btn btn-secundario" onClick={() => window.print()} disabled={!clave}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Hoja A4 */}
      <article
        className="relative mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white text-[#0a0f1f] shadow-2xl print:shadow-none"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <div className="h-3 w-full bg-gradient-to-r from-[#ff3d81] via-[#8b7bff] to-[#22e1ff]" />
        <header className="flex items-center justify-between px-[16mm] pt-[10mm]">
          <div className="flex items-center gap-4">
            <SelloUNT className="h-[22mm] w-auto" />
            <div>
              <div className="text-[11pt] font-semibold">{CATEDRA.universidad}</div>
              <div className="text-[10pt] text-[#4b5575]">{CATEDRA.facultad}</div>
              <div className="font-display text-[15pt] font-bold">Cátedra de {CATEDRA.materia}</div>
              <div className="text-[10pt] font-semibold text-[#b0124f]">{CATEDRA.titularCompleta}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UteroMark className="h-[14mm] w-[14mm]" />
            <div className="font-display text-[15pt] font-bold">Ginecoapp</div>
          </div>
        </header>

        <section className="px-[16mm] pt-[9mm] text-center">
          <div className="font-mono text-[10pt] tracking-[0.3em] text-[#b0124f] uppercase">Registro de asistencia · Clase teórica Nº {String(sesion.n).padStart(2, '0')}</div>
          <h1 className="mt-[3mm] font-display text-[25pt] leading-tight font-bold">{sesion.temas.map((t) => t.titulo).join(' + ')}</h1>
          <p className="mt-[2mm] text-[11pt] text-[#4b5575]">{docentesSesion(sesion)}</p>
        </section>

        <section className="flex flex-1 flex-col items-center justify-center">
          <div className="relative rounded-[8mm] border-[0.6mm] border-[#e6e9f5] p-[6mm]">
            {/* esquinas HUD */}
            {['top-0 left-0 border-t-[1.2mm] border-l-[1.2mm] rounded-tl-[8mm]', 'top-0 right-0 border-t-[1.2mm] border-r-[1.2mm] rounded-tr-[8mm]', 'bottom-0 left-0 border-b-[1.2mm] border-l-[1.2mm] rounded-bl-[8mm]', 'bottom-0 right-0 border-r-[1.2mm] border-b-[1.2mm] rounded-br-[8mm]'].map((c, i) => (
              <span key={c} className={`absolute h-[16mm] w-[16mm] ${c}`} style={{ borderColor: i % 3 === 0 ? '#ff3d81' : '#22c3e6' }} />
            ))}
            {url ? <QrCode value={url} className="h-[112mm] w-[112mm]" margen={1} /> : <div className="h-[112mm] w-[112mm] animate-pulse rounded-2xl bg-[#f1f3fa]" />}
          </div>
          <div className="mt-[6mm] flex items-center gap-[3mm] rounded-full bg-[#0a0f1f] px-[7mm] py-[3mm] text-white">
            <Clock className="h-[6mm] w-[6mm] text-[#ff8fb7]" />
            <span className="text-[13pt] font-semibold">
              Válido sólo el {diaSemana(sesion.fecha).toLowerCase()} {fechaCorta(sesion.fecha)} de {v.apertura} a {v.cierre} h
            </span>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-[4mm] px-[16mm] pb-[7mm]">
          {PASOS.map((p, i) => (
            <div key={p.texto} className="rounded-[4mm] border border-[#e6e9f5] bg-[#f7f8fc] p-[4mm]">
              <div className="flex items-center gap-[2mm]">
                <span className="grid h-[7mm] w-[7mm] place-items-center rounded-full bg-[#0a0f1f] font-mono text-[9pt] font-bold text-white">{i + 1}</span>
                <p.icono className="h-[5mm] w-[5mm] text-[#b0124f]" />
              </div>
              <p className="mt-[2.5mm] text-[9.5pt] leading-snug font-medium">{p.texto}</p>
            </div>
          ))}
        </section>

        <footer className="px-[16mm] pb-[8mm]">
          <EcgLine latidos={10} className="h-[8mm] w-full" duracion={0} />
          <div className="mt-[2mm] flex items-center justify-between text-[8.5pt] text-[#4b5575]">
            <span className="flex items-center gap-[1.5mm]">
              <ShieldCheck className="h-[4mm] w-[4mm] text-[#0e9f6e]" /> Un dispositivo por alumno · después de las {v.cierre} h el código queda inválido.
            </span>
            <span className="font-mono">clave {clave ? `${clave.slice(0, 2)}••••••${clave.slice(-2)}` : '—'}</span>
          </div>
        </footer>
      </article>
    </div>
  )
}
