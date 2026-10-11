/**
 * Pasa el cuadro de la cámara a grises y lo suaviza (caja 3×3, en dos pasadas). jsQR falla con el granulado
 * de las cámaras con poca luz o con un proyector lavado; suavizado lo lee. Escribe el resultado en `datos`.
 */
export function suavizar(datos: Uint8ClampedArray, ancho: number, alto: number) {
  const n = ancho * alto
  const gris = new Float32Array(n)
  for (let i = 0; i < n; i++) gris[i] = 0.299 * datos[i * 4] + 0.587 * datos[i * 4 + 1] + 0.114 * datos[i * 4 + 2]
  const tmp = new Float32Array(n)
  for (let y = 0; y < alto; y++) {
    const f = y * ancho
    for (let x = 0; x < ancho; x++) {
      const a = gris[f + Math.max(0, x - 1)]
      const b = gris[f + x]
      const c = gris[f + Math.min(ancho - 1, x + 1)]
      tmp[f + x] = (a + b + c) / 3
    }
  }
  for (let y = 0; y < alto; y++) {
    const arriba = Math.max(0, y - 1) * ancho
    const fila = y * ancho
    const abajo = Math.min(alto - 1, y + 1) * ancho
    for (let x = 0; x < ancho; x++) {
      const v = (tmp[arriba + x] + tmp[fila + x] + tmp[abajo + x]) / 3
      const i = (fila + x) * 4
      datos[i] = datos[i + 1] = datos[i + 2] = v
    }
  }
  return datos
}
