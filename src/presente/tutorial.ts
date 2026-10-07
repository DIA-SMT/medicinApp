// Tutorial «Cómo dar el presente» con un caso ficticio (Lucía Ejemplo, DNI 10.000.001).
// Muestra las mismas pantallas que va a ver el alumno, en miniatura y con animaciones CSS.
// Se carga aparte (import dinámico): quien ya está registrado nunca lo descarga.
import { UMBRAL_REGULARIDAD } from '../lib/config'

export const CLAVE_OCULTO = 'ciclo:tutorial:oculto'

const svg = (d: string, cls: string) =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>'

/** Un QR de juguete: patrón fijo de cuadraditos con los tres marcadores de esquina. */
const qrFalso = () => {
  const marcador = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="7" height="7" rx="1.2" fill="none" stroke="#0b1220" stroke-width="1.4"/><rect x="${x + 2.2}" y="${y + 2.2}" width="2.6" height="2.6" rx=".5" fill="#0b1220"/>`
  let celdas = ''
  for (let i = 0; i < 21 * 21; i++) {
    const x = i % 21
    const y = Math.floor(i / 21)
    const enMarcador = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)
    if (!enMarcador && (x * 7 + y * 13 + x * y) % 5 < 2) celdas += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0b1220"/>`
  }
  return `<svg viewBox="-1 -1 23 23" class="h-full w-full">${celdas}${marcador(0, 0)}${marcador(14, 0)}${marcador(0, 14)}</svg>`
}

const telefono = (contenido: string) => `
  <div class="tut-telefono mx-auto">
    <div class="tut-notch"></div>
    <div class="relative flex h-full flex-col px-3 pt-6 pb-3 text-left">${contenido}</div>
  </div>`

const PANTALLAS = [
  // 1 · Escanear
  () =>
    telefono(`
      <div class="relative mx-auto mt-2 aspect-square w-[78%] rounded-xl bg-white p-2 shadow-inner">
        ${qrFalso()}
        <div class="visor !inset-[4%]"><span></span></div>
      </div>
      <div class="tut-aparece mt-auto rounded-xl bg-tinta px-3 py-2 text-[0.62rem] text-white shadow-lg" style="animation-delay:1.2s">
        <div class="font-semibold">medicinapp.vercel.app</div>
        <div class="text-white/70">Tocá para abrir el enlace</div>
      </div>`),
  // 2 · DNI
  () =>
    telefono(`
      <div class="text-[0.62rem] font-semibold tracking-wider text-slate-400 uppercase">Clase Nº 03 · Miércoles 07/10</div>
      <div class="mt-3 text-sm font-semibold text-tinta">Ingresá tu DNI</div>
      <div class="text-[0.6rem] text-slate-500">Sólo esta vez</div>
      <div class="tut-campo mt-3">
        <span class="font-mono text-base tracking-wide text-tinta">${[...'10.000.001'].map((ch, i) => `<span class="tut-tecla" style="animation-delay:${0.4 + i * 0.16}s">${ch}</span>`).join('')}</span>
        <span class="tut-ok" style="animation-delay:2.2s">${svg(CHECK, 'h-3 w-3')}</span>
      </div>
      <div class="tut-boton mt-auto" style="animation-delay:2.3s">Continuar</div>`),
  // 3 · Confirmar
  () =>
    telefono(`
      <div class="text-[0.62rem] font-semibold tracking-wider text-slate-400 uppercase">¿Sos vos?</div>
      <div class="mt-3 flex items-center gap-2.5">
        <div class="pop grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rosa to-violeta text-lg font-bold text-white">L</div>
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-tinta">Ejemplo, L.</div>
          <div class="font-mono text-[0.58rem] text-slate-400">Libreta MD00•••01</div>
        </div>
      </div>
      <div class="relative mt-auto">
        <div class="tut-boton tut-listo">Sí, dar presente</div>
        <span class="tut-toque"></span>
      </div>
      <div class="mt-2 text-center text-[0.55rem] text-slate-400">Tu celular queda vinculado a tu libreta</div>`),
  // 4 · ¡Presente!
  () =>
    telefono(`
      <div class="pop mx-auto mt-2 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-vital to-cian text-white shadow-lg">${svg(CHECK, 'h-7 w-7')}</div>
      <div class="mt-2 text-center text-lg font-bold text-tinta">¡Presente!</div>
      <div class="text-center font-mono text-sm font-semibold text-vital">07:42:15</div>
      <div class="mt-auto rounded-xl border border-linea p-2">
        <div class="flex justify-between text-[0.55rem] text-slate-500"><span>Tu regularidad</span><span><b class="text-tinta">1</b> de 7</span></div>
        <div class="barra mt-1 !h-1.5"><span class="crece" style="width:14%"></span></div>
        <div class="mt-1 text-[0.55rem] font-medium text-vital">Vas bien: podés faltar a 3 clases más</div>
      </div>`),
  // 5 · Las próximas veces
  () =>
    telefono(`
      <div class="relative mx-auto mt-3 grid h-16 w-16 place-items-center">
        <span class="animate-latido absolute inset-2 rounded-full border-2 border-cian/50"></span>
        <div class="grid h-10 w-10 place-items-center rounded-xl bg-cian-suave text-cian">${svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/>', 'h-5 w-5')}</div>
      </div>
      <div class="mt-2 text-center text-[0.65rem] font-medium text-rosa">Hola de nuevo, Ejemplo, L.</div>
      <div class="text-center text-xs font-semibold text-tinta">Registrando tu presente</div>
      <div class="tut-aparece mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-vital-suave py-2 text-[0.65rem] font-semibold text-vital" style="animation-delay:1.4s">${svg(CHECK, 'h-3.5 w-3.5')} ¡Presente! Sin escribir nada</div>`),
]

