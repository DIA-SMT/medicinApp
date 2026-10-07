// Documentos PDF con el diseño de Ginecoapp (logos, franja rosa, tipografía y colores de la app).
// Se carga bajo demanda desde el panel: jsPDF sólo se descarga cuando alguien toca «Descargar».
import { jsPDF } from 'jspdf'
import { autoTable, type CellHookData } from 'jspdf-autotable'
import type { Alumno, Registro } from '../data/types'
import { APP, CATEDRA, UMBRAL_REGULARIDAD } from './config'
import { docentesSesion, type Sesion } from './cronograma'
import { diaSemana, fechaCorta, horaArt, hoyIso } from './time'

type RGB = [number, number, number]
const C = {
  tinta: [29, 15, 23] as RGB,
  gris: [138, 104, 120] as RGB,
  grisClaro: [180, 145, 159] as RGB,
  rosa: [224, 36, 111] as RGB,
  rosaOscuro: [179, 23, 90] as RGB,
  rosaSuave: [253, 230, 240] as RGB,
  rosaClaro: [255, 245, 249] as RGB,
  linea: [245, 219, 230] as RGB,
  vital: [14, 159, 104] as RGB,
  vitalSuave: [231, 247, 239] as RGB,
  violeta: [107, 92, 246] as RGB,
  violetaSuave: [240, 238, 254] as RGB,
  ambar: [194, 124, 3] as RGB,
  ambarSuave: [255, 246, 226] as RGB,
}

const LOGO_CICLO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="u" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0246f"/><stop offset=".55" stop-color="#d1358f"/><stop offset="1" stop-color="#f472a8"/></linearGradient></defs><g fill="none" stroke="url(#u)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 16.5C17 12.8 20 11 24 11s7 1.8 7 5.5c0 5.8-2.4 10.6-4.4 13.6v5c0 1.5-1.2 2.6-2.6 2.6s-2.6-1.1-2.6-2.6v-5C19.4 27.1 17 22.3 17 16.5Z"/><path d="M17.6 14.6c-3.4-3.5-8-4-10-1.1-1.4 2-.6 4.7 1.7 5.6"/><path d="M30.4 14.6c3.4-3.5 8-4 10-1.1 1.4 2 .6 4.7-1.7 5.6"/></g><ellipse cx="11.3" cy="22.6" rx="3.3" ry="2.5" fill="url(#u)" opacity=".9"/><ellipse cx="36.7" cy="22.6" rx="3.3" ry="2.5" fill="url(#u)" opacity=".9"/><path d="M21.2 16.4h5.6L24 23.6Z" fill="url(#u)" opacity=".4"/></svg>`

/** Rasteriza una imagen (PNG o SVG) al tamaño justo para el PDF: el logo original pesa 340 KB. */
async function rasterizar(src: string, anchoPx: number) {
  const img = new Image()
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = anchoPx
  canvas.height = Math.round((anchoPx * img.naturalHeight) / img.naturalWidth) || anchoPx
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), proporcion: canvas.height / canvas.width }
}

