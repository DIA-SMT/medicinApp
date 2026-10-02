import { ArrowRight, CalendarDays, FileSpreadsheet, FingerprintPattern, QrCode, ScanLine, ShieldCheck, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DnaHelix } from '../components/DnaHelix'
import { EcgLine } from '../components/EcgLine'
import { HormoneMonitor } from '../components/HormoneMonitor'
import { SelloUNT } from '../components/Logo'
import { ProximaClase } from '../components/ProximaClase'
import { TarjetaSesion } from '../components/TarjetaSesion'
import { ChipArea, Seccion } from '../components/ui'
import { APERTURA_DEFAULT, CATEDRA, CIERRE_DEFAULT, TOTP_PASO_S } from '../lib/config'
import { AREAS, CRONOGRAMA, type Area } from '../lib/cronograma'
import { useNow, useVentanas } from '../lib/hooks'
import { hoyIso, sesionVigente } from '../lib/time'
import { Pie } from './Pie'

const PASOS = [
  {
    icono: QrCode,
    titulo: 'QR dinámico',
    texto: `El código proyectado rota cada ${TOTP_PASO_S} segundos. Una captura reenviada por WhatsApp llega vencida.`,
    tecnico: 'TOTP · HMAC-SHA256 · C = ⌊T / Δt⌋',
    color: '#e0246f',
  },
  {
    icono: Timer,
    titulo: `Ventana ${APERTURA_DEFAULT} → ${CIERRE_DEFAULT}`,
    texto: 'Pasada la hora de corte el servidor deja de aceptar registros, incluso desde el póster impreso.',
    tecnico: 'PROGRAMADA → ABIERTA → CERRADA',
    color: '#c27c03',
  },
  {
    icono: FingerprintPattern,
    titulo: 'Sólo tu DNI, una vez',
    texto: 'La primera vez ingresás tu DNI; después tu celular queda vinculado y el presente es un toque.',
    tecnico: 'ECDSA P-256 · extractable: false',
    color: '#0aa2c0',
  },
  {
    icono: FileSpreadsheet,
    titulo: 'Planilla automática',
    texto: 'La cátedra ve los presentes en vivo, carga excepciones a mano y exporta la regularidad.',
    tecnico: 'UNIQUE (sesión, alumno) · CSV',
    color: '#0e9f68',
  },
]

