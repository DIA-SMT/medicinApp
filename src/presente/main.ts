// Registro de asistencia del alumno: página mínima sin React ni librerías.
// Lo único que se le pide al alumno es el DNI, y sólo la primera vez.
import './presente.css'
import { publico } from '../data/publico'
import type { CodigoError, Progreso, ResultadoMarca } from '../data/types'
import { GEO_MODO, PASE_TTL_S, UMBRAL_REGULARIDAD } from '../lib/config'
import { CRONOGRAMA, DNIS_ENSAYO, sesionPorId, type Sesion } from '../lib/cronograma'
import { firmar, huellaCorta, obtenerDispositivo, type Dispositivo } from '../lib/device'
import { obtenerUbicacion } from '../lib/geo'
import { cuenta, diaSemana, fechaCorta, hmArt, horaArt, hoyIso, infoVentana, instante, ventanaDefault, type Ventana } from '../lib/time'
import { cryptoDisponible } from '../lib/totp'

const app = document.getElementById('app')!
const params = new URLSearchParams(location.search)
const CLAVE_DNI = 'ciclo:alumno:dni'
const CLAVE_NOMBRE = 'ciclo:alumno:nombre'
// Misma clave que tutorial.ts: se lee acá para no descargar el tutorial a quien ya lo ocultó.
const CLAVE_TUTORIAL_OCULTO = 'ciclo:tutorial:oculto'
let tutorialMostrado = false

/** Tutorial con caso ficticio: módulo aparte, se descarga sólo si se va a mostrar. */
const abrirTutorial = (opciones: { vence?: number; textoFinal: string; alCerrar: () => void }) =>
  import('./tutorial').then((m) => m.mostrarTutorial(opciones)).catch(() => opciones.alCerrar())

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const soloDigitos = (s: string) => s.replace(/\D/g, '')
const conPuntos = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const guardar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* navegación privada: se vuelve a pedir el DNI la próxima vez */
  }
}
const leer = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

// ── Íconos inline (unos pocos bytes, sin librería) ──
const svg = (d: string, cls = 'h-6 w-6') =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const I = {
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  alerta: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
  huella: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
}

// ── Estado vivo de la pantalla: un solo reloj actualiza cuentas regresivas, la barra del pase y el estado del registro ──

let ventanas: Record<string, Ventana> | null = null
let sesionEnPantalla: Sesion | undefined
let alVencerPase: (() => void) | null = null
let temporizador: ReturnType<typeof setTimeout> | undefined

function chipEstado(s: Sesion | undefined) {
  if (!s || !ventanas) return ''
  const v = infoVentana(s.fecha, ventanas[s.id] ?? ventanaDefault())
  // Otro día sólo interesa si el docente lo abrió a mano.
  if (s.fecha !== hoyIso() && !(v.manual && v.estado === 'abierta')) return ''
  const ahora = Date.now()
  if (v.estado === 'abierta')
    return `<span class="chip chip-vital"><span class="punto"></span>Registro abierto · cierra en <b class="font-mono tabular-nums">${cuenta(v.cierra - ahora)}</b></span>`
  if (v.estado === 'programada')
    return `<span class="chip chip-ambar">${svg(I.reloj, 'h-3.5 w-3.5')}Abre a las ${hmArt(v.abre)} · en <b class="font-mono tabular-nums">${cuenta(v.abre - ahora)}</b></span>`
  return `<span class="chip chip-gris">Registro cerrado a las ${hmArt(v.cierra)}</span>`
}

function tick() {
  const ahora = Date.now()
  const chip = document.getElementById('chip')
  if (chip) chip.innerHTML = chipEstado(sesionEnPantalla)
  document.querySelectorAll<HTMLElement>('[data-hasta]').forEach((el) => {
    const resta = Number(el.dataset.hasta) - ahora
    el.textContent = resta <= 0 && el.dataset.fin ? el.dataset.fin : cuenta(resta)
  })
  document.querySelectorAll<HTMLElement>('[data-barra]').forEach((el) => {
    const total = Number(el.dataset.hasta) - Number(el.dataset.desde)
    const resta = Number(el.dataset.hasta) - ahora
    el.style.width = `${Math.max(0, Math.min(100, (resta / total) * 100))}%`
    el.closest('[data-pase]')?.classList.toggle('apurado', resta < 30_000)
    if (resta <= 0 && alVencerPase) alVencerPase()
  })
}
setInterval(tick, 1000)

// ── Piezas de la pantalla ──

const MARCA = `
  <header class="flex items-center gap-2.5">
    <svg viewBox="0 0 48 48" class="h-8 w-8" aria-hidden="true"><g fill="none" stroke="#e0246f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 16.5C17 12.8 20 11 24 11s7 1.8 7 5.5c0 5.8-2.4 10.6-4.4 13.6v5c0 1.5-1.2 2.6-2.6 2.6s-2.6-1.1-2.6-2.6v-5C19.4 27.1 17 22.3 17 16.5Z"/><path d="M17.6 14.6c-3.4-3.5-8-4-10-1.1-1.4 2-.6 4.7 1.7 5.6"/><path d="M30.4 14.6c3.4-3.5 8-4 10-1.1 1.4 2 .6 4.7-1.7 5.6"/></g><ellipse cx="11.3" cy="22.6" rx="3.3" ry="2.5" fill="#f472a8"/><ellipse cx="36.7" cy="22.6" rx="3.3" ry="2.5" fill="#f472a8"/></svg>
    <div class="leading-none">
      <div class="text-[1.05rem] font-bold tracking-[0.22em] text-tinta">CICLO</div>
      <div class="mt-1 font-mono text-[0.58rem] tracking-[0.18em] text-slate-500 uppercase">Ginecología · FM-UNT</div>
    </div>
    <a href="/" class="ml-auto text-xs text-slate-400 underline-offset-4 hover:underline">Inicio</a>
  </header>`

