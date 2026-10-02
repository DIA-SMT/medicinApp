// Genera supabase/seed.sql a partir del padrón (data/alumnos.json) y del cronograma.
// Uso: npm run seed
import fs from 'node:fs'
import { CRONOGRAMA } from '../src/lib/cronograma.ts'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const normalizar = (s) =>
  s
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s,'-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('es-AR'))
    .replace(/\s+/g, ' ')
    .trim()

const alumnos = JSON.parse(fs.readFileSync('data/alumnos.json', 'utf8'))

const sql = [
  '-- Generado por scripts/generar-seed.mjs — no editar a mano.',
  '-- Contiene datos personales del padrón: no publicar este archivo.',
  '',
  'insert into public.sesiones (id, n, fecha, titulo) values',
  CRONOGRAMA.map((s) => `  (${q(s.id)}, ${s.n}, ${q(s.fecha)}, ${q(s.temas.map((t) => t.titulo).join(' · '))})`).join(',\n'),
  'on conflict (id) do update set n = excluded.n, fecha = excluded.fecha, titulo = excluded.titulo;',
  '',
  'insert into public.sesion_secretos (sesion_id) select id from public.sesiones on conflict do nothing;',
  '',
  'insert into public.alumnos (libreta, nombre, dni, folio, orden) values',
  alumnos.map((a) => `  (${q(a.libreta)}, ${q(normalizar(a.nombre))}, ${q(a.dni)}, ${q(a.folio)}, ${a.orden})`).join(',\n'),
  'on conflict (libreta) do update set nombre = excluded.nombre, dni = excluded.dni, folio = excluded.folio, orden = excluded.orden;',
  '',
  '-- Cuentas de la cátedra con acceso al panel y al proyector (crear el usuario en Authentication → Users):',
  "-- insert into public.docentes (email) values ('catedra.ginecologia@ejemplo.edu.ar');",
  '',
].join('\n')

fs.writeFileSync('supabase/seed.sql', sql)
console.log(`seed.sql: ${CRONOGRAMA.length} sesiones, ${alumnos.length} alumnos`)
