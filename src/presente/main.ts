// Registro de asistencia del alumno: página mínima sin React ni librerías.
// Lo único que se le pide al alumno es el DNI, y sólo la primera vez.
import './presente.css'
import { publico } from '../data/publico'
import type { CodigoError, ResultadoMarca } from '../data/types'
import { GEO_MODO } from '../lib/config'
import { CRONOGRAMA, sesionPorId, type Sesion } from '../lib/cronograma'
import { firmar, huellaCorta, obtenerDispositivo, type Dispositivo } from '../lib/device'
import { obtenerUbicacion } from '../lib/geo'
import { diaSemana, fechaCorta, hmArt, horaArt, hoyIso } from '../lib/time'
import { cryptoDisponible } from '../lib/totp'

const app = document.getElementById('app')!
const params = new URLSearchParams(location.search)
const CLAVE_DNI = 'ciclo:alumno:dni'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const soloDigitos = (s: string) => s.replace(/\D/g, '')
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
}

const MARCA = `
  <header class="flex items-center gap-2.5">
    <svg viewBox="0 0 48 48" class="h-8 w-8" aria-hidden="true"><g fill="none" stroke="#e0246f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 16.5C17 12.8 20 11 24 11s7 1.8 7 5.5c0 5.8-2.4 10.6-4.4 13.6v5c0 1.5-1.2 2.6-2.6 2.6s-2.6-1.1-2.6-2.6v-5C19.4 27.1 17 22.3 17 16.5Z"/><path d="M17.6 14.6c-3.4-3.5-8-4-10-1.1-1.4 2-.6 4.7 1.7 5.6"/><path d="M30.4 14.6c3.4-3.5 8-4 10-1.1 1.4 2 .6 4.7-1.7 5.6"/></g><ellipse cx="11.3" cy="22.6" rx="3.3" ry="2.5" fill="#0aa2c0"/><ellipse cx="36.7" cy="22.6" rx="3.3" ry="2.5" fill="#0aa2c0"/></svg>
    <div class="leading-none">
      <div class="text-[1.05rem] font-bold tracking-[0.22em] text-tinta">CICLO</div>
      <div class="mt-1 font-mono text-[0.58rem] tracking-[0.18em] text-slate-500 uppercase">Ginecología · FM-UNT</div>
    </div>
    <a href="/" class="ml-auto text-xs text-slate-400 underline-offset-4 hover:underline">Inicio</a>
  </header>`

const tarjetaClase = (s: Sesion) => `
  <div class="mt-5 rounded-2xl border border-linea bg-white/80 px-4 py-3">
    <div class="etiqueta">Clase Nº ${String(s.n).padStart(2, '0')} · ${diaSemana(s.fecha)} ${fechaCorta(s.fecha)}</div>
    <div class="mt-1 font-semibold leading-snug text-tinta">${esc(s.temas.map((t) => t.titulo).join(' + '))}</div>
  </div>`

// Elena (la asistente) vive en la app: se abre en otra pestaña para no perder el registro a medias.
const enlaceElena = (pregunta?: string) => `/#/?elena=1${pregunta ? `&q=${encodeURIComponent(pregunta)}` : ''}`

const PIE = `<div class="mt-auto pt-8 text-center">
  <a href="${enlaceElena()}" target="_blank" rel="noopener" class="text-xs font-medium text-rosa underline-offset-4 hover:underline">¿Dudas? Preguntale a Elena</a>
  <p class="mt-3 font-mono text-[0.6rem] tracking-[0.15em] text-slate-400 uppercase">Cátedra de Ginecología · Facultad de Medicina UNT</p>
</div>`

function pintar(sesion: Sesion | undefined, contenido: string) {
  app.innerHTML = `${MARCA}${sesion ? tarjetaClase(sesion) : ''}<section class="entrada mt-6">${contenido}</section>${PIE}`
}