const tarjetaClase = (s: Sesion) => `
  <div class="mt-5 rounded-2xl border border-linea bg-white/80 px-4 py-3">
    <div class="etiqueta">${s.ensayo ? '<span class="text-ambar">Ensayo · no cuenta para la regularidad</span>' : `Clase Nº ${String(s.n).padStart(2, '0')} de ${CRONOGRAMA.length} · ${diaSemana(s.fecha)} ${fechaCorta(s.fecha)}`}</div>
    <div class="mt-1 font-semibold leading-snug text-tinta">${esc(s.temas.map((t) => t.titulo).join(' + '))}</div>
    <div id="chip" class="empty:hidden mt-2">${chipEstado(s)}</div>
  </div>`

// Elena (la asistente) vive en la app: se abre en otra pestaña para no perder el registro a medias.
const enlaceElena = (pregunta?: string) => `/#/?elena=1${pregunta ? `&q=${encodeURIComponent(pregunta)}` : ''}`

const PIE = `<div class="mt-auto pt-8 text-center">
  <a href="${enlaceElena()}" target="_blank" rel="noopener" class="text-xs font-medium text-rosa underline-offset-4 hover:underline">¿Dudas? Preguntale a Elena</a>
  <p class="mt-3 font-mono text-[0.6rem] tracking-[0.15em] text-slate-400 uppercase">Cátedra de Ginecología · Facultad de Medicina UNT</p>
</div>`

/** Paso 1: escaneo (ya hecho al llegar acá) · 2: DNI · 3: confirmar. */
const pasos = (actual: 2 | 3) => `
  <ol class="pasos" aria-label="Paso ${actual} de 3">
    ${['Escaneo', 'Tu DNI', 'Confirmar'].map((t, i) => `<li class="${i + 1 < actual ? 'hecho' : i + 1 === actual ? 'actual' : ''}"><span>${i + 1 < actual ? svg(I.check, 'h-3 w-3') : i + 1}</span>${t}</li>`).join('')}
  </ol>`

/** Barra de los 3 minutos del pase: se vacía sola y, si llega a cero, avisa. */
const barraPase = (vence: number) => `
  <div data-pase class="pase mt-5">
    <div class="flex items-center justify-between text-xs text-slate-500"><span>Tiempo para completar</span><b data-hasta="${vence}" class="font-mono tabular-nums text-tinta">${cuenta(vence - Date.now())}</b></div>
    <div class="barra mt-1.5"><span data-barra data-desde="${vence - PASE_TTL_S * 1000}" data-hasta="${vence}" style="width:${Math.min(100, ((vence - Date.now()) / (PASE_TTL_S * 1000)) * 100)}%"></span></div>
  </div>`

function pintar(sesion: Sesion | undefined, contenido: string) {
  document.getElementById('tutorial')?.remove()
  alVencerPase = null
  clearTimeout(temporizador)
  sesionEnPantalla = sesion
  app.innerHTML = `${MARCA}${sesion ? tarjetaClase(sesion) : ''}<section class="entrada mt-6">${contenido}</section>${PIE}`
}

/** "a las 07:30" si es hoy; "el viernes 09/10 a las 07:30" si es otro día. */
const cuandoAbre = (ms: number) => {
  const dia = hoyIso(ms)
  return dia === hoyIso() ? `a las ${hmArt(ms)}` : `el ${diaSemana(dia).toLowerCase()} ${fechaCorta(dia)} a las ${hmArt(ms)}`
}

const ERRORES: Record<CodigoError, { titulo: string; texto: (d?: string) => string; reintentar?: boolean }> = {
  SESION_INEXISTENTE: { titulo: 'Clase no encontrada', texto: () => 'El código no corresponde a ninguna clase del cronograma.' },
  PROGRAMADA: { titulo: 'Todavía no abrió el registro', texto: (d) => `El registro de esta clase abre ${d ? cuandoAbre(Number(d)) : 'más tarde'}. Volvé a escanear en ese momento.` },
  CERRADA: { titulo: 'Registro cerrado', texto: (d) => `La asistencia cerró a las ${d ? hmArt(Number(d)) : '—'}. Si estuviste presente, avisale a la cátedra.` },
  CODIGO_INVALIDO: { titulo: 'Código vencido', texto: () => 'El QR proyectado cambia cada 20 segundos. Escaneá el que se ve ahora en pantalla (las capturas reenviadas no sirven).' },
  PASE_VENCIDO: { titulo: 'Se agotó el tiempo', texto: () => 'Pasaron más de 3 minutos desde que escaneaste. Volvé a escanear el QR del aula.' },
  DNI_DESCONOCIDO: { titulo: 'DNI no encontrado', texto: () => 'Ese DNI no figura en la planilla de la materia.' },
  DISPOSITIVO_AJENO: { titulo: 'Tu presente se da desde otro celular', texto: () => 'Por seguridad cada alumno usa un único celular. Si cambiaste de teléfono o borraste los datos del navegador, pedile a la cátedra que lo libere o que te dé el presente a mano.' },
  DISPOSITIVO_OCUPADO: { titulo: 'Este celular ya registró a otra persona', texto: () => 'Cada celular queda asociado a un solo alumno. Registrate desde tu propio teléfono o pedile a la cátedra el presente manual.' },
  FIRMA_INVALIDA: { titulo: 'No se pudo verificar el celular', texto: () => 'Revisá que la fecha y hora del teléfono estén en automático y volvé a intentar.', reintentar: true },
  FUERA_DE_RANGO: { titulo: 'Fuera de la Facultad', texto: () => 'El presente sólo se acepta desde el aula.', reintentar: true },
  SIN_CRYPTO: { titulo: 'Navegador no compatible', texto: () => 'Abrí el enlace con Chrome o Safari actualizados.' },
  NO_AUTORIZADO: { titulo: 'Sin autorización', texto: () => 'No tenés permisos para esta acción.' },
  RED: { titulo: 'Sin conexión', texto: (d) => d ?? 'Revisá los datos móviles o el Wi-Fi y volvé a intentar.', reintentar: true },
}

