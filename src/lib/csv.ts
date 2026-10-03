/** CSV con `;` y BOM: abre bien en Excel con configuración regional de Argentina. */
export function descargarCsv(nombre: string, filas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v)
    // Un texto que empieza con = + - @ Excel lo ejecuta como fórmula (por ejemplo, un «motivo» escrito a mano):
    // se antepone un apóstrofo para que se muestre como texto.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const texto = '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
