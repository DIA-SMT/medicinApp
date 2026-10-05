// Contraseña inicial que sugiere el panel al crear una cuenta o cambiar una olvidada:
// cuatro palabras cortas y dos números (fácil de dictar o copiar, unas 33 millones de combinaciones),
// con azar criptográfico. La persona la reemplaza después desde «Mi contraseña».
const PALABRAS = [
  'sol', 'mar', 'luna', 'rio', 'pino', 'nube', 'lago', 'flor', 'roca', 'vela', 'faro', 'puma',
  'lima', 'coco', 'kiwi', 'oso', 'gato', 'loro', 'tilo', 'cielo', 'brisa', 'monte', 'valle', 'trigo',
]

export function claveSugerida() {
  const azar = crypto.getRandomValues(new Uint32Array(5))
  const palabras = Array.from(azar.slice(0, 4), (n) => PALABRAS[n % PALABRAS.length])
  const numero = String(azar[4] % 100).padStart(2, '0')
  return `${palabras.map((p) => p[0].toUpperCase() + p.slice(1)).join('-')}-${numero}`
}