function mostrarError(sesion: Sesion | undefined, error: CodigoError, detalle?: string, reintentar?: () => void) {
  const e = ERRORES[error]
  // Antes de la apertura: cuenta regresiva en vivo. Con el póster (código fijo) se reintenta solo al abrir.
  const abre = error === 'PROGRAMADA' && detalle ? Number(detalle) : 0
  // Sólo si falta poco (≤ 30 min): nadie deja la pantalla abierta días.
  const auto = !!abre && !!reintentar && !/^\d{6}$/.test(params.get('c') ?? '') && abre - Date.now() < 30 * 60e3
  pintar(
    sesion,
    `<div class="tarjeta hud p-6 text-center">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl ${abre ? 'bg-ambar-suave text-ambar' : 'bg-rosa-suave text-rosa'}">${svg(abre ? I.reloj : I.alerta, 'h-7 w-7')}</div>
      <h1 class="mt-4 text-xl font-semibold text-tinta">${esc(e.titulo)}</h1>
      ${abre ? `<div class="mt-3 font-mono text-4xl font-semibold text-ambar tabular-nums" data-hasta="${abre}" data-fin="¡Ya abrió!">${cuenta(abre - Date.now())}</div>` : ''}
      <p class="mt-2 text-slate-600">${esc(auto ? `El registro abre ${cuandoAbre(abre)}. Dejá esta pantalla abierta: el presente se da solo en ese momento.` : e.texto(detalle))}</p>
      <div class="mt-6 flex flex-col gap-2">
        ${e.reintentar && reintentar ? '<button id="reintentar" class="btn btn-primario w-full !py-3">Reintentar</button>' : ''}
        <a href="/p/" class="btn btn-secundario w-full">Ingresar el código a mano</a>
        <a href="${enlaceElena(`Al dar el presente me apareció «${e.titulo}». ¿Qué hago?`)}" target="_blank" rel="noopener" class="mt-1 text-sm font-medium text-rosa underline-offset-4 hover:underline">¿Qué hago? Preguntale a Elena</a>
      </div>
      <div class="mt-3 font-mono text-[0.6rem] tracking-widest text-slate-300">${error}</div>
    </div>`,
  )
  document.getElementById('reintentar')?.addEventListener('click', () => reintentar?.())
  if (auto) temporizador = setTimeout(reintentar!, Math.max(0, abre - Date.now()) + 1500)
}

function cargando(sesion: Sesion | undefined, texto: string, saludo?: string) {
  pintar(
    sesion,
    `<div class="flex flex-col items-center py-14 text-center">
      <div class="relative grid h-28 w-28 place-items-center">
        <span class="animate-latido absolute inset-5 rounded-full border-2 border-cian/50"></span>
        <span class="animate-latido absolute inset-5 rounded-full border-2 border-cian/50" style="animation-delay:.5s"></span>
        <div class="grid h-16 w-16 place-items-center rounded-2xl border border-cian/30 bg-cian-suave text-cian">${svg(I.qr, 'h-8 w-8')}</div>
      </div>
      ${saludo ? `<div class="mt-5 text-sm font-medium text-rosa">${esc(saludo)}</div>` : ''}
      <div class="${saludo ? 'mt-1' : 'mt-5'} text-lg font-semibold text-tinta">${esc(texto)}</div>
    </div>`,
  )
}

