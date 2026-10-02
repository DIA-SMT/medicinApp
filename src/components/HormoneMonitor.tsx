import { useEffect, useMemo, useState } from 'react'

// Modelo didáctico del ciclo ovárico de 28 días (curvas normalizadas, no clínicas).
const g = (d: number, mu: number, s: number) => Math.exp(-((d - mu) ** 2) / (2 * s * s))

const HORMONAS = [
  { id: 'LH', nombre: 'LH', color: '#e0246f', unidad: 'mUI/mL', rango: [2, 62], f: (d: number) => 0.06 + 0.94 * g(d, 14, 0.85) + 0.04 * g(d, 3, 4) },
  { id: 'FSH', nombre: 'FSH', color: '#0aa2c0', unidad: 'mUI/mL', rango: [3, 21], f: (d: number) => 0.28 + 0.26 * g(d, 3, 2.6) + 0.42 * g(d, 14, 1.1) - 0.12 * g(d, 21, 4) },
  { id: 'E2', nombre: 'Estradiol', color: '#6b5cf6', unidad: 'pg/mL', rango: [30, 380], f: (d: number) => 0.08 + 0.82 * g(d, 12.6, 2.2) + 0.36 * g(d, 21.5, 3.1) },
  { id: 'P4', nombre: 'Progesterona', color: '#e0a106', unidad: 'ng/mL', rango: [0.2, 19], f: (d: number) => 0.04 + 0.88 * g(d, 21.5, 3.2) },
] as const

const W = 560
const H = 210
const PX = 34
const PY = 26
const x = (d: number) => PX + ((d - 1) / 27) * (W - PX * 2)
const y = (v: number) => H - PY - Math.min(1, Math.max(0, v)) * (H - PY * 2)

const fase = (d: number) => (d < 13 ? 'Fase folicular' : d <= 15 ? 'Ovulación' : 'Fase lútea')

/** Monitor del eje hipotálamo-hipófiso-ovárico con cursor de barrido y lecturas en vivo. */
export function HormoneMonitor({ className = '' }: { className?: string }) {
  const caminos = useMemo(
    () =>
      HORMONAS.map((h) => {
        let p = ''
        for (let i = 0; i <= 270; i++) {
          const d = 1 + (i / 270) * 27
          p += `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(h.f(d)).toFixed(1)}`
        }
        return p
      }),
    [],
  )

  // El cursor avanza ~2 días por segundo.
  const [dia, setDia] = useState(14)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t0 = Date.now()
    const t = setInterval(() => setDia(1 + (((Date.now() - t0) / 520) % 27)), 50)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={`tarjeta hud overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-linea px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-latido absolute inline-flex h-full w-full rounded-full bg-rosa" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rosa" />
          </span>
          <span className="etiqueta !text-slate-700">Monitor · Eje H-H-O</span>
        </div>
        <span className="font-mono text-[0.7rem] text-slate-500">
          DÍA <span className="text-tinta tabular-nums">{String(Math.floor(dia)).padStart(2, '0')}</span>/28 · {fase(dia)}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full bg-white" role="img" aria-label="Curvas hormonales del ciclo ovárico: LH, FSH, estradiol y progesterona">
        <defs>
          {HORMONAS.map((h) => (
            <linearGradient key={h.id} id={`area-${h.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={h.color} stopOpacity="0.16" />
              <stop offset="1" stopColor={h.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        <rect x={x(13)} y={PY - 10} width={x(15) - x(13)} height={H - PY * 2 + 10} fill="#e0246f" opacity="0.06" />
        {(
          [
            ['FOLICULAR', 7],
            ['OVULACIÓN', 14],
            ['LÚTEA', 21.5],
          ] as const
        ).map(([t, d]) => (
          <text key={t} x={x(d)} y={PY - 12} textAnchor="middle" fill="#94a3b8" className="font-mono" fontSize="8.5" letterSpacing="2">
            {t}
          </text>
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line key={v} x1={PX} x2={W - PX} y1={y(v)} y2={y(v)} stroke="#94a3b8" strokeOpacity={v === 0 ? 0.5 : 0.18} strokeDasharray={v === 0 ? '' : '2 5'} />
        ))}
        {[1, 7, 14, 21, 28].map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={PY - 4} y2={H - PY} stroke="#94a3b8" strokeOpacity="0.15" />
            <text x={x(d)} y={H - 8} textAnchor="middle" fill="#94a3b8" className="font-mono" fontSize="9">
              D{d}
            </text>
          </g>
        ))}

        {HORMONAS.map((h, i) => (
          <g key={h.id}>
            <path d={`${caminos[i]} L${x(28)} ${y(0)} L${x(1)} ${y(0)} Z`} fill={`url(#area-${h.id})`} />
            <path d={caminos[i]} fill="none" stroke={h.color} strokeWidth="2.2" strokeLinejoin="round" />
          </g>
        ))}

        <line x1={x(dia)} x2={x(dia)} y1={PY - 4} y2={H - PY} stroke="#0b1220" strokeOpacity="0.45" strokeWidth="1" />
        {HORMONAS.map((h) => (
          <circle key={h.id} cx={x(dia)} cy={y(h.f(dia))} r="3.8" fill="#fff" stroke={h.color} strokeWidth="2.2" />
        ))}
      </svg>

      <div className="grid grid-cols-2 gap-px border-t border-linea bg-linea sm:grid-cols-4">
        {HORMONAS.map((h) => {
          const v = h.rango[0] + Math.max(0, h.f(dia)) * (h.rango[1] - h.rango[0])
          return (
            <div key={h.id} className="bg-slate-50/80 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 rounded-full" style={{ background: h.color }} />
                <span className="font-mono text-[0.62rem] tracking-widest text-slate-500 uppercase">{h.nombre}</span>
              </div>
              <div className="mt-0.5 font-mono text-sm text-tinta tabular-nums">
                {v < 10 ? v.toFixed(1) : Math.round(v)} <span className="text-[0.62rem] text-slate-400">{h.unidad}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
