import { useEffect, useRef } from 'react'

interface Props {
  className?: string
  pares?: number
  vueltas?: number
  vertical?: boolean
  velocidad?: number
}

const ROSA = [224, 36, 111]
const CIAN = [10, 162, 192]
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** Doble hélice en canvas con profundidad simulada, pensada para fondo blanco. Se pausa fuera de pantalla. */
export function DnaHelix({ className, pares = 26, vueltas = 2.2, vertical = true, velocidad = 0.5 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let visible = true
    let raf = 0

    const ajustar = () => {
      const r = cv.getBoundingClientRect()
      w = r.width
      h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(ajustar)
    ro.observe(cv)
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(cv)

    const dibujar = (t: number) => {
      raf = requestAnimationFrame(dibujar)
      if (!visible || !w) return
      const tiempo = quieto ? 0 : (t / 1000) * velocidad
      ctx.clearRect(0, 0, w, h)
      const largo = vertical ? h : w
      const ancho = vertical ? w : h
      const amp = ancho * 0.26
      const centro = ancho / 2
      const P = (a: number, b: number): [number, number] => (vertical ? [b, a] : [a, b])

      // Hebras con alfa según profundidad
      const N = 160
      for (const hebra of [0, 1]) {
        const col = hebra ? CIAN : ROSA
        for (let i = 0; i < N; i++) {
          const u0 = i / N
          const u1 = (i + 1) / N
          const f0 = u0 * vueltas * Math.PI * 2 + tiempo + hebra * Math.PI
          const f1 = u1 * vueltas * Math.PI * 2 + tiempo + hebra * Math.PI
          const z = (Math.cos(f0) + 1) / 2
          const [x0, y0] = P(u0 * largo, centro + Math.sin(f0) * amp)
          const [x1, y1] = P(u1 * largo, centro + Math.sin(f1) * amp)
          ctx.strokeStyle = rgba(col, 0.1 + z * 0.6)
          ctx.lineWidth = 1 + z * 2
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
        }
      }

      // Pares de bases y nucleótidos
      for (let i = 0; i < pares; i++) {
        const u = (i + 0.5) / pares
        const f = u * vueltas * Math.PI * 2 + tiempo
        const s = Math.sin(f)
        const za = (Math.cos(f) + 1) / 2
        const zb = 1 - za
        const [ax, ay] = P(u * largo, centro + s * amp)
        const [bx, by] = P(u * largo, centro - s * amp)
        const g = ctx.createLinearGradient(ax, ay, bx, by)
        g.addColorStop(0, rgba(ROSA, 0.12 + za * 0.3))
        g.addColorStop(1, rgba(CIAN, 0.12 + zb * 0.3))
        ctx.strokeStyle = g
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
        for (const [x, y, z, c] of [
          [ax, ay, za, ROSA],
          [bx, by, zb, CIAN],
        ] as const) {
          ctx.fillStyle = rgba(c, 0.06 + z * 0.12)
          ctx.beginPath()
          ctx.arc(x, y, 5 + z * 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = rgba(c, 0.35 + z * 0.6)
          ctx.beginPath()
          ctx.arc(x, y, 1.5 + z * 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    raf = requestAnimationFrame(dibujar)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [pares, vueltas, vertical, velocidad])

  return <canvas ref={ref} aria-hidden className={className} />
}