/** Cuánto le falta al alumno para el 70%, con la misma cuenta que la planilla de la cátedra. */
function bloqueProgreso(p: Progreso) {
  const total = p.dictadas + p.restantes
  if (!total) return ''
  const meta = Math.ceil((total * UMBRAL_REGULARIDAD) / 100)
  const faltas = p.dictadas - p.presentes
  const permitidas = total - meta
  const [tono, mensaje] =
    p.presentes >= meta
      ? ['text-vital', '¡Ya tenés la asistencia para quedar regular!']
      : faltas > permitidas
        ? ['text-rosa-oscuro', `Con ${faltas} faltas ya no llegás al ${UMBRAL_REGULARIDAD}%. Hablalo con la cátedra.`]
        : faltas === permitidas
          ? ['text-ambar', 'Ojo: no podés faltar a ninguna clase más.']
          : ['text-vital', `Vas bien: podés faltar ${permitidas - faltas === 1 ? 'a 1 clase más' : `a ${permitidas - faltas} clases más`}.`]
  return `
    <div class="tarjeta mt-4 p-4 text-left">
      <div class="flex items-baseline justify-between">
        <span class="etiqueta">Tu regularidad</span>
        <span class="font-mono text-sm text-tinta tabular-nums"><b>${p.presentes}</b> de ${meta} presentes</span>
      </div>
      <div class="barra mt-2 !h-2.5"><span class="crece" style="width:${Math.min(100, (p.presentes / meta) * 100)}%"></span></div>
      <div class="mt-2 flex justify-between font-mono text-[0.68rem] text-slate-400 tabular-nums">
        <span>Faltas: ${faltas} de ${permitidas} permitidas</span><span>Quedan ${p.restantes} ${p.restantes === 1 ? 'clase' : 'clases'}</span>
      </div>
      <p class="mt-3 text-sm font-medium ${tono}">${mensaje}</p>
      <p class="mt-1 text-[0.68rem] text-slate-400">Para quedar regular hace falta el ${UMBRAL_REGULARIDAD}% de las teóricas en las que se tomó asistencia. La planilla oficial la lleva la cátedra.</p>
    </div>`
}

/** Chispas de festejo en CSS (sin librerías): 12 puntos que salen del círculo verde. */
const chispas = () =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    const r = 70 + (i % 3) * 14
    const c = ['#e0246f', '#f472a8', '#0e9f68', '#b04aa6'][i % 4]
    return `<span class="chispa" style="--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r)}px;background:${c};animation-delay:${0.35 + (i % 4) * 0.04}s"></span>`
  }).join('')

function exito(sesion: Sesion, r: Extract<ResultadoMarca, { ok: true }>, huella: string) {
  const proxima = CRONOGRAMA.find((s) => s.fecha > sesion.fecha)
  const vProx = proxima ? (ventanas?.[proxima.id] ?? ventanaDefault()) : null
  pintar(
    sesion,
    `<div class="text-center">
      <div class="relative mx-auto grid h-36 w-36 place-items-center">
        <span class="onda absolute inset-0 rounded-full border-2 border-vital/40"></span>
        <span class="onda absolute inset-0 rounded-full border-2 border-vital/40" style="animation-delay:.6s"></span>
        ${r.estado === 'REGISTRADO' ? chispas() : ''}
        <div class="pop grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-vital to-cian shadow-[0_18px_40px_-14px_rgb(14_159_104/0.8)]">
          <svg viewBox="0 0 24 24" class="h-12 w-12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="trazo" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </div>
      </div>
      <h1 class="mt-3 text-4xl font-bold text-tinta">${r.estado === 'REGISTRADO' ? '¡Presente!' : 'Ya estabas registrado'}</h1>
      <p class="mt-1 text-slate-500">${esc(r.nombre)}</p>
      <div class="mt-4 font-mono text-5xl font-semibold text-vital tabular-nums">${horaArt(r.marcadoEn)}</div>
      ${sesion.ensayo ? '<p class="mt-4 rounded-2xl border border-ambar/30 bg-ambar-suave px-4 py-3 text-sm text-ambar">Fue un ensayo: no cuenta para tu asistencia y no quedó guardado en este celular.</p>' : r.progreso ? bloqueProgreso(r.progreso) : ''}
      ${
        proxima && vProx && !sesion.ensayo
          ? `<div class="mt-4 flex items-center gap-3 rounded-2xl border border-linea bg-white/80 px-4 py-3 text-left">
              <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cian-suave text-cian">${svg(I.calendario, 'h-5 w-5')}</div>
              <div class="min-w-0 text-sm"><div class="font-semibold text-tinta">Próxima: ${diaSemana(proxima.fecha)} ${fechaCorta(proxima.fecha)}</div><div class="truncate text-slate-500">Registro de ${vProx.apertura} a ${vProx.cierre} · ${esc(proxima.temas[0].titulo)}</div></div>
            </div>`
          : ''
      }
      <div class="tarjeta mt-4 p-4 text-left font-mono text-xs">
        <div class="flex justify-between border-b border-linea pb-2"><span class="text-slate-400">Comprobante</span><span class="text-tinta">${esc(r.comprobante)}</span></div>
        <div class="flex items-center justify-between pt-2"><span class="text-slate-400">Celular vinculado</span><span class="flex items-center gap-1 text-vital">${svg(I.huella, 'h-3.5 w-3.5')} ${huellaCorta(huella)}</span></div>
      </div>
      <a href="/p/?mia=1" class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-rosa underline-offset-4 hover:underline">${svg(I.calendario, 'h-4 w-4')} Ver todas mis clases</a>
      <p class="mt-3 text-xs text-slate-400">Listo, podés cerrar esta pantalla. La próxima clase alcanza con escanear.</p>
    </div>`,
  )
  if (r.estado === 'REGISTRADO') navigator.vibrate?.([30, 50, 80])
}

// ── Mi asistencia: las clases del alumno, consultadas desde su celular vinculado ──

