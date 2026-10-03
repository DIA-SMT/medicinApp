import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'

// Valida supabase/schema.sql en un Postgres embebido (PGlite), sin servidor.
// Uso: npm run test:sql
const ROOT = process.cwd()
const db = new PGlite({ extensions: { pgcrypto } })
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
let fallos = 0
const ok = (cond, msg, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`)
  if (!cond) fallos++
}

// ── Stubs del entorno Supabase ──
await db.exec(`
  create schema if not exists extensions;
  create schema if not exists auth;
  do $$ begin create role anon; exception when others then null; end $$;
  do $$ begin create role authenticated; exception when others then null; end $$;
  create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
`)
await db.exec(fs.readFileSync(`${ROOT}/supabase/schema.sql`, 'utf8'))
await db.exec(fs.readFileSync(`${ROOT}/supabase/seed.sql`, 'utf8'))
ok(true, 'schema.sql + seed.sql ejecutan sin errores')
ok((await one('select count(*)::int n from alumnos')).n === 195, 'padrón: 195 alumnos')
ok((await one('select count(*)::int n from sesiones')).n === 12, 'cronograma: 12 sesiones')
ok((await one('select count(*)::int n from sesion_secretos')).n === 12, 'una semilla por sesión')

// Alumnos ficticios para las pruebas
await db.exec(`insert into alumnos values ('MD0000001','Demo, Alumna De Prueba','10000001','000',0), ('MD0000002','Test, Segundo Alumno','10000002','000',0)`)

// ── Paridad criptográfica JS ↔ SQL ──
const enc = new TextEncoder()
const fromHex = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)))
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const hmac = async (sec, data) =>
  new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', fromHex(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data))
const totpJs = async (sec, c) => {
  const m = new Uint8Array(8)
  new DataView(m.buffer).setBigUint64(0, BigInt(c))
  const h = await hmac(sec, m)
  const o = h[31] & 15
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0')
}
const SID = '2026-10-07'
const sec = (await one('select secreto from sesion_secretos where sesion_id = $1', [SID])).secreto
let iguales = 0
for (let c = 88_000_000; c < 88_000_200; c++) if ((await one('select public._totp($1, $2::bigint) t', [sec, c])).t === (await totpJs(sec, c))) iguales++
ok(iguales === 200, 'TOTP idéntico en JS y SQL (200 contadores)', iguales)
const posterJs = toHex(await hmac(sec, enc.encode(`poster:${SID}`))).slice(0, 10).toUpperCase()
ok((await one('select public._clave_poster($1,$2) k', [sec, SID])).k === posterJs, 'clave del póster idéntica', posterJs)
const paseJs = toHex(await hmac(sec, enc.encode(`pase:${SID}:123:q`))).slice(0, 16)
ok((await one(`select public._firma_pase($1,$2,123,'q') f`, [sec, SID])).f === paseJs, 'firma de pase idéntica')

// ── Ventana horaria ──
const contador = async () => Number((await one('select public._contador()::text c')).c)
const C = await contador()
const codigo = await totpJs(sec, C)
let r = (await one('select abrir_pase($1,$2) r', [SID, codigo])).r
ok(r.ok === false && r.error === 'PROGRAMADA', 'sesión futura → PROGRAMADA', r.error)
await db.exec(`update sesiones set manual_desde = now(), manual_hasta = now() + interval '10 minutes', cerrada_en = null where id = '${SID}'`)
r = (await one('select abrir_pase($1,$2) r', [SID, codigo])).r
ok(r.ok === true && r.metodo === 'qr', 'apertura manual + TOTP vigente → pase', r.pase)
const pase = r.pase
r = (await one('select abrir_pase($1,$2) r', [SID, await totpJs(sec, C - 1)])).r
ok(r.ok === true, 'tolerancia: paso anterior aceptado')
r = (await one('select abrir_pase($1,$2) r', [SID, await totpJs(sec, C - 3)])).r
ok(r.ok === false && r.error === 'CODIGO_INVALIDO', 'código de hace 60 s → CODIGO_INVALIDO')
r = (await one('select abrir_pase($1,$2) r', [SID, posterJs.toLowerCase()])).r
ok(r.ok === true && r.metodo === 'poster', 'clave del póster (sin importar mayúsculas) → pase póster')

// ── Identificación y marca ──
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', par.publicKey)
const huella = toHex(await crypto.subtle.digest('SHA-256', enc.encode(`${jwk.x}.${jwk.y}`)))
r = (await one('select identificar($1,$2,$3,$4) r', [SID, pase, '10.000.001', huella])).r
ok(r.ok && r.nombre === 'Demo, A.' && r.vinculo === 'libre' && r.libreta === 'MD00•••01', 'identificar (DNI con puntos) → nombre enmascarado', r)
r = (await one('select identificar($1,$2,$3,$4) r', [SID, pase, '99999999', huella])).r
ok(!r.ok && r.error === 'DNI_DESCONOCIDO', 'DNI fuera del padrón → DNI_DESCONOCIDO')
const marcar = (dni, h, j, ts = Date.now(), lat = -26.8366, lng = -65.2119, p = pase) =>
  one('select marcar_presente($1,$2,$3,$4,$5::jsonb,$6,$7::bigint,$8,$9,$10) r', [SID, p, dni, h, JSON.stringify(j), 'firma-b64', ts, lat, lng, 12]).then((x) => x.r)
r = await marcar('10000001', huella, jwk)
ok(r.ok && r.estado === 'REGISTRADO' && /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(r.comprobante) && r.distanciaM < 50, 'marcar → REGISTRADO con comprobante y distancia', r)
const p = r.progreso
ok(p && p.presentes === 1 && p.dictadas === 1 && p.dictadas + p.restantes <= 12, 'marcar devuelve el progreso: la clase en curso cuenta como dictada', p)
r = await marcar('10000001', huella, jwk)
ok(r.ok && r.estado === 'YA_REGISTRADO' && r.progreso, 'reintento idempotente → YA_REGISTRADO (con progreso)')
ok((await one(`select count(*)::int n from asistencias where libreta='MD0000001'`)).n === 1, 'una sola fila en asistencias')
ok((await one(`select libreta from dispositivos where huella=$1`, [huella])).libreta === 'MD0000001', 'dispositivo vinculado al alumno')
r = await marcar('10000002', huella, jwk)
ok(!r.ok && r.error === 'DISPOSITIVO_OCUPADO', 'mismo celular, otro alumno → DISPOSITIVO_OCUPADO')
const par2 = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
const jwk2 = await crypto.subtle.exportKey('jwk', par2.publicKey)
const huella2 = toHex(await crypto.subtle.digest('SHA-256', enc.encode(`${jwk2.x}.${jwk2.y}`)))
r = await marcar('10000001', huella2, jwk2)
ok(!r.ok && r.error === 'DISPOSITIVO_AJENO', 'mismo alumno, otro celular → DISPOSITIVO_AJENO')
r = await marcar('10000002', huella, jwk2)
ok(!r.ok && r.error === 'FIRMA_INVALIDA', 'huella que no corresponde a la clave → FIRMA_INVALIDA')
r = await marcar('10000002', huella2, jwk2, Date.now() - 10 * 60e3)
ok(!r.ok && r.error === 'FIRMA_INVALIDA', 'timestamp viejo (10 min) → FIRMA_INVALIDA')
r = await marcar('10000002', huella2, jwk2, Date.now(), null, null)
ok(r.ok && r.estado === 'REGISTRADO' && r.distanciaM === null, 'sin ubicación (modo registrar) → REGISTRADO con distancia nula', r)
r = (await one('select marcar_presente($1,$2,$3,$4,$5::jsonb,$6,$7::bigint) r', [SID, `${C - 10}.q.0000000000000000`, '10000002', huella2, JSON.stringify(jwk2), 'f', Date.now()])).r
ok(!r.ok && r.error === 'CODIGO_INVALIDO', 'pase falsificado → CODIGO_INVALIDO')
const firmaVieja = toHex(await hmac(sec, enc.encode(`pase:${SID}:${C - 10}:q`))).slice(0, 16)
r = (await one('select identificar($1,$2,$3,$4) r', [SID, `${C - 10}.q.${firmaVieja}`, '10000002', huella2])).r
ok(!r.ok && r.error === 'PASE_VENCIDO', 'pase auténtico de hace 200 s → PASE_VENCIDO')

// ── Geocercado exigido ──
await db.exec(`update ajustes set geo_modo = 'exigir'`)
await db.exec(`delete from asistencias where libreta = 'MD0000002'`)
r = await marcar('10000002', huella2, jwk2, Date.now(), -26.8, -65.25)
ok(!r.ok && r.error === 'FUERA_DE_RANGO', 'modo exigir y a ~5 km → FUERA_DE_RANGO', r.detalle)
await db.exec(`update ajustes set geo_modo = 'registrar'`)

// ── Cierre manual ──
await db.exec(`update sesiones set manual_hasta = null, manual_desde = null, cerrada_en = now() - interval '1 second' where id = '${SID}'`)
r = (await one('select abrir_pase($1,$2) r', [SID, await totpJs(sec, await contador())])).r
ok(!r.ok && r.error === 'CERRADA', 'cierre manual → CERRADA')

// ── Funciones de cátedra ──
let err = null
try {
  await one(`select docente_resumen('${SID}')`)
} catch (e) {
  err = e.message
}
ok(err && err.includes('NO_AUTORIZADO'), 'docente_resumen sin sesión → NO_AUTORIZADO', err)
await db.exec(`insert into docentes values ('catedra@ejemplo.edu.ar')`)
await db.exec(`select set_config('request.jwt.claims', '{"email":"Catedra@Ejemplo.edu.ar"}', false)`)
r = (await one(`select docente_resumen('${SID}') r`)).r
ok(r.presentes === 1 && r.total === 197 && r.ultimos[0].nombre === 'Demo, A.', 'docente_resumen con email habilitado', r)
ok((await one(`select docente_secreto('${SID}') s`)).s === sec, 'docente_secreto devuelve la semilla')

// ── Presente manual de la cátedra (lo que hace el panel: upsert masivo con motivo) ──
await db.exec(`insert into asistencias (sesion_id, libreta, metodo, motivo) values
  ('2026-10-09', 'MD0000001', 'manual', 'Sin celular o sin batería'),
  ('2026-10-09', 'MD0000002', 'manual', 'Sin celular o sin batería')
  on conflict (sesion_id, libreta) do nothing`)
const manual = await q(`select libreta, motivo, cargado_por, huella from asistencias where sesion_id = '2026-10-09' order by libreta`)
ok(manual.length === 2 && manual.every((m) => m.cargado_por === 'Catedra@Ejemplo.edu.ar' && m.motivo && !m.huella), 'carga manual masiva registra motivo y autor', manual)
await db.exec(`insert into asistencias (sesion_id, libreta, metodo, motivo) values ('2026-10-09', 'MD0000001', 'manual', 'duplicado') on conflict (sesion_id, libreta) do nothing`)
ok((await one(`select count(*)::int n from asistencias where sesion_id = '2026-10-09'`)).n === 2, 'carga manual repetida no duplica')
await db.exec(`select set_config('request.jwt.claims', '', false)`)

// ── Límite de intentos ──
await db.exec(`update sesiones set cerrada_en = null, manual_hasta = now() + interval '5 minutes' where id = '${SID}'`)
for (let i = 0; i < 120; i++) await one('select abrir_pase($1,$2) r', [SID, '000000'])
r = (await one('select abrir_pase($1,$2) r', [SID, '000000'])).r
ok(!r.ok && r.error === 'RED' && /intentos/.test(r.detalle), '120 fallos en 1 min → bloqueo temporal', r.detalle)

// ── Horario real: 09/10 08:05 ART dentro de la ventana, 08:11 fuera ──
const v = await one(`select
  (timestamptz '2026-10-09 08:05:00-03' between public._abre(s) and (s.fecha + s.cierre) at time zone 'America/Argentina/Tucuman') dentro,
  (timestamptz '2026-10-09 07:29:00-03' < public._abre(s)) antes,
  (timestamptz '2026-10-09 08:11:00-03' > (s.fecha + s.cierre) at time zone 'America/Argentina/Tucuman') fuera
  from sesiones s where id = '2026-10-09'`)
ok(v.dentro && v.antes && v.fuera, 'ventana 07:30–08:10 en hora de Tucumán', v)

// ── Cupo de Elena ──
let permitidas = 0
for (let i = 0; i < 21; i++) if ((await one(`select elena_cupo('203.0.113.7') ok`)).ok) permitidas++
ok(permitidas === 20, 'Elena: 20 preguntas cada 10 min por IP', permitidas)
ok((await one(`select elena_cupo('203.0.113.8') ok`)).ok === true, 'Elena: otra IP tiene su propio cupo')
ok((await one(`select count(*)::int n from elena_uso where ip_hash like '203.%'`)).n === 0, 'Elena: la IP se guarda con hash')

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK')
process.exit(fallos ? 1 : 0)