const PASOS = [
  { titulo: 'Escaneá el QR del aula', texto: 'Abrí la cámara del celular, apuntá al QR que se proyecta y tocá el enlace que aparece. No hay que instalar nada.' },
  { titulo: 'Escribí tu DNI', texto: 'Sólo la primera vez, sin puntos: se agregan solos. En este ejemplo, Lucía escribe 10.000.001 y toca «Continuar».' },
  { titulo: 'Confirmá que sos vos', texto: 'Aparece tu nombre. Si es correcto, tocá «Sí, dar presente». Desde ahí tu celular queda vinculado a tu libreta.' },
  { titulo: '¡Presente!', texto: `Ves la hora, un comprobante y cuántos presentes llevás para llegar al ${UMBRAL_REGULARIDAD}%. Podés cerrar la pantalla.` },
  { titulo: 'Las clases siguientes', texto: 'Escaneás y listo: el presente se da solo. Usá siempre tu celular y el mismo navegador (no el modo incógnito).' },
]

/**
 * Abre el tutorial encima de la página. `vence`: si hay un pase corriendo, muestra cuánto tiempo queda
 * (el reloj de la página actualiza cualquier [data-hasta]). Si el pase vence, la página repinta y el
 * tutorial desaparece solo.
 */
export function mostrarTutorial({ vence, textoFinal, alCerrar }: { vence?: number; textoFinal: string; alCerrar: () => void }) {
  document.getElementById('tutorial')?.remove()
  const capa = document.createElement('div')
  capa.id = 'tutorial'
  capa.setAttribute('role', 'dialog')
  capa.setAttribute('aria-modal', 'true')
  capa.setAttribute('aria-labelledby', 'tut-titulo')
  capa.className = 'fixed inset-0 z-50 flex items-end justify-center bg-tinta/40 p-3 backdrop-blur-sm sm:items-center'
  document.body.appendChild(capa)

  let paso = 0
  let ocultar = false

  const cerrar = () => {
    if (ocultar) {
      try {
        localStorage.setItem(CLAVE_OCULTO, '1')
      } catch {
        /* navegación privada */
      }
    }
    document.removeEventListener('keydown', teclas)
    capa.remove()
    alCerrar()
  }
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cerrar()
    if (e.key === 'ArrowRight' && paso < PASOS.length - 1) ir(paso + 1)
    if (e.key === 'ArrowLeft' && paso > 0) ir(paso - 1)
  }
  document.addEventListener('keydown', teclas)

  const ir = (n: number) => {
    paso = n
    const ultimo = paso === PASOS.length - 1
    const p = PASOS[paso]
    capa.innerHTML = `
      <div class="tarjeta entrada w-full max-w-sm p-5">
        <div class="flex items-center justify-between gap-3">
          <span class="etiqueta">Cómo dar el presente · ejemplo</span>
          <button id="tut-saltar" class="text-xs text-slate-400 underline-offset-4 hover:text-tinta hover:underline">${ultimo ? 'Cerrar' : 'Saltar'}</button>
        </div>
        ${vence ? `<p class="mt-1 text-xs text-slate-500">Tu tiempo para completar sigue corriendo: <b data-hasta="${vence}" class="font-mono text-tinta tabular-nums">…</b></p>` : ''}
        <div class="mt-4">${PANTALLAS[paso]()}</div>
        <div class="mt-4 font-mono text-[0.65rem] tracking-wider text-rosa uppercase">Paso ${paso + 1} de ${PASOS.length}</div>
        <h2 id="tut-titulo" class="mt-1 text-xl font-semibold text-tinta">${p.titulo}</h2>
        <p class="mt-1 text-sm text-slate-600">${p.texto}</p>
        <div class="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          ${PASOS.map((_, i) => `<span class="h-1.5 rounded-full transition-all ${i === paso ? 'w-5 bg-rosa' : 'w-1.5 bg-slate-200'}"></span>`).join('')}
        </div>
        <div class="mt-4 flex gap-2">
          ${paso > 0 ? '<button id="tut-atras" class="btn btn-secundario flex-1">Anterior</button>' : ''}
          <button id="tut-sigue" class="btn btn-primario flex-1 ${ultimo ? 'listo' : ''}">${ultimo ? textoFinal : 'Siguiente'}</button>
        </div>
        <label class="mt-3 flex cursor-pointer items-center justify-center gap-2 text-xs text-slate-500">
          <input id="tut-ocultar" type="checkbox" class="h-3.5 w-3.5 accent-rosa" ${ocultar ? 'checked' : ''} /> No volver a mostrar
        </label>
      </div>`
    capa.querySelector<HTMLInputElement>('#tut-ocultar')!.addEventListener('change', (e) => (ocultar = (e.target as HTMLInputElement).checked))
    capa.querySelector('#tut-saltar')!.addEventListener('click', cerrar)
    capa.querySelector('#tut-atras')?.addEventListener('click', () => ir(paso - 1))
    const sigue = capa.querySelector<HTMLButtonElement>('#tut-sigue')!
    sigue.addEventListener('click', () => (ultimo ? cerrar() : ir(paso + 1)))
    sigue.focus()
  }
  ir(0)
}
