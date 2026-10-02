/**
 * URL que codifica el QR. Apunta a /p/, una página mínima sin React: carga en pocos KB
 * aunque 195 alumnos escaneen a la vez con datos móviles.
 */
export function enlaceRegistro(sesionId: string, codigo: string) {
  return `${location.origin}/p/?s=${sesionId}&c=${codigo}`
}