const ERRORES: Record<CodigoError, { titulo: string; texto: (d?: string) => string; reintentar?: boolean }> = {
  SESION_INEXISTENTE: { titulo: 'Clase no encontrada', texto: () => 'El código no corresponde a ninguna clase del cronograma.' },
  PROGRAMADA: { titulo: 'Todavía no abrió el registro', texto: (d) => `El registro de esta clase abre a las ${d ? hmArt(Number(d)) : '—'}. Volvé a escanear en ese momento.` },
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
  pintar(
    sesion,
    `<div class="tarjeta hud p-6 text-center">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.alerta, 'h-7 w-7')}</div>
      <h1 class="mt-4 text-xl font-semibold text-tinta">${esc(e.titulo)}</h1>
      <p class="mt-2 text-slate-600">${esc(e.texto(detalle))}</p>
      <div class="mt-6 flex flex-col gap-2">
        ${e.reintentar && reintentar ? '<button id="reintentar" class="btn btn-primario w-full !py-3">Reintentar</button>' : ''}
        <a href="/p/" class="btn btn-secundario w-full">Ingresar el código a mano</a>
        <a href="${enlaceElena(`Al dar el presente me apareció «${e.titulo}». ¿Qué hago?`)}" target="_blank" rel="noopener" class="mt-1 text-sm font-medium text-rosa underline-offset-4 hover:underline">¿Qué hago? Preguntale a Elena</a>
      </div>
      <div class="mt-3 font-mono text-[0.6rem] tracking-widest text-slate-300">${error}</div>
    </div>`,
  )
  document.getElementById('reintentar')?.addEventListener('click', () => reintentar?.())
}

function cargando(sesion: Sesion | undefined, texto: string) {
  pintar(
    sesion,
    `<div class="flex flex-col items-center py-14 text-center">
      <div class="relative grid h-28 w-28 place-items-center">
        <span class="animate-latido absolute inset-5 rounded-full border-2 border-cian/50"></span>
        <span class="animate-latido absolute inset-5 rounded-full border-2 border-cian/50" style="animation-delay:.5s"></span>
        <div class="grid h-16 w-16 place-items-center rounded-2xl border border-cian/30 bg-cian-suave text-cian">${svg(I.qr, 'h-8 w-8')}</div>
      </div>
      <div class="mt-5 text-lg font-semibold text-tinta">${esc(texto)}</div>
    </div>`,
  )
}

function exito(sesion: Sesion, r: Extract<ResultadoMarca, { ok: true }>, huella: string) {
  pintar(
    sesion,
    `<div class="text-center">
      <div class="relative mx-auto grid h-36 w-36 place-items-center">
        <span class="onda absolute inset-0 rounded-full border-2 border-vital/40"></span>
        <span class="onda absolute inset-0 rounded-full border-2 border-vital/40" style="animation-delay:.6s"></span>
        <div class="pop grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-vital to-cian shadow-[0_18px_40px_-14px_rgb(14_159_104/0.8)]">
          <svg viewBox="0 0 24 24" class="h-12 w-12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="trazo" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </div>
      </div>
      <h1 class="mt-3 text-4xl font-bold text-tinta">${r.estado === 'REGISTRADO' ? '¡Presente!' : 'Ya estabas registrado'}</h1>
      <p class="mt-1 text-slate-500">${esc(r.nombre)}</p>
      <div class="mt-4 font-mono text-5xl font-semibold text-vital tabular-nums">${horaArt(r.marcadoEn)}</div>
      <div class="tarjeta mt-6 p-4 text-left font-mono text-xs">
        <div class="flex justify-between border-b border-linea pb-2"><span class="text-slate-400">Comprobante</span><span class="text-tinta">${esc(r.comprobante)}</span></div>
        <div class="flex items-center justify-between pt-2"><span class="text-slate-400">Celular vinculado</span><span class="flex items-center gap-1 text-vital">${svg(I.huella, 'h-3.5 w-3.5')} ${huellaCorta(huella)}</span></div>
      </div>
      <p class="mt-4 text-xs text-slate-400">Listo, podés cerrar esta pantalla. La próxima clase alcanza con escanear.</p>
    </div>`,
  )
}

