import { ArrowRight, BatteryLow, CalendarDays, Camera, ChevronDown, CircleCheck, Clock, FileSpreadsheet, FingerprintPattern, IdCard, MessageCircle, PlayCircle, QrCode, ScanLine, ShieldCheck, Smartphone, Timer, UserX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Agendar } from '../components/Agendar'
import { DnaHelix } from '../components/DnaHelix'
import { EcgLine } from '../components/EcgLine'
import { HormoneMonitor } from '../components/HormoneMonitor'
import { SelloUNT } from '../components/Logo'
import { ProximaClase } from '../components/ProximaClase'
import { TarjetaSesion } from '../components/TarjetaSesion'
import { ChipArea, Seccion } from '../components/ui'
import { APERTURA_DEFAULT, CATEDRA, CIERRE_DEFAULT, TOTP_PASO_S, UMBRAL_REGULARIDAD } from '../lib/config'
import { AREAS, CRONOGRAMA, type Area } from '../lib/cronograma'
import { useNow, useVentanas } from '../lib/hooks'
import { cuenta, hmArt, hoyIso, infoVentana, sesionVigente, ventanaDefault } from '../lib/time'
import { Pie } from './Pie'

const PASOS_PRESENTE = [
  { icono: Camera, titulo: 'Escaneá el QR', texto: 'Con la cámara del celular, el que se proyecta en el aula. No hay que instalar nada.' },
  { icono: IdCard, titulo: 'La primera vez, tu DNI', texto: 'Aparece tu nombre y tocás «Sí, dar presente». Tu celular queda vinculado.' },
  { icono: CircleCheck, titulo: 'Después, automático', texto: 'Las clases siguientes escaneás y listo: ves tu presente y cuánto llevás.' },
]

const SEGURIDAD = [
  { icono: QrCode, titulo: 'QR que cambia', texto: `Rota cada ${TOTP_PASO_S} segundos: una captura reenviada llega vencida.`, tecnico: 'TOTP · HMAC-SHA256' },
  { icono: Timer, titulo: `Sólo de ${APERTURA_DEFAULT} a ${CIERRE_DEFAULT}`, texto: 'Fuera de horario el sistema no acepta registros, ni desde el póster.', tecnico: 'Ventana validada en el servidor' },
  { icono: FingerprintPattern, titulo: 'Un celular, un alumno', texto: 'Tu celular guarda una llave que no se puede copiar a otro equipo.', tecnico: 'ECDSA P-256 no exportable' },
  { icono: FileSpreadsheet, titulo: 'Planilla automática', texto: 'La cátedra ve los presentes en vivo y carga las excepciones a mano.', tecnico: 'Un registro por clase y alumno' },
]

const PREGUNTAS: { icono: typeof Camera; p: string; r: string }[] = [
  { icono: BatteryLow, p: 'Me quedé sin batería o no tengo celular', r: 'Avisale a la cátedra en la clase: te cargan el presente manual.' },
  { icono: Smartphone, p: 'Cambié de celular o borré los datos del navegador', r: 'La cátedra libera tu celular anterior y en la próxima clase te registrás de nuevo con tu DNI.' },
  { icono: UserX, p: '¿Puedo dar presente desde el celular de un compañero?', r: 'No. Cada celular queda vinculado a un solo alumno: si lo usás vos, tu compañero ya no puede registrarse con el suyo.' },
  { icono: Clock, p: `Llegué después de las ${CIERRE_DEFAULT}`, r: 'El registro ya cerró. Si estuviste en la clase, hablalo con la cátedra en el momento.' },
  { icono: QrCode, p: '¿Me sirve una foto del QR que me pasaron?', r: `No: el código del aula cambia cada ${TOTP_PASO_S} segundos y la foto llega vencida.` },
  { icono: CircleCheck, p: '¿Dónde veo cuántos presentes llevo?', r: `En «Mi asistencia» (${location.host}/p/?mia=1), desde el celular con el que das el presente, ves todas tus clases y cuánto te falta para el ${UMBRAL_REGULARIDAD}%. También al dar presente. La planilla oficial la lleva la cátedra.` },
]

const minimo = (n: number) => Math.ceil((n * UMBRAL_REGULARIDAD) / 100)

