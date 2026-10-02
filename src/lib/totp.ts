// TOTP (RFC 6238) con HMAC-SHA256 y pases de registro.
// Debe producir exactamente los mismos valores que las funciones de supabase/schema.sql.
import { TOTP_PASO_S } from './config'

const enc = new TextEncoder()

export const toHex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, '0')).join('')

export const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)))

export function cryptoDisponible() {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

export function nuevoSecreto(bytes = 20) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function hmac(secretHex: string, data: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', fromHex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
}

/** C = ⌊(T − T₀) / Δt⌋ con T₀ = época Unix. */
export const contador = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PASO_S)
export const segundosRestantes = (now = Date.now()) => TOTP_PASO_S - ((now / 1000) % TOTP_PASO_S)

export async function totp(secretHex: string, c: number) {
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setBigUint64(0, BigInt(c))
  const h = await hmac(secretHex, msg)
  const o = h[31] & 0x0f
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 1_000_000).padStart(6, '0')
}

/** Clave fija del póster impreso: sólo vale dentro de la ventana horaria de esa sesión. */
export async function clavePoster(secretHex: string, sesionId: string) {
  return toHex(await hmac(secretHex, enc.encode(`poster:${sesionId}`))).slice(0, 10).toUpperCase()
}

/** Pase que habilita a completar el registro durante PASE_TTL_S tras escanear un código válido. */
export async function firmaPase(secretHex: string, sesionId: string, c: number, m: 'q' | 'p') {
  return toHex(await hmac(secretHex, enc.encode(`pase:${sesionId}:${c}:${m}`))).slice(0, 16)
}

export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  return toHex(await crypto.subtle.digest('SHA-256', bytes))
}