export function Inicio() {
  const now = useNow(30_000)
  const { ventanas } = useVentanas()
  const actual = sesionVigente(ventanas, now)
  const hoy = hoyIso(now)
  const proximas = CRONOGRAMA.filter((s) => s.fecha >= hoy).slice(0, 4)
  const areas = Object.keys(AREAS) as Area[]
  const total = CRONOGRAMA.reduce((n, s) => n + s.temas.length, 0)

  return (
    <main>
      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-7xl px-4 pt-10 pb-14 sm:px-6 lg:pt-16">
        <DnaHelix className="pointer-events-none absolute top-0 right-[-4%] hidden h-[620px] w-[44%] opacity-80 lg:block" vueltas={2.1} pares={24} />
        <div className="relative grid items-center gap-10 lg:grid-cols-12">
          <div className="entrada lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-linea bg-white py-1 pr-3 pl-1 shadow-sm">
                <SelloUNT className="h-6 w-auto rounded-full" />
                <span className="text-xs text-slate-600">{CATEDRA.universidad}</span>
              </span>
              <span className="rounded-full border border-cian/30 bg-cian-suave px-3 py-1 font-mono text-[0.65rem] font-medium tracking-[0.18em] text-cian-oscuro uppercase">
                {CATEDRA.cursado}
              </span>
            </div>

            <h1 className="mt-7 font-display leading-[0.95] font-bold tracking-tight">
              <span className="block text-2xl font-medium text-slate-500 sm:text-3xl">Cátedra de</span>
              <span className="texto-gradiente block pb-1 text-[3.4rem] sm:text-7xl lg:text-[5.6rem]">Ginecología</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Clases teóricas de miércoles y viernes con <span className="font-medium text-tinta">asistencia criptográfica</span>: escaneás el QR del aula, ponés tu
              DNI la primera vez y listo. El sistema verifica el código, la hora y tu dispositivo.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/p/" className="btn btn-primario !px-5 !py-3 text-base">
                <ScanLine className="h-5 w-5" /> Dar presente
              </a>
              <Link to="/cronograma" className="btn btn-secundario !px-5 !py-3 text-base">
                <CalendarDays className="h-5 w-5" /> Cronograma
              </Link>
            </div>

            <dl className="mt-10 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-linea bg-linea sm:grid-cols-4">
              {[
                [String(CATEDRA.inscriptos), 'alumnos'],
                [String(CRONOGRAMA.length), 'clases'],
                [String(total), 'temas'],
                ['2', 'parciales'],
              ].map(([v, l]) => (
                <div key={l} className="bg-white px-4 py-3">
                  <dt className="font-mono text-[0.6rem] tracking-[0.2em] text-slate-400 uppercase">{l}</dt>
                  <dd className="font-display text-2xl font-semibold text-tinta tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="entrada lg:col-span-5" style={{ animationDelay: '0.12s' }}>
            {actual ? <ProximaClase sesion={actual} /> : <div className="tarjeta hud p-7 text-slate-600">El cursado 2026 finalizó. ¡Éxitos en los finales!</div>}
          </div>
        </div>
      </section>

      <EcgLine latidos={9} className="h-10 w-full" />

      <div className="mx-auto max-w-7xl space-y-24 px-4 py-20 sm:px-6">
        <Seccion etiqueta="Programa" titulo={<>Del eje hipotálamo-hipófiso-ovárico <span className="text-slate-400">a la oncología ginecológica</span></>}>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="al-ver lg:col-span-7">
              <HormoneMonitor />
            </div>
            <div className="al-ver tarjeta hud flex flex-col p-6 lg:col-span-5">
              <p className="text-slate-600">
                {total} temas en {CRONOGRAMA.length} encuentros, del {CATEDRA.periodo}. Cada clase se identifica por área para que la planilla y el proyector
                muestren el contexto de lo que se dicta.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <ChipArea key={a} area={a} />
                ))}
              </div>
              <div className="mt-auto pt-6">
                <div className="etiqueta mb-2">Distribución por área</div>
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                  {areas.map((a) => {
                    const n = CRONOGRAMA.flatMap((s) => s.temas).filter((t) => t.area === a).length
                    return <div key={a} title={`${AREAS[a].label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: AREAS[a].color }} />
                  })}
                </div>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion etiqueta="Protocolo" titulo="Cómo se valida un presente">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((p, i) => (
              <div key={p.titulo} className="al-ver tarjeta hud group relative overflow-hidden p-6">
                <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-[0.12] blur-2xl transition group-hover:opacity-25" style={{ background: p.color }} />
                <div className="relative flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl border border-linea" style={{ background: `${p.color}10` }}>
                    <p.icono className="h-5 w-5" style={{ color: p.color }} />
                  </div>
                  <span className="font-mono text-xs text-slate-300">0{i + 1}</span>
                </div>
                <h3 className="relative mt-5 font-display text-lg font-semibold text-tinta">{p.titulo}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{p.texto}</p>
                <div className="relative mt-5 rounded-lg border border-linea bg-slate-50 px-3 py-2 font-mono text-[0.68rem] text-slate-500">{p.tecnico}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-vital" /> El DNI sólo se usa para identificarte contra el padrón de la planilla de regularidades. No se pide ubicación.
          </div>
        </Seccion>

        {proximas.length > 0 && (
          <Seccion
            etiqueta="Agenda"
            titulo="Próximas clases"
            accion={
              <Link to="/cronograma" className="btn btn-secundario">
                Cronograma completo <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {proximas.map((s) => (
                <div key={s.id} className="al-ver">
                  <TarjetaSesion sesion={s} compacta />
                </div>
              ))}
            </div>
          </Seccion>
        )}
      </div>
      <Pie />
    </main>
  )
}
