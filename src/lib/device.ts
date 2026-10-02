// Vinculación criptográfica del dispositivo (Web Crypto + IndexedDB).
// La clave privada ECDSA P-256 se crea con extractable:false: el navegador la puede usar
// para firmar pero ningún script puede leerla ni copiarla a otro equipo.
import { sha256Hex } from './totp'

export interface Dispositivo {
  huella: string // SHA-256 de las coordenadas x.y de la clave pública (verificable también en SQL)
  publicJwk: JsonWebKey
  privateKey: CryptoKey
}

const DB = 'ciclo-dispositivo'
const STORE = 'claves'
const KEY = 'principal'

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function leer(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | undefined> {
  const db = await abrir()
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function guardar(par: { privateKey: CryptoKey; publicKey: CryptoKey }) {
  const db = await abrir()
  return new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put(par, KEY)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

export const huellaDe = (jwk: JsonWebKey) => sha256Hex(`${jwk.x}.${jwk.y}`)

let cache: Promise<Dispositivo> | null = null

export function obtenerDispositivo(): Promise<Dispositivo> {
  cache ??= (async () => {
    let par = await leer().catch(() => undefined)
    if (!par) {
      const gen = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair
      par = { privateKey: gen.privateKey, publicKey: gen.publicKey }
      await guardar(par).catch(() => {})
    }
    const publicJwk = await crypto.subtle.exportKey('jwk', par.publicKey)
    return { huella: await huellaDe(publicJwk), publicJwk, privateKey: par.privateKey }
  })()
  return cache
}

export async function firmar(d: Dispositivo, mensaje: string) {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, d.privateKey, new TextEncoder().encode(mensaje))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

export async function verificar(publicJwk: JsonWebKey, mensaje: string, firmaB64: string) {
  const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const sig = Uint8Array.from(atob(firmaB64), (c) => c.charCodeAt(0))
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(mensaje))
}

/** "3F:A2:91:0C" — forma legible de la huella para mostrar en pantalla. */
export const huellaCorta = (h: string, bytes = 4) =>
  (h.slice(0, bytes * 2).match(/.{2}/g) ?? []).join(':').toUpperCase()