const enlaceMiAsistencia = (texto = 'Ver mi asistencia') =>
  leer(CLAVE_DNI) ? `<a href="/p/?mia=1" class="btn btn-secundario mt-4 w-full">${svg(I.calendario, 'h-4 w-4 text-rosa')} ${texto}</a>` : ''

const ESTADOS = {
  presente: ['Presente', 'bg-vital-suave text-vital'],
  manual: ['Presente · manual', 'bg-violeta-suave text-violeta'],
  ausente: ['Ausente', 'bg-rosa-suave text-rosa-oscuro'],
  hoy: ['Hoy', 'bg-ambar-suave text-ambar'],
  futura: ['Próxima', 'bg-slate-100 text-slate-500'],
  sinRegistro: ['No se tomó', 'bg-slate-100 text-slate-500'],
} as const

async function verMiAsistencia() {
  history.replaceState(null, '', '/p/?mia=1')
  const dni = leer(CLAVE_DNI)
  if (!dni) {
    return pintar(
      undefined,
      `<div class="tarjeta hud p-6">
        <div class="grid h-12 w-12 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.calendario)}</div>
        <h1 class="mt-4 text-2xl font-semibold text-tinta">Mi asistencia</h1>
        <p class="mt-2 text-slate-600">Todavía no diste presente desde este celular. La primera vez es en clase: escaneás el QR y escribís tu DNI. Desde ahí vas a poder ver acá todas tus clases.</p>
        <a href="/p/?tutorial=1" class="btn btn-secundario mt-5 w-full">Ver cómo se da el presente</a>
      </div>`,
    )
  }
  if (!cryptoDisponible()) return mostrarError(undefined, 'SIN_CRYPTO')
  cargando(undefined, 'Buscando tus clases')
  let huella: string
  try {
    huella = (await obtenerDispositivo()).huella
  } catch {
    return mostrarError(undefined, 'SIN_CRYPTO')
  }
  const r = await (await publico()).miAsistencia(dni, huella)
  if (!r.ok) {
    if (r.error === 'DISPOSITIVO_AJENO' || r.error === 'DNI_DESCONOCIDO') {
      return pintar(
        undefined,
        `<div class="tarjeta hud p-6 text-center">
          <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.huella, 'h-7 w-7')}</div>
          <h1 class="mt-4 text-xl font-semibold text-tinta">Se consulta desde tu celular</h1>
          <p class="mt-2 text-slate-600">Tu asistencia sólo se puede ver desde el celular con el que das el presente. Si cambiaste de teléfono o borraste los datos del navegador, pedile a la cátedra que libere el anterior.</p>
        </div>`,
      )
    }
    return mostrarError(undefined, r.error, r.detalle, verMiAsistencia)
  }

  const hoy = hoyIso()
  const filas = CRONOGRAMA.map((sesion) => {
    const c = r.clases.find((x) => x.id === sesion.id)
    const estado: keyof typeof ESTADOS = c?.marca
      ? c.marca === 'manual'
        ? 'manual'
        : 'presente'
      : c?.dictada
        ? 'ausente'
        : sesion.fecha === hoy
          ? 'hoy'
          : sesion.fecha > hoy
            ? 'futura'
            : 'sinRegistro'
    const [texto, clases] = ESTADOS[estado]
    return `<li class="flex items-center gap-3 px-4 py-2.5">
      <div class="w-12 shrink-0 font-mono text-xs text-slate-400">${fechaCorta(sesion.fecha)}</div>
      <div class="min-w-0 flex-1 truncate text-sm text-tinta">${esc(sesion.temas[0].titulo)}</div>
      <span class="shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${clases}">${texto}</span>
    </li>`
  }).join('')

  pintar(
    undefined,
    `<div>
      <div class="etiqueta">Mi asistencia</div>
      <h1 class="mt-1 text-2xl font-semibold text-tinta">${esc(r.nombre)}</h1>
      ${bloqueProgreso(r.progreso)}
      <ol class="tarjeta mt-4 divide-y divide-slate-100 overflow-hidden">${filas}</ol>
      <p class="mt-3 text-xs text-slate-400">«No se tomó»: ese día no hubo registro de asistencia y no cuenta. Si algo no coincide con lo que recordás, avisale a la cátedra.</p>
    </div>`,
  )
}

// ── Flujo ──

