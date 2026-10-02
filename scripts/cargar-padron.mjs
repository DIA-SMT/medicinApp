// Carga (o actualiza) las 12 sesiones y el padrón de 195 alumnos en Supabase por la API REST.
// Requiere haber ejecutado antes supabase/schema.sql en el SQL Editor.
//
// Uso (la service role se pasa sólo por variable de entorno; nunca se guarda en archivos):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/cargar-padron.mjs
import fs from 'node:fs'
import { CRONOGRAMA } from '../src/lib/cronograma.ts'

const leerEnv = (f) => (fs.existsSync(f) ? Object.fromEntries([...fs.readFileSync(f, 'utf8').matchAll(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/gm)].map((m) => [m[1], m[2]])) : {})
const env = { ...leerEnv('.env'), ...leerEnv('.env.local'), ...process.env }
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('Faltan VITE_SUPABASE_URL (en .env.local) o SUPABASE_SERVICE_ROLE_KEY (variable de entorno).')
  process.exit(1)
}

const normalizar = (s) =>
  s
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s,'-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('es-AR'))
    .replace(/\s+/g, ' ')
    .trim()

async function upsert(tabla, filas, conflicto) {
  const r = await fetch(`${URL_}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas),
  })
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`)
}

const alumnos = JSON.parse(fs.readFileSync('data/alumnos.json', 'utf8'))
await upsert('sesiones', CRONOGRAMA.map((s) => ({ id: s.id, n: s.n, fecha: s.fecha, titulo: s.temas.map((t) => t.titulo).join(' · ') })), 'id')
// Sólo se envía sesion_id: la semilla se genera en la base y, si ya existía, se conserva.
await upsert('sesion_secretos', CRONOGRAMA.map((s) => ({ sesion_id: s.id })), 'sesion_id')
await upsert('alumnos', alumnos.map((a) => ({ libreta: a.libreta, nombre: normalizar(a.nombre), dni: a.dni, folio: a.folio, orden: a.orden })), 'libreta')
console.log(`✓ ${CRONOGRAMA.length} sesiones y ${alumnos.length} alumnos cargados en ${URL_}`)