async function logos() {
  const [unt, ciclo] = await Promise.all([
    rasterizar('/logo-unt.png', 220).catch(() => null),
    rasterizar(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_CICLO)}`, 160).catch(() => null),
  ])
  return { unt, ciclo }
}

export interface ArchivoPdf {
  nombre: string
  blob: Blob
}

/** Descarga el PDF generado (el panel decide cuándo; así también se puede previsualizar). */
export function descargar({ nombre, blob }: ArchivoPdf) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

const ahoraTexto = () => `${fechaCorta(hoyIso())}/${hoyIso().slice(0, 4)} ${horaArt(Date.now()).slice(0, 5)}`

/** Encabezado y pie en cada página (los dos documentos comparten el diseño). */
function marco(doc: jsPDF, l: Awaited<ReturnType<typeof logos>>, subtitulo: string) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  // Franja superior rosa → magenta → rosa claro (degradé en tiras finas)
  const tiras = 60
  for (let i = 0; i < tiras; i++) {
    const t = i / (tiras - 1)
    const [a, b] = t < 0.5 ? [C.rosa, [194, 47, 134] as RGB] : [[194, 47, 134] as RGB, [244, 114, 168] as RGB]
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2
    doc.setFillColor(...(a.map((v, j) => Math.round(v + (b[j] - v) * k)) as RGB))
    doc.rect((W / tiras) * i, 0, W / tiras + 0.3, 2.6, 'F')
  }
  if (l.unt) doc.addImage(l.unt.data, 'PNG', 12, 7, 11, 11 * l.unt.proporcion)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...C.gris)
  doc.text(`${CATEDRA.universidad.toUpperCase()} · ${CATEDRA.facultad.toUpperCase()}`, 26, 9.8)
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...C.tinta)
  doc.text(`Cátedra de ${CATEDRA.materia}`, 26, 14.6)
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...C.rosaOscuro)
  doc.text(CATEDRA.titularCompleta, 26, 18.4)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...C.gris)
  doc.text(subtitulo, 26, 21.9)
  if (l.ciclo) doc.addImage(l.ciclo.data, 'PNG', W - 33, 7.5, 9, 9)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...C.tinta)
  doc.text(APP, W - 12, 13.5, { align: 'right', charSpace: 0.3 })
  doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...C.grisClaro)
  doc.text('ASISTENCIA A TEÓRICAS', W - 12, 17, { align: 'right', charSpace: 0.3 })
  doc.setDrawColor(...C.linea).setLineWidth(0.3).line(12, 24.2, W - 12, 24.2)

  // Pie
  doc.line(12, H - 11, W - 12, H - 11)
  doc.setFontSize(7).setTextColor(...C.gris)
  doc.text(`${APP} · ${CATEDRA.titularCorta} · ${location.host}`, 12, H - 6.5)
  doc.text(`Generado el ${ahoraTexto()} h`, W / 2, H - 6.5, { align: 'center' })
  doc.text(`Página ${doc.getCurrentPageInfo().pageNumber} de {total}`, W - 12, H - 6.5, { align: 'right' })
}

/** Tarjetitas de resumen bajo el título (Alumnos 195, Regulares 132, …). */
function resumen(doc: jsPDF, y: number, datos: [string, string, RGB?][]) {
  const W = doc.internal.pageSize.getWidth()
  const ancho = (W - 24 - (datos.length - 1) * 3) / datos.length
  datos.forEach(([etiqueta, valor, color], i) => {
    const x = 12 + i * (ancho + 3)
    doc.setFillColor(...C.rosaClaro).setDrawColor(...C.linea).roundedRect(x, y, ancho, 13, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(...C.gris)
    doc.text(etiqueta.toUpperCase(), x + 3, y + 4.5, { charSpace: 0.2 })
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...(color ?? C.tinta))
    doc.text(valor, x + 3, y + 10.5)
  })
}

function titulo(doc: jsPDF, y: number, texto: string, bajada: string) {
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...C.tinta)
  doc.text(texto, 12, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...C.gris)
  doc.text(bajada, 12, y + 5.5)
}

const ESTILO_TABLA = {
  theme: 'grid' as const,
  styles: { font: 'helvetica', fontSize: 7.2, textColor: C.tinta, lineColor: C.linea, lineWidth: 0.2, cellPadding: 1.4, valign: 'middle' as const },
  headStyles: { fillColor: C.rosa, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const, halign: 'center' as const },
  alternateRowStyles: { fillColor: C.rosaClaro },
}

const pintarMarca = (d: CellHookData) => {
  const v = String(d.cell.raw ?? '')
  const [fondo, texto] =
    v === 'P' || v === 'Presente'
      ? [C.vitalSuave, C.vital]
      : v === 'PM' || v === 'Presente (manual)'
        ? [C.violetaSuave, C.violeta]
        : v === 'A' || v === 'Ausente' || v === 'Libre'
          ? [C.rosaSuave, C.rosaOscuro]
          : v === 'Regular'
            ? [C.vitalSuave, C.vital]
            : v === 'En riesgo'
              ? [C.ambarSuave, C.ambar]
              : [null, null]
  if (fondo) {
    d.cell.styles.fillColor = fondo
    d.cell.styles.textColor = texto!
    d.cell.styles.fontStyle = 'bold'
  }
}

export interface FilaPlanilla {
  a: Alumno
  presentes: number
  porcentaje: number
  condicion: 'Regular' | 'En riesgo' | 'Libre'
  marcas: Map<string, Registro>
}

/** Planilla de regularidad: una columna por clase con asistencia tomada, % y condición. A4 apaisado. */
export async function planillaPdf({ filas, computables, umbral = UMBRAL_REGULARIDAD }: { filas: FilaPlanilla[]; computables: Sesion[]; umbral?: number }): Promise<ArchivoPdf> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const l = await logos()
  const subtitulo = `${CATEDRA.cursado} · Planilla de regularidades · Materia ${CATEDRA.codigo}`
  const n = (c: FilaPlanilla['condicion']) => filas.filter((f) => f.condicion === c).length

  titulo(doc, 33, 'Planilla de regularidad · Clases teóricas', `${computables.length} de 12 clases con asistencia tomada · se exige el ${umbral}% · P presente (QR) · PM presente manual · A ausente`)
  resumen(doc, 41, [
    ['Alumnos', String(filas.length)],
    ['Clases con registro', `${computables.length} / 12`],
    ['Regulares', String(n('Regular')), C.vital],
    ['En riesgo', String(n('En riesgo')), C.ambar],
    ['Libres', String(n('Libre')), C.rosaOscuro],
    ['Asistencia media', `${filas.length ? Math.round(filas.reduce((s, f) => s + f.porcentaje, 0) / filas.length) : 0}%`, C.rosaOscuro],
  ])

  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: 58,
    margin: { top: 28, left: 12, right: 12, bottom: 15 },
    head: [['Folio', 'Ord.', 'Libreta', 'Apellido y nombre', 'Documento', ...computables.map((s) => fechaCorta(s.fecha)), 'Pres.', '%', 'Condición']],
    body: filas.map((f) => [
      f.a.folio ?? '',
      String(f.a.orden ?? '').padStart(2, '0'),
      f.a.libreta,
      f.a.nombre,
      f.a.dni,
      ...computables.map((s) => (!f.marcas.has(s.id) ? 'A' : f.marcas.get(s.id)!.metodo === 'manual' ? 'PM' : 'P')),
      String(f.presentes),
      computables.length ? `${f.porcentaje}%` : '—',
      f.condicion,
    ]),
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 3: { cellWidth: 58 }, ...Object.fromEntries(computables.map((_, i) => [5 + i, { halign: 'center', cellWidth: 9.5 }])) },
    didParseCell: (d) => {
      if (d.section === 'body' && (d.column.index >= 5 && d.column.index < 5 + computables.length || d.column.index === 7 + computables.length)) pintarMarca(d)
      if (d.section === 'body' && d.column.index > 4 + computables.length) d.cell.styles.halign = 'center'
    },
    didDrawPage: () => marco(doc, l, subtitulo),
  })

  // Firmas al final
  const H = doc.internal.pageSize.getHeight()
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18
  if (y > H - 30) {
    doc.addPage()
    marco(doc, l, subtitulo)
    y = 50
  }
  doc.setDrawColor(...C.grisClaro).setLineWidth(0.3)
  ;['Firma del profesor a cargo', 'Aclaración', 'Fecha'].forEach((t, i) => {
    const x = 20 + i * 90
    doc.line(x, y, x + 70, y)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...C.gris).text(t, x + 35, y + 4, { align: 'center' })
  })

  doc.putTotalPages('{total}')
  return { nombre: `planilla-regularidad-ginecologia-${hoyIso()}.pdf`, blob: doc.output('blob') }
}

/** Póster A4 con el QR fijo de una clase (vectorial: se imprime nítido en cualquier tamaño). */
export async function posterPdf({ sesion, url, apertura, cierre }: { sesion: Sesion; url: string; apertura: string; cierre: string }): Promise<ArchivoPdf> {
  const { default: QRCode } = await import('qrcode')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const l = await logos()
  const W = doc.internal.pageSize.getWidth()
  marco(doc, l, `${CATEDRA.cursado} · Póster de asistencia`)

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...C.rosaOscuro)
  doc.text(`REGISTRO DE ASISTENCIA · CLASE TEÓRICA Nº ${String(sesion.n).padStart(2, '0')}`, W / 2, 35, { align: 'center', charSpace: 0.6 })
  doc.setFontSize(20).setTextColor(...C.tinta)
  const lineas = doc.splitTextToSize(sesion.temas.map((t) => t.titulo).join(' + '), 175) as string[]
  doc.text(lineas, W / 2, 44, { align: 'center' })
  let y = 44 + lineas.length * 8
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...C.gris)
  doc.text(docentesSesion(sesion), W / 2, y, { align: 'center' })

  // QR vectorial con marco de esquinas (como en el póster de pantalla) e insignia central
  const lado = 112
  const x0 = (W - lado) / 2
  const y0 = y + 8
  doc.setDrawColor(...C.linea).setLineWidth(0.5).roundedRect(x0 - 7, y0 - 7, lado + 14, lado + 14, 6, 6)
  doc.setDrawColor(...C.rosa).setLineWidth(1.4)
  const e = 14
  doc.line(x0 - 7, y0 - 7 + e, x0 - 7, y0 - 1).line(x0 - 1, y0 - 7, x0 - 7 + e, y0 - 7)
  doc.line(x0 + lado + 7 - e, y0 + lado + 7, x0 + lado + 1, y0 + lado + 7).line(x0 + lado + 7, y0 + lado + 1, x0 + lado + 7, y0 + lado + 7 - e)
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const m = lado / n
  const insignia = Math.round(n * 0.2) | 1
  const c0 = (n - insignia) / 2
  doc.setFillColor(...C.tinta)
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const enCentro = r >= c0 - 1 && r <= c0 + insignia && c >= c0 - 1 && c <= c0 + insignia
      if (!enCentro && qr.modules.data[r * n + c]) doc.rect(x0 + c * m, y0 + r * m, m + 0.02, m + 0.02, 'F')
    }
  if (l.ciclo) {
    const t = insignia * m
    doc.setFillColor(255, 255, 255).roundedRect(x0 + c0 * m - 0.6, y0 + c0 * m - 0.6, t + 1.2, t + 1.2, 2, 2, 'F')
    doc.addImage(l.ciclo.data, 'PNG', x0 + c0 * m + t * 0.12, y0 + c0 * m + t * 0.12, t * 0.76, t * 0.76)
  }

  // Validez
  y = y0 + lado + 16
  const validez = `Válido sólo el ${diaSemana(sesion.fecha).toLowerCase()} ${fechaCorta(sesion.fecha)} de ${apertura} a ${cierre} h`
  doc.setFont('helvetica', 'bold').setFontSize(12)
  const ancho = doc.getTextWidth(validez) + 16
  doc.setFillColor(...C.tinta).roundedRect((W - ancho) / 2, y - 6, ancho, 10, 5, 5, 'F')
  doc.setTextColor(255, 255, 255).text(validez, W / 2, y + 0.6, { align: 'center' })

  // Pasos
  const pasos = ['Abrí la cámara del celular', 'Escaneá el código y tocá el enlace', 'Ingresá tu DNI (sólo la primera vez)', 'Listo: las próximas veces es un solo toque']
  const anchoPaso = (W - 24 - 9) / 4
  y += 12
  pasos.forEach((texto, i) => {
    const x = 12 + i * (anchoPaso + 3)
    doc.setFillColor(...C.rosaClaro).setDrawColor(...C.linea).setLineWidth(0.3).roundedRect(x, y, anchoPaso, 24, 3, 3, 'FD')
    doc.setFillColor(...C.rosa).circle(x + 6, y + 6, 3.2, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 255, 255).text(String(i + 1), x + 6, y + 7.3, { align: 'center' })
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...C.tinta)
    doc.text(doc.splitTextToSize(texto, anchoPaso - 6) as string[], x + 3, y + 14)
  })
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...C.gris)
  doc.text(`Un celular por alumno · después de las ${cierre} h el código deja de funcionar · retirá el póster al cerrar el registro`, W / 2, y + 32, { align: 'center' })

  doc.putTotalPages('{total}')
  return { nombre: `poster-clase-${String(sesion.n).padStart(2, '0')}-${sesion.fecha}.pdf`, blob: doc.output('blob') }
}

/** Lista de una clase: todos los alumnos en el orden de la planilla, con estado, hora y método. A4 vertical. */
export async function listaClasePdf({ sesion, alumnos, registros }: { sesion: Sesion; alumnos: Alumno[]; registros: Registro[] }): Promise<ArchivoPdf> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const l = await logos()
  const regs = new Map(registros.filter((r) => r.sesionId === sesion.id).map((r) => [r.libreta, r]))
  const manuales = [...regs.values()].filter((r) => r.metodo === 'manual').length
  const subtitulo = `${CATEDRA.cursado} · Asistencia de la clase Nº ${String(sesion.n).padStart(2, '0')}`

  titulo(doc, 33, `Clase Nº ${String(sesion.n).padStart(2, '0')} · ${diaSemana(sesion.fecha)} ${fechaCorta(sesion.fecha)}/${sesion.fecha.slice(0, 4)}`, doc.splitTextToSize(`${sesion.temas.map((t) => t.titulo).join(' + ')} · ${docentesSesion(sesion)}`, 186)[0])
  resumen(doc, 41, [
    ['Presentes', `${regs.size} / ${alumnos.length}`, C.vital],
    ['Por QR o póster', String(regs.size - manuales)],
    ['Manuales', String(manuales), C.violeta],
    ['Ausentes', String(alumnos.length - regs.size), C.rosaOscuro],
  ])

  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: 58,
    margin: { top: 28, left: 12, right: 12, bottom: 15 },
    head: [['#', 'Libreta', 'Apellido y nombre', 'Documento', 'Estado', 'Hora', 'Método', 'Detalle']],
    body: alumnos.map((a, i) => {
      const r = regs.get(a.libreta)
      return [
        String(i + 1),
        a.libreta,
        a.nombre,
        a.dni,
        !r ? 'Ausente' : r.metodo === 'manual' ? 'Presente (manual)' : 'Presente',
        r ? horaArt(r.marcadoEn).slice(0, 5) : '',
        !r ? '' : r.metodo === 'qr' ? 'QR' : r.metodo === 'poster' ? 'Póster' : 'Manual',
        r?.metodo === 'manual' ? [r.motivo, r.cargadoPor].filter(Boolean).join(' · ') : '',
      ]
    }),
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 2: { cellWidth: 50 }, 4: { halign: 'center', cellWidth: 25 }, 5: { halign: 'center', cellWidth: 11 }, 6: { halign: 'center', cellWidth: 14 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 4) pintarMarca(d)
    },
    didDrawPage: () => marco(doc, l, subtitulo),
  })

  doc.putTotalPages('{total}')
  return { nombre: `asistencia-clase-${String(sesion.n).padStart(2, '0')}-${sesion.fecha}.pdf`, blob: doc.output('blob') }
}
