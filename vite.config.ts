import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

/** En `npm run dev` sirve /api/elena con el mismo handler que corre en Vercel (api/elena.ts). */
function apiLocal(): Plugin {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use('/api/elena', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const { POST } = (await server.ssrLoadModule('/api/elena.ts')) as { POST: (r: Request) => Promise<Response> }
        const r = await POST(
          new Request(`http://${req.headers.host}/api/elena`, {
            method: req.method,
            headers: { 'content-type': 'application/json', 'x-forwarded-for': req.socket.remoteAddress ?? '' },
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          }),
        )
        res.statusCode = r.status
        res.setHeader('content-type', 'application/json')
        res.end(await r.text())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // La función de Elena lee process.env (en Vercel, las variables del proyecto; en local, .env.local).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''), process.env)
  // Sin Supabase configurado (o con VITE_DEMO=1) la app corre en modo demostración con datos en el navegador.
  // La constante se resuelve en build: en producción el padrón local no se empaqueta.
  const demo = env.VITE_DEMO === '1' || !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)
  return {
    plugins: [react(), tailwindcss(), apiLocal()],
    define: { __DEMO__: JSON.stringify(demo) },
    server: { host: true, port: 5173 },
    build: {
      rolldownOptions: {
        // Dos páginas: la app (portada, proyector, panel) y /p/, el registro liviano del alumno.
        input: { app: resolve(__dirname, 'index.html'), presente: resolve(__dirname, 'p/index.html') },
      },
    },
  }
})