async function registrar(sesion: Sesion, codigo: string) {
  if (!cryptoDisponible()) return mostrarError(sesion, 'SIN_CRYPTO')
  const api = await publico()
  const disp = obtenerDispositivo()
  cargando(sesion, 'Verificando código')

  // El pase sobrevive a una recarga accidental de la página durante 3 minutos. `vence` se mide con el
  // reloj del celular (desde que llegó el pase, con 10 s de margen) para no depender de que esté en hora.
  const clavePase = `ciclo:pase:${sesion.id}`
  // `desfase`: servidor − celular. La firma lleva un timestamp que el servidor exige dentro de ±5 min:
  // con la hora del servidor, un celular con la hora mal configurada igual puede dar presente.
  let pase: { pase: string; vence: number; desfase?: number } | null = null
  try {
    const p = JSON.parse(sessionStorage.getItem(clavePase) ?? 'null')
    if (p && p.vence > Date.now()) pase = p
  } catch {
    /* sin sessionStorage */
  }
  if (!pase) {
    const r = await api.abrirPase(sesion.id, codigo)
    if (!r.ok) return mostrarError(sesion, r.error, r.detalle, () => registrar(sesion, codigo))
    pase = { pase: r.pase, vence: Date.now() + (PASE_TTL_S - 10) * 1000, desfase: r.ahora ? r.ahora - Date.now() : 0 }
    try {
      sessionStorage.setItem(clavePase, JSON.stringify(pase))
    } catch {
      /* ok */
    }
  }

  let dispositivo: Dispositivo
  try {
    dispositivo = await disp
  } catch {
    return mostrarError(sesion, 'SIN_CRYPTO')
  }

  const vencido = () => {
    try {
      sessionStorage.removeItem(clavePase)
    } catch {
      /* ok */
    }
    mostrarError(sesion, 'PASE_VENCIDO')
  }

  const marcar = async (dni: string) => {
    cargando(sesion, 'Registrando presente')
    const ts = Date.now() + (pase!.desfase ?? 0)
    const firma = await firmar(dispositivo, `${sesion.id}|${pase!.pase}|${dni}|${ts}`)
    const ubicacion = GEO_MODO === 'off' ? null : await obtenerUbicacion(6000)
    const r = await api.marcar({ sesionId: sesion.id, pase: pase!.pase, dni, huella: dispositivo.huella, publicJwk: dispositivo.publicJwk, firma, ts, ubicacion })
    if (!r.ok) return mostrarError(sesion, r.error, r.detalle, () => marcar(dni))
    // En el ensayo no se recuerda el DNI: puede ser uno de prueba y el miércoles confundiría al dueño del celular.
    if (!sesion.ensayo) {
      guardar(CLAVE_DNI, dni)
      guardar(CLAVE_NOMBRE, r.nombre)
    }
    try {
      sessionStorage.removeItem(clavePase)
    } catch {
      /* ok */
    }
    exito(sesion, r, dispositivo.huella)
  }

  const identificar = async (dni: string, automatico: boolean) => {
    const nombre = automatico ? leer(CLAVE_NOMBRE) : null
    cargando(sesion, automatico ? 'Registrando tu presente' : 'Buscando en el padrón', nombre ? `Hola de nuevo, ${nombre}` : undefined)
    const r = await api.identificar(sesion.id, pase!.pase, dni, dispositivo.huella)
    if (!r.ok) {
      if (r.error === 'DNI_DESCONOCIDO') {
        guardar(CLAVE_DNI, null)
        guardar(CLAVE_NOMBRE, null)
        return pedirDni('Ese DNI no figura en la planilla de Ginecología. Revisalo.')
      }
      return mostrarError(sesion, r.error, r.detalle, () => identificar(dni, automatico))
    }
    if (r.vinculo === 'otro') return mostrarError(sesion, 'DISPOSITIVO_AJENO')
    // Celular ya vinculado a este alumno: presente sin tocar nada.
    if (r.vinculo === 'este' && automatico) return marcar(dni)
    confirmar(dni, r.nombre, r.libreta)
  }

  const confirmar = (dni: string, nombre: string, libreta: string) => {
    pintar(
      sesion,
      `${pasos(3)}
      <div class="tarjeta hud mt-4 p-6">
        <div class="etiqueta">¿Sos vos?</div>
        <div class="mt-4 flex items-center gap-4">
          <div class="pop grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rosa to-violeta text-2xl font-bold text-white">${esc(nombre.charAt(0))}</div>
          <div class="min-w-0">
            <div class="truncate text-2xl font-semibold text-tinta">${esc(nombre)}</div>
            <div class="font-mono text-sm text-slate-400">Libreta ${esc(libreta)}</div>
            <div class="font-mono text-sm text-slate-400">DNI ${conPuntos(dni)}</div>
          </div>
        </div>
        <button id="si" class="btn btn-primario mt-6 w-full !py-4 text-lg">Sí, dar presente</button>
        <button id="no" class="mt-3 w-full text-center text-sm text-slate-400 underline-offset-4 hover:underline">No soy yo · cambiar DNI</button>
        ${barraPase(pase!.vence)}
        <p class="mt-4 flex items-start gap-2 text-xs text-slate-400">${svg(I.huella, 'mt-0.5 h-4 w-4 shrink-0 text-cian')} Este celular queda vinculado a tu libreta: la próxima vez el presente es automático.</p>
      </div>`,
    )
    alVencerPase = vencido
    document.getElementById('si')!.addEventListener('click', () => marcar(dni))
    document.getElementById('no')!.addEventListener('click', () => {
      guardar(CLAVE_DNI, null)
      guardar(CLAVE_NOMBRE, null)
      pedirDni()
    })
  }

  const pedirDni = (aviso?: string) => {
    pintar(
      sesion,
      `${pasos(2)}
      <form id="f" class="tarjeta hud mt-4 p-6">
        <div class="grid h-12 w-12 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.llave)}</div>
        <h1 class="mt-4 text-2xl font-semibold text-tinta">Ingresá tu DNI</h1>
        <p class="mt-1 text-sm text-slate-500">Sólo esta vez. Después alcanza con escanear el QR.</p>
        <div id="caja" class="caja-dni mt-5">
          <input id="dni" inputmode="numeric" autocomplete="off" placeholder="Ej. 40.123.456" class="campo font-mono text-2xl tracking-[0.08em]" maxlength="11" aria-label="DNI, sólo números" />
          <span class="ok-dni">${svg(I.check, 'h-5 w-5')}</span>
        </div>
        <p id="ayuda" class="mt-2 min-h-5 text-sm ${aviso ? 'text-rosa-oscuro' : 'text-slate-400'}">${esc(aviso ?? 'Sin puntos: se agregan solos.')}</p>
        ${__DEMO__ ? '<p class="mt-1 rounded-xl border border-ambar/30 bg-ambar-suave px-3 py-2 text-xs text-ambar">Modo demo: probá con el DNI ficticio <b class="font-mono">10000001</b></p>' : ''}
        ${sesion.ensayo ? `<p class="mt-1 rounded-xl border border-ambar/30 bg-ambar-suave px-3 py-2 text-xs text-ambar">Ensayo: podés usar un DNI de prueba, de <b class="font-mono">${DNIS_ENSAYO[0]}</b> a <b class="font-mono">${DNIS_ENSAYO[DNIS_ENSAYO.length - 1]}</b>.</p>` : ''}
        <button id="ok" class="btn btn-primario mt-4 w-full !py-3.5 text-base" disabled>Continuar</button>
        ${barraPase(pase!.vence)}
      </form>`,
    )
    alVencerPase = vencido
    const input = document.getElementById('dni') as HTMLInputElement
    const ok = document.getElementById('ok') as HTMLButtonElement
    const caja = document.getElementById('caja')!
    const ayuda = document.getElementById('ayuda')!
    // Primera vez en este celular: el paso a paso con el caso ficticio, encima del formulario.
    const conTutorial = !aviso && !tutorialMostrado && leer(CLAVE_TUTORIAL_OCULTO) !== '1'
    if (!conTutorial) input.focus()
    input.addEventListener('input', () => {
      const d = soloDigitos(input.value).slice(0, 9)
      input.value = conPuntos(d)
      const valido = d.length >= 7
      caja.classList.toggle('valido', valido)
      ok.disabled = !valido
      ok.classList.toggle('listo', valido)
      ayuda.className = 'mt-2 min-h-5 text-sm text-slate-400'
      ayuda.textContent = valido ? 'Perfecto. Tocá «Continuar».' : d.length ? `Faltan ${7 - d.length} números como mínimo.` : 'Sin puntos: se agregan solos.'
    })
    document.getElementById('f')!.addEventListener('submit', (e) => {
      e.preventDefault()
      const dni = soloDigitos(input.value)
      if (dni.length >= 7) identificar(dni, false)
    })
    if (conTutorial) {
      tutorialMostrado = true
      abrirTutorial({ vence: pase!.vence, textoFinal: 'Empezar', alCerrar: () => document.getElementById('dni')?.focus() })
    }
  }

  const dniGuardado = leer(CLAVE_DNI)
  if (dniGuardado) await identificar(dniGuardado, true)
  else pedirDni()
}

