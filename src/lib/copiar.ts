/**
 * Copia texto al portapapeles. Algunos navegadores (o políticas de la PC) bloquean
 * navigator.clipboard: en ese caso prueba el método clásico con un textarea oculto.
 * Devuelve si pudo copiar.
 */
export async function copiarTexto(texto: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // seguimos con el plan B
  }
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}