// ── Flujo ──

async function registrar(sesion: Sesion, codigo: string) {
  if (!cryptoDisponible()) return mostrarError(sesion, 'SIN_CRYPTO')
  const api = await publico()
  const disp = obtenerDispositivo()
  cargando(sesion, 'Verificando código')

  // El pase sobrevive a una recarga accidental de la página durante 3 minutos.
  const clavePase = `ciclo:pase:${sesion.id}`
  let pase: { pase: string; expiraEn: number } | null = null
  try {
    const p = JSON.parse(sessionStorage.getItem(clavePase) ?? 'null')
    if (p && p.expiraEn > Date.now()) pase = p
  } catch {
    /* sin sessionStorage */
  }
  if (!pase) {
    const r = await api.abrirPase(sesion.id, codigo)
    if (!r.ok) return mostrarError(sesion, r.error, r.detalle, () => registrar(sesion, codigo))
    pase = { pase: r.pase, expiraEn: r.expiraEn }
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

  const marcar = async (dni: string) => {
    cargando(sesion, 'Registrando presente')
    const ts = Date.now()
    const firma = await firmar(dispositivo, `${sesion.id}|${pase!.pase}|${dni}|${ts}`)
    const ubicacion = GEO_MODO === 'off' ? null : await obtenerUbicacion(6000)
    const r = await api.marcar({ sesionId: sesion.id, pase: pase!.pase, dni, huella: dispositivo.huella, publicJwk: dispositivo.publicJwk, firma, ts, ubicacion })
    if (!r.ok) return mostrarError(sesion, r.error, r.detalle, () => marcar(dni))
    guardar(CLAVE_DNI, dni)
    try {
      sessionStorage.removeItem(clavePase)
    } catch {
      /* ok */
    }
    exito(sesion, r, dispositivo.huella)
  }

  const identificar = async (dni: string, automatico: boolean) => {
    cargando(sesion, automatico ? 'Registrando presente' : 'Buscando en el padrón')
    const r = await api.identificar(sesion.id, pase!.pase, dni, dispositivo.huella)
    if (!r.ok) {
      if (r.error === 'DNI_DESCONOCIDO') {
        guardar(CLAVE_DNI, null)
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
      `<div class="tarjeta hud p-6">
        <div class="etiqueta">¿Sos vos?</div>
        <div class="mt-4 flex items-center gap-4">
          <div class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rosa to-violeta text-2xl font-bold text-white">${esc(nombre.charAt(0))}</div>
          <div class="min-w-0">
            <div class="truncate text-2xl font-semibold text-tinta">${esc(nombre)}</div>
            <div class="font-mono text-sm text-slate-400">Libreta ${esc(libreta)}</div>
          </div>
        </div>
        <button id="si" class="btn btn-primario mt-6 w-full !py-4 text-lg">Sí, dar presente</button>
        <button id="no" class="mt-3 w-full text-center text-sm text-slate-400 underline-offset-4 hover:underline">No soy yo · cambiar DNI</button>
        <p class="mt-4 flex items-start gap-2 text-xs text-slate-400">${svg(I.huella, 'mt-0.5 h-4 w-4 shrink-0 text-cian')} Este celular queda vinculado a tu libreta: la próxima vez el presente es automático.</p>
      </div>`,
    )
    document.getElementById('si')!.addEventListener('click', () => marcar(dni))
    document.getElementById('no')!.addEventListener('click', () => {
      guardar(CLAVE_DNI, null)
      pedirDni()
    })
  }

  const pedirDni = (aviso?: string) => {
    pintar(
      sesion,
      `<form id="f" class="tarjeta hud p-6">
        <div class="grid h-12 w-12 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.llave)}</div>
        <h1 class="mt-4 text-2xl font-semibold text-tinta">Ingresá tu DNI</h1>
        <p class="mt-1 text-sm text-slate-500">Sólo esta vez. Después alcanza con escanear el QR.</p>
        <input id="dni" inputmode="numeric" autocomplete="off" placeholder="Sólo números" class="campo mt-5 font-mono text-2xl tracking-[0.12em]" maxlength="11" />
        ${aviso ? `<p class="mt-2 text-sm text-rosa-oscuro">${esc(aviso)}</p>` : ''}
        ${__DEMO__ ? '<p class="mt-3 rounded-xl border border-ambar/30 bg-ambar-suave px-3 py-2 text-xs text-ambar">Modo demo: probá con el DNI ficticio <b class="font-mono">10000001</b></p>' : ''}
        <button id="ok" class="btn btn-primario mt-5 w-full !py-3.5 text-base" disabled>Continuar</button>
      </form>`,
    )
    const input = document.getElementById('dni') as HTMLInputElement
    const ok = document.getElementById('ok') as HTMLButtonElement
    input.focus()
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^\d.]/g, '')
      ok.disabled = soloDigitos(input.value).length < 7
    })
    document.getElementById('f')!.addEventListener('submit', (e) => {
      e.preventDefault()
      const dni = soloDigitos(input.value)
      if (dni.length >= 7) identificar(dni, false)
    })
  }

  const dniGuardado = leer(CLAVE_DNI)
  if (dniGuardado) await identificar(dniGuardado, true)
  else pedirDni()
}

