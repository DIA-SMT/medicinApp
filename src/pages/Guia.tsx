import { Printer, Share2 } from 'lucide-react'
import { useAvisos } from '../components/Avisos'
import { APERTURA_DEFAULT, APP, CATEDRA, CIERRE_DEFAULT, SEDE } from '../lib/config'
import { copiarTexto } from '../lib/copiar'

/** Guía de una página para los docentes: para imprimir o compartir por WhatsApp. */

const PASOS: { titulo: string; items: string[] }[] = [
  {
    titulo: 'Antes de la clase',
    items: [
      `En la PC del aula conectada al proyector, entrá a ${location.host} → «Cátedra» y tocá «Proyectar el QR». El QR aparece solo de ${APERTURA_DEFAULT} a ${CIERRE_DEFAULT}.`,
      'Si no hay proyector: imprimí el póster de la clase la noche anterior («Póster» en el panel) o mandá el enlace por WhatsApp (menú «Más» del proyector).',
      'Para probar el circuito con celulares reales, usá «Ensayo» (DNIs de prueba, no cuenta para nada). Para probar también la ubicación, tildá «Exigirla también en el ensayo».',
    ],
  },
  {
    titulo: 'Durante la clase',
    items: [
      'Los alumnos escanean el QR, permiten la ubicación y listo: los presentes suben solos al proyector. Recomendales escanear desde la página guardada («Escanear con la cámara»): así el celular se reconoce siempre.',
      'Contá a las personas en el aula y cargá el número en «Contar el aula»: la app lo compara con los presentes.',
      'Quien no pueda (sin batería, sin celular, falla técnica): «Presente manual» con el motivo, en la misma clase.',
      'Si muchos no pueden verificar la ubicación (el panel avisa), tocá «Desactivar» en la tarjeta de la clase: el presente se da igual y los que estén lejos quedan marcados.',
    ],
  },
  {
    titulo: 'Después de la clase',
    items: [
      'En «Por clase» → «Sospechosos»: presentes lejos del aula, sin ubicación o desde otro celular. Si sobran presentes respecto del conteo, revisalos y quitá los que no correspondan.',
      'Aprobá los pedidos de cambio de celular en «Dispositivos» y respondé las consultas en «Consultas». La valoración de la clase aparece en «Por clase».',
    ],
  },
  {
    titulo: 'Al cerrar el cursado',
    items: [
      '«Descargar planilla (PDF)» para firmar y «CSV» para Excel. Un administrador descarga además el «Respaldo» y lo guarda en un lugar seguro (tiene DNIs).',
    ],
  },
]

const PROBLEMAS: [string, string][] = [
  ['«No pudimos verificar que estés en el aula»', 'Que active la ubicación del celular; si el navegador la bloqueó: candado junto a la dirección → Permisos → Ubicación → Permitir. Reintentar. Si no puede, presente manual.'],
  ['«Tu presente se da desde otro celular»', 'Que abra la página donde dio presente antes y escanee desde ahí («Escanear con la cámara»). Si cambió de teléfono: «Pasar mi presente a este celular» y lo aprobás en «Dispositivos».'],
  ['«Este celular ya registró a otra persona»', 'Cada celular sirve para un solo alumno: que use el suyo, o presente manual.'],
  ['«Código vencido»', 'El QR cambia cada 20 segundos: que escanee el que se ve ahora (las capturas reenviadas no sirven).'],
  ['«Registro cerrado»', `El registro cierra a las ${CIERRE_DEFAULT}. Si estuvo en clase, presente manual.`],
]

export function Guia() {
  const { nodo: aviso, mostrar } = useAvisos()
  const compartir = () =>
    copiarTexto(`Guía rápida de ${APP} para docentes: ${location.origin}/#/guia`).then((ok) => mostrar(ok ? 'Enlace copiado: pegalo en el grupo de la cátedra.' : 'No se pudo copiar.'))

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="etiqueta mb-2">
            {CATEDRA.materia} · {CATEDRA.titularCorta}
          </div>
          <h1 className="font-display text-3xl font-bold text-tinta">Guía rápida para docentes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {APP} · asistencia con QR · {SEDE.nombre}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button className="btn btn-secundario" onClick={compartir}>
            <Share2 className="h-4 w-4" /> Copiar enlace
          </button>
          <button className="btn btn-primario" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
        {PASOS.map((p, i) => (
          <section key={p.titulo} className="tarjeta p-5 print:break-inside-avoid print:p-3 print:shadow-none">
            <h2 className="flex items-center gap-2 font-semibold text-tinta">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-rosa text-xs font-bold text-white">{i + 1}</span>
              {p.titulo}
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-snug text-slate-700 print:text-xs">
              {p.items.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-cian" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="tarjeta mt-4 p-5 print:break-inside-avoid print:p-3 print:shadow-none">
        <h2 className="font-semibold text-tinta">Si un alumno ve este mensaje…</h2>
        <dl className="mt-3 divide-y divide-slate-100 text-sm print:text-xs">
          {PROBLEMAS.map(([m, r]) => (
            <div key={m} className="grid gap-1 py-2 sm:grid-cols-[16rem_1fr] sm:gap-4">
              <dt className="font-medium text-tinta">{m}</dt>
              <dd className="text-slate-600">{r}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">Los alumnos también pueden preguntarle a Elena, la asistente de la app («¿Dudas? Elena», abajo a la derecha).</p>
      </section>
      {aviso}
    </main>
  )
}
