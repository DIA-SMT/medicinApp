// Falla si algún DNI o libreta del padrón aparece en el código fuente o en lo que se publica (dist/).
// Se ejecuta después de cada build. Sin data/alumnos.json (p. ej. en Vercel) no hay nada que comparar.
import fs from 'node:fs'

if (!fs.existsSync('data/alumnos.json')) process.exit(0)
const alumnos = JSON.parse(fs.readFileSync('data/alumnos.json', 'utf8'))
const ids = new Set(alumnos.flatMap((a) => [a.dni, a.libreta]))
// Mismo criterio que vite.config.ts para saber si el build es demo (lee también los .env locales).
const env = { ...process.env }
for (const f of ['.env', '.env.local', '.env.production', '.env.production.local'])
  if (fs.existsSync(f)) for (const [, k, v] of fs.readFileSync(f, 'utf8').matchAll(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/gm)) env[k] ??= v
const demo = env.VITE_DEMO === '1' || !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)

const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])) : [])
const archivos = [...walk('src'), ...walk('scripts'), ...walk('p'), 'index.html', 'README.md', ...walk('supabase').filter((f) => !f.endsWith('seed.sql'))]
// En modo demo el padrón viaja a propósito en dist/ (sólo para uso local); en producción nunca.
if (!demo) archivos.push(...walk('dist'))

const hallazgos = []
for (const f of archivos) {
  const texto = fs.readFileSync(f, 'utf8')
  for (const m of texto.matchAll(/\b(\d{7,8}|MD\d{7})\b/g)) if (ids.has(m[1])) hallazgos.push(`${f}: ${m[1]}`)
}
if (hallazgos.length) {
  console.error(`✗ Datos del padrón en archivos publicables:\n${hallazgos.join('\n')}`)
  process.exit(1)
}
console.log(`✓ Sin DNIs ni libretas del padrón en ${archivos.length} archivos${demo ? ' (build demo: dist/ no se revisa)' : ''}`)