/** Sin parámetros: ingreso manual del código de 6 dígitos de la clase de hoy. */
function pedirCodigo() {
  const hoy = hoyIso()
  const sesion = CRONOGRAMA.find((s) => s.fecha === hoy)
  if (!sesion) {
    const proxima = CRONOGRAMA.find((s) => s.fecha > hoy)
    return pintar(
      undefined,
      `<div class="tarjeta hud p-6">
        <div class="grid h-12 w-12 place-items-center rounded-2xl bg-cian-suave text-cian">${svg(I.reloj)}</div>
        <h1 class="mt-4 text-2xl font-semibold text-tinta">Hoy no hay clase teórica</h1>
        ${proxima ? `<p class="mt-2 text-slate-600">La próxima es el <b>${diaSemana(proxima.fecha).toLowerCase()} ${fechaCorta(proxima.fecha)}</b>: ${esc(proxima.temas[0].titulo)}.</p>` : ''}
        <p class="mt-4 text-sm text-slate-500">Para dar presente escaneá el QR del aula con la cámara del celular.</p>
      </div>`,
    )
  }
  pintar(
    sesion,
    `<form id="f" class="tarjeta hud p-6">
      <div class="grid h-12 w-12 place-items-center rounded-2xl bg-rosa-suave text-rosa">${svg(I.qr)}</div>
      <h1 class="mt-4 text-2xl font-semibold text-tinta">Dar presente</h1>
      <p class="mt-1 text-sm text-slate-500">Escaneá el QR del aula con la cámara. Si no lo lee, escribí el código de 6 dígitos que aparece debajo del QR.</p>
      <input id="cod" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="7" class="campo mt-5 text-center font-mono text-3xl tracking-[0.4em]" />
      <button id="ok" class="btn btn-primario mt-5 w-full !py-3.5 text-base" disabled>Validar código</button>
    </form>`,
  )
  const input = document.getElementById('cod') as HTMLInputElement
  const ok = document.getElementById('ok') as HTMLButtonElement
  input.focus()
  input.addEventListener('input', () => {
    input.value = soloDigitos(input.value).slice(0, 6)
    ok.disabled = input.value.length !== 6
  })
  document.getElementById('f')!.addEventListener('submit', (e) => {
    e.preventDefault()
    if (input.value.length === 6) {
      history.replaceState(null, '', `/p/?s=${sesion.id}&c=${input.value}`)
      registrar(sesion, input.value)
    }
  })
}

const s = params.get('s')
const c = params.get('c')
if (s && c) {
  const sesion = sesionPorId(s)
  if (sesion) registrar(sesion, c).catch(() => mostrarError(sesion, 'RED'))
  else mostrarError(undefined, 'SESION_INEXISTENTE')
} else {
  pedirCodigo()
}