/** Aviso arriba de todo cuando hoy hay clase: abierto (con cuenta regresiva) o por abrir. */
function AvisoEnVivo() {
  const now = useNow(1000)
  const { ventanas } = useVentanas()
  const s = sesionVigente(ventanas, now)
  if (!s || s.fecha !== hoyIso(now)) return null
  const info = infoVentana(s.fecha, ventanas?.[s.id] ?? ventanaDefault(), now)
  if (info.estado === 'cerrada') return null
  const abierta = info.estado === 'abierta'
  return (
    <div className={`border-b ${abierta ? 'border-vital/20 bg-vital-suave' : 'border-ambar/20 bg-ambar-suave'}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <p className={`flex items-center gap-2 text-sm font-medium ${abierta ? 'text-vital' : 'text-ambar'}`}>
          <span className="relative flex h-2.5 w-2.5">
            {abierta && <span className="animate-latido absolute inline-flex h-full w-full rounded-full bg-vital" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${abierta ? 'bg-vital' : 'bg-ambar'}`} />
          </span>
          {abierta ? (
            <>
              Registro abierto · cierra en <span className="font-mono tabular-nums">{cuenta(info.cierra - now)}</span>
            </>
          ) : (
            <>
              Hoy hay teórica · el registro abre a las {hmArt(info.abre)} (en <span className="font-mono tabular-nums">{cuenta(info.abre - now)}</span>)
            </>
          )}
        </p>
        {abierta && (
          <a href="/p/" className="btn btn-primario !py-1.5 !text-sm">
            <ScanLine className="h-4 w-4" /> Dar presente
          </a>
        )}
      </div>
    </div>
  )
}

