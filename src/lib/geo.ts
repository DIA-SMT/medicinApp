// Geocercado: distancia geodésica (Haversine) a la sede de la cátedra.
export interface Ubicacion {
  lat: number
  lng: number
  precision: number
}

const R = 6_371_000 // radio medio terrestre en metros
const rad = (g: number) => (g * Math.PI) / 180

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dPhi = rad(lat2 - lat1)
  const dLambda = rad(lng2 - lng1)
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLambda / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Nunca rechaza: si el permiso se niega o el GPS no responde, devuelve null. */
export function obtenerUbicacion(timeoutMs = 8000): Promise<Ubicacion | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((res) => {
    const t = setTimeout(() => res(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t)
        res({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy })
      },
      () => {
        clearTimeout(t)
        res(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}
