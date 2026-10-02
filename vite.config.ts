import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Sin Supabase configurado (o con VITE_DEMO=1) la app corre en modo demostración con datos en el navegador.
  // La constante se resuelve en build: en producción el padrón local no se empaqueta.
  const demo = env.VITE_DEMO === '1' || !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)
  return {
    plugins: [react(), tailwindcss()],
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