export function Inicio() {
  const now = useNow(30_000)
  const { ventanas } = useVentanas()
  const actual = sesionVigente(ventanas, now)
  const hoy = hoyIso(now)
  const proximas = CRONOGRAMA.filter((s) => s.fecha >= hoy).slice(0, 4)
  const areas = Object.keys(AREAS) as Area[]
  const total = CRONOGRAMA.reduce((n, s) => n + s.temas.length, 0)
  // Con la app se toma asistencia desde la clase Nº 3 (07/10); las dos primeras cuentan sólo si la cátedra las carga.
  const conApp = CRONOGRAMA.length - 2

  return (
    <main>
      <AvisoEnVivo />

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
              Teóricas de miércoles y viernes a las 8:00. Para dar el presente <span className="font-medium text-tinta">escaneás el QR del aula</span>: la
              primera vez ponés tu DNI y después es automático. Para quedar regular necesitás el{' '}
              <span className="font-medium text-tinta">{UMBRAL_REGULARIDAD}% de asistencia</span>.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/p/" className="btn btn-primario !px-5 !py-3 text-base">
                <ScanLine className="h-5 w-5" /> Dar presente
              </a>
              <Link to="/cronograma" className="btn btn-secundario !px-5 !py-3 text-base">
                <CalendarDays className="h-5 w-5" /> Cronograma
              </Link>
              <Agendar className="[&>summary]:!px-5 [&>summary]:!py-3 [&>summary]:text-base" />
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

          <div className="entrada relative z-10 lg:col-span-5" style={{ animationDelay: '0.12s' }}>
            {actual ? <ProximaClase sesion={actual} /> : <div className="tarjeta hud p-7 text-slate-600">El cursado 2026 finalizó. ¡Éxitos en los finales!</div>}
          </div>
        </div>
      </section>

      <EcgLine latidos={9} className="h-10 w-full" />

      <div className="mx-auto max-w-7xl space-y-24 px-4 py-20 sm:px-6">
        {/* ── Cómo dar el presente ── */}
        <Seccion etiqueta="Paso a paso" titulo="Cómo dar el presente">
          <ol className="grid gap-4 md:grid-cols-3">
            {PASOS_PRESENTE.map((p, i) => (
              <li key={p.titulo} className="al-ver tarjeta hud relative p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rosa-suave text-rosa">
                    <p.icono className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-slate-300">Paso {i + 1}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-tinta">{p.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.texto}</p>
              </li>
            ))}
          </ol>
          <a href="/p/?tutorial=1" className="al-ver btn btn-secundario mt-5 !py-3">
            <PlayCircle className="h-5 w-5 text-rosa" /> Ver el paso a paso con un ejemplo
          </a>
          <p className="mt-4 text-sm text-slate-500">
            ¿La cámara no lee el QR? Entrá a <a href="/p/" className="font-medium text-rosa underline-offset-4 hover:underline">{location.host}/p/</a> y escribí el código de 6 dígitos que aparece debajo.
          </p>

          <details className="al-ver group mt-6 rounded-2xl border border-linea bg-white/70">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-medium text-tinta">
                <ShieldCheck className="h-5 w-5 text-vital" /> ¿Por qué no se puede dar presente por otro?
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
              {SEGURIDAD.map((s) => (
                <div key={s.titulo} className="rounded-xl border border-linea bg-slate-50/70 p-4">
                  <s.icono className="h-5 w-5 text-cian" />
                  <div className="mt-2 font-semibold text-tinta">{s.titulo}</div>
                  <p className="mt-1 text-sm text-slate-600">{s.texto}</p>
                  <div className="mt-2 font-mono text-[0.62rem] text-slate-400">{s.tecnico}</div>
                </div>
              ))}
            </div>
            <p className="px-5 pb-5 text-xs text-slate-500">El DNI sólo se usa para encontrarte en la planilla de la materia. No se pide ubicación ni se instala nada.</p>
          </details>
        </Seccion>

        {/* ── Regularidad ── */}
        <Seccion etiqueta="Regularidad" titulo={<>Necesitás el {UMBRAL_REGULARIDAD}% de las teóricas</>}>
          <div className="al-ver tarjeta hud grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-slate-600">
                Se cuenta sobre las clases en las que se tomó asistencia. Con la app se toma desde el 07/10: son {conApp} clases, así que necesitás{' '}
                <b className="text-tinta">al menos {minimo(conApp)} presentes</b> (podés faltar a {conApp - minimo(conApp)}). Si la cátedra también carga las dos
                primeras, serían {minimo(CRONOGRAMA.length)} de {CRONOGRAMA.length}.
              </p>
              <p className="mt-3 text-sm text-slate-500">Cada vez que das el presente, la pantalla te muestra cuántos llevás y cuántas faltas te quedan.</p>
              <a href="/p/?mia=1" className="btn btn-secundario mt-4">
                <CalendarDays className="h-4 w-4 text-rosa" /> Ver mi asistencia
              </a>
            </div>
            <div aria-label={`${minimo(conApp)} presentes de ${conApp} clases`}>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                {Array.from({ length: conApp }, (_, i) => (
                  <span
                    key={i}
                    className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold ${i < minimo(conApp) ? 'bg-vital text-white shadow-[0_6px_14px_-8px_rgb(14_159_104/0.8)]' : 'border border-dashed border-slate-300 text-slate-400'}`}
                  >
                    {i < minimo(conApp) ? <CircleCheck className="h-4 w-4" /> : i + 1}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[0.65rem] text-slate-500">
                <span className="text-vital">{minimo(conApp)} presentes</span>
                <span>hasta {conApp - minimo(conApp)} faltas</span>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion etiqueta="Programa" titulo={<>Del eje hipotálamo-hipófiso-ovárico <span className="text-slate-400">a la oncología ginecológica</span></>}>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="al-ver lg:col-span-7">
              <HormoneMonitor />
            </div>
            <div className="al-ver tarjeta hud flex flex-col p-6 lg:col-span-5">
              <p className="text-slate-600">
                {total} temas en {CRONOGRAMA.length} encuentros, del {CATEDRA.periodo}. Tocá un área en el cronograma para ver sólo esas clases.
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

        {/* ── Preguntas frecuentes ── */}
        <Seccion etiqueta="Dudas" titulo="Preguntas frecuentes">
          <div className="grid gap-3 lg:grid-cols-2">
            {PREGUNTAS.map((q) => (
              <details key={q.p} className="al-ver group tarjeta self-start">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cian-suave text-cian">
                    <q.icono className="h-4 w-4" />
                  </span>
                  <span className="flex-1 font-medium text-tinta">{q.p}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-4 pl-[4.25rem] text-sm text-slate-600">
                  <p>{q.r}</p>
                  <Link to={`/?elena=1&q=${encodeURIComponent(q.p)}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-rosa hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" /> Preguntale a Elena
                  </Link>
                </div>
              </details>
            ))}
          </div>
        </Seccion>
      </div>
      <Pie />
    </main>
  )
}
