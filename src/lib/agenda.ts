// Agendar las teóricas en el calendario del celular: archivo .ics (iPhone, Outlook, la mayoría de las apps)
// y enlace directo a Google Calendar. Todo se arma en el navegador, sin servidor.
import { APERTURA_DEFAULT, CATEDRA, CIERRE_DEFAULT, SEDE } from './config'
import { docentesSesion, type Sesion } from './cronograma'
import { instante } from './time'

const HORA_CLASE = '08:00'
const DURACION_MIN = 120

/** 20261007T110000Z */
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const titulo = (s: Sesion) => `Ginecología · Teórica Nº ${s.n}${s.parcial ? ` (${s.parcial})` : ''}: ${s.temas.map((t) => t.titulo).join(' + ')}`
const detalle = (s: Sesion, url: string) =>
  [
    docentesSesion(s),
    `Asistencia: escaneá el QR del aula entre las ${APERTURA_DEFAULT} y las ${CIERRE_DEFAULT}. Si la cámara no lo lee: ${url}/p/`,
    `${CATEDRA.facultad} · ${CATEDRA.universidad}`,
  ].join('\n')

/** Escapado de texto según RFC 5545. */
const ics = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/** Líneas de hasta 75 bytes; las que siguen empiezan con un espacio (RFC 5545 §3.1). */
function plegar(linea: string) {
  const enc = new TextEncoder()
  const partes: string[] = []
  let actual = ''
  for (const ch of linea) {
    if (enc.encode(actual + ch).length > (partes.length ? 74 : 75)) {
      partes.push(actual)
      actual = ''
    }
    actual += ch
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

export function archivoIcs(sesiones: Sesion[], url = location.origin) {
  const ahora = utc(Date.now())
  const eventos = sesiones.map((s) => {
    const inicio = instante(s.fecha, HORA_CLASE)
    return [
      'BEGIN:VEVENT',
      `UID:ciclo-ginecologia-${s.id}@${new URL(url).host}`,
      `DTSTAMP:${ahora}`,
      `DTSTART:${utc(inicio)}`,
      `DTEND:${utc(inicio + DURACION_MIN * 60e3)}`,
      `SUMMARY:${ics(titulo(s))}`,
      `DESCRIPTION:${ics(detalle(s, url))}`,
      `LOCATION:${ics(`${CATEDRA.facultad}, ${SEDE.direccion}`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT40M',
      `DESCRIPTION:${ics('Teórica de Ginecología: llevá el celular con batería para el QR')}`,
      'END:VALARM',
      'END:VEVENT',
    ]
      .map(plegar)
      .join('\r\n')
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CICLO//Ginecologia FM-UNT//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...eventos, 'END:VCALENDAR'].join('\r\n')
}

export function descargarIcs(sesiones: Sesion[], nombre: string) {
  const blob = new Blob([archivoIcs(sesiones)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export function enlaceGoogle(s: Sesion, url = location.origin) {
  const inicio = instante(s.fecha, HORA_CLASE)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo(s),
    dates: `${utc(inicio)}/${utc(inicio + DURACION_MIN * 60e3)}`,
    details: detalle(s, url),
    location: `${CATEDRA.facultad}, ${SEDE.direccion}`,
  })
  return `https://calendar.google.com/calendar/render?${p}`
}