// ── Escáner dentro de la página (sólo donde el navegador trae BarcodeDetector: Chrome en Android) ──

type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }
const BarcodeDetector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector

async function escanear(sesion: Sesion) {
  pintar(
    sesion,
    `<div class="tarjeta hud overflow-hidden">
      <div class="relative aspect-square bg-tinta">
        <video id="video" playsinline muted class="h-full w-full object-cover"></video>
        <div class="visor"><span></span></div>
      </div>
      <p class="px-4 py-3 text-center text-sm text-slate-500">Apuntá al QR que se proyecta en el aula</p>
    </div>
    <button id="cancelar" class="btn btn-secundario mt-4 w-full">Cancelar</button>`,
  )
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  } catch {
    return pedirCodigo('No pudimos abrir la cámara. Escribí el código o usá la cámara del celular.')
  }
  const video = document.getElementById('video') as HTMLVideoElement | null
  const parar = () => stream.getTracks().forEach((t) => t.stop())
  if (!video) return parar()
  video.srcObject = stream
  await video.play().catch(() => {})
  document.getElementById('cancelar')!.addEventListener('click', () => {
    parar()
    pedirCodigo()
  })
  const detector = new BarcodeDetector!({ formats: ['qr_code'] })
  const buscar = async () => {
    if (!video.isConnected) return parar()
    try {
      for (const { rawValue } of await detector.detect(video)) {
        const u = new URL(rawValue, location.href)
        const s = u.searchParams.get('s')
        const c = u.searchParams.get('c')
        if (s && c && sesionPorId(s)) {
          parar()
          navigator.vibrate?.(40)
          history.replaceState(null, '', `/p/?s=${encodeURIComponent(s)}&c=${encodeURIComponent(c)}`)
          return registrar(sesionPorId(s)!, c)
        }
      }
    } catch {
      /* cuadro sin QR legible: se sigue buscando */
    }
    setTimeout(buscar, 200)
  }
  buscar()
}

/** Sin parámetros: escanear desde la página o escribir el código de 6 dígitos de la clase de hoy. */
function pedirCodigo(aviso?: string) {
  const hoy = hoyIso()
  const deHoy = CRONOGRAMA.find((s) => s.fecha === hoy)
  // Si el registro de hoy ya cerró, no tiene sentido pedir un código: se muestra la próxima clase.
  const cerrada = !!deHoy && infoVentana(deHoy.fecha, ventanas?.[deHoy.id] ?? ventanaDefault()).estado === 'cerrada'
  const sesion = cerrada ? undefined : deHoy
  if (!sesion) {
    const proxima = CRONOGRAMA.find((s) => s.fecha > hoy)
    const abre = proxima ? instante(proxima.fecha, (ventanas?.[proxima.id] ?? ventanaDefault()).apertura) : 0
    return pintar(
      undefined,
      `<div class="tarjeta hud p-6">
        <div class="grid h-12 w-12 place-items-center rounded-2xl bg-cian-suave text-cian">${svg(I.reloj)}</div>
        <h1 class="mt-4 text-2xl font-semibold text-tinta">${cerrada ? 'El registro de hoy ya cerró' : 'Hoy no hay clase teórica'}</h1>
        ${cerrada ? '<p class="mt-2 text-slate-600">Si estuviste en clase y no llegaste a dar presente, avisale a la cátedra.</p>' : ''}
        ${
          proxima
            ? `<p class="mt-2 text-slate-600">La próxima es el <b>${diaSemana(proxima.fecha).toLowerCase()} ${fechaCorta(proxima.fecha)}</b>: ${esc(proxima.temas[0].titulo)}.</p>
               <div class="mt-4 rounded-2xl bg-cian-suave px-4 py-3 text-center"><div class="etiqueta !text-cian-oscuro">El registro abre en</div><div class="mt-1 font-mono text-3xl font-semibold text-cian-oscuro tabular-nums" data-hasta="${abre}" data-fin="¡Ya abrió!">${cuenta(abre - Date.now())}</div></div>`
            : '<p class="mt-2 text-slate-600">Ya terminaron las teóricas de este cursado.</p>'
        }
        <p class="mt-4 text-sm text-slate-500">Para dar presente escaneá el QR del aula con la cámara del celular.</p>
        ${enlaceMiAsistencia()}
      </div>`,
    )
  }
  pintar(
    sesion,
    `<form id="f" class="tarjeta hud p-6">
      <div class="grid h-12 w-12 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.qr)}</div>
      <h1 class="mt-4 text-2xl font-semibold text-tinta">Dar presente</h1>
      <p class="mt-1 text-sm text-slate-500">Escaneá el QR del aula. Si no lo lee, escribí el código de 6 dígitos que aparece debajo del QR.</p>
      ${BarcodeDetector ? `<button type="button" id="cam" class="btn btn-primario mt-5 w-full !py-3.5 text-base">${svg(I.camara, 'h-5 w-5')} Escanear con la cámara</button><div class="my-4 flex items-center gap-3 text-xs text-slate-400"><span class="h-px flex-1 bg-linea"></span>o escribí el código<span class="h-px flex-1 bg-linea"></span></div>` : ''}
      <input id="cod" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="7" class="campo ${BarcodeDetector ? '' : 'mt-5'} text-center font-mono text-3xl tracking-[0.4em]" aria-label="Código de 6 dígitos" />
      ${aviso ? `<p class="mt-2 text-sm text-rosa-oscuro">${esc(aviso)}</p>` : ''}
      <button id="ok" class="btn ${BarcodeDetector ? 'btn-secundario' : 'btn-primario'} mt-4 w-full !py-3.5 text-base" disabled>Validar código</button>
    </form>
    ${enlaceMiAsistencia()}`,
  )
  const input = document.getElementById('cod') as HTMLInputElement
  const ok = document.getElementById('ok') as HTMLButtonElement
  document.getElementById('cam')?.addEventListener('click', () => escanear(sesion))
  if (!BarcodeDetector) input.focus()
  input.addEventListener('input', () => {
    input.value = soloDigitos(input.value).slice(0, 6)
    ok.disabled = input.value.length !== 6
    ok.classList.toggle('listo', input.value.length === 6)
  })
  document.getElementById('f')!.addEventListener('submit', (e) => {
    e.preventDefault()
    if (input.value.length === 6) {
      history.replaceState(null, '', `/p/?s=${sesion.id}&c=${input.value}`)
      registrar(sesion, input.value)
    }
  })
}

// Los horarios (con aperturas o cierres manuales del docente) llegan en segundo plano para el estado en vivo.
publico()
  .then((api) => api.ventanas())
  .then((v) => {
    ventanas = v
    tick()
    // En la pantalla del código, los horarios reales (p. ej. una apertura manual) pueden cambiar qué mostrar.
    const cod = document.getElementById('cod') as HTMLInputElement | null
    const enMiAsistencia = new URLSearchParams(location.search).has('mia')
    if (!(s && c) && !enMiAsistencia && (!cod || !cod.value) && !document.getElementById('video') && !document.getElementById('tutorial')) pedirCodigo()
  })
  .catch(() => {
    /* sin red: la página funciona igual, sin el estado en vivo */
  })

const s = params.get('s')
const c = params.get('c')
if (s && c) {
  const sesion = sesionPorId(s)
  if (sesion) registrar(sesion, c).catch(() => mostrarError(sesion, 'RED'))
  else mostrarError(undefined, 'SESION_INEXISTENTE')
} else if (params.has('mia')) {
  verMiAsistencia().catch(() => mostrarError(undefined, 'RED'))
} else {
  pedirCodigo()
  // /p/?tutorial=1 (desde la portada): el paso a paso sin estar en el aula.
  if (params.has('tutorial')) {
    tutorialMostrado = true
    abrirTutorial({ textoFinal: 'Entendido', alCerrar: () => history.replaceState(null, '', '/p/') })
  }
}
