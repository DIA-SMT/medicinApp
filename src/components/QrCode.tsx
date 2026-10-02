import QRCode from 'qrcode'
import { useMemo } from 'react'
import { UteroMark } from './Logo'

interface Props {
  value: string
  className?: string
  /** color de los módulos — se mantiene casi negro para máxima lectura en proyectores */
  tinta?: string
  /** color del centro de los patrones de búsqueda */
  acento?: string
  margen?: number
}

/**
 * QR con módulos redondeados, buscadores personalizados y la marca al centro.
 * Corrección de errores H (30 %): la insignia central ocupa menos del 4 % del área.
 */
export function QrCode({ value, className = '', tinta = '#0a0f1f', acento = '#b0124f', margen = 2 }: Props) {
  const { n, modulos } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'H' })
    return { n: qr.modules.size, modulos: qr.modules.data }
  }, [value])

  const insignia = Math.round(n * 0.2) | 1
  const c0 = (n - insignia) / 2
  const enBuscador = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
  // Insignia + un módulo de aire alrededor.
  const enCentro = (r: number, c: number) => r >= c0 - 1 && r <= c0 + insignia && c >= c0 - 1 && c <= c0 + insignia

  const celdas: React.ReactNode[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modulos[r * n + c] || enBuscador(r, c) || enCentro(r, c)) continue
      celdas.push(<rect key={r * n + c} x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.3} />)
    }
  }

  const buscadores = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]
  const lado = n + margen * 2

  return (
    <svg viewBox={`${-margen} ${-margen} ${lado} ${lado}`} className={className} shapeRendering="geometricPrecision" role="img" aria-label="Código QR de asistencia">
      <rect x={-margen} y={-margen} width={lado} height={lado} fill="#fff" />
      <g fill={tinta}>{celdas}</g>
      {buscadores.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.7} fill="none" stroke={tinta} strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.95} fill={acento} />
        </g>
      ))}
      <rect x={c0 - 0.2} y={c0 - 0.2} width={insignia + 0.4} height={insignia + 0.4} rx={insignia * 0.28} fill="#fff" stroke={tinta} strokeOpacity={0.12} strokeWidth={0.3} />
      <svg x={c0 + insignia * 0.1} y={c0 + insignia * 0.1} width={insignia * 0.8} height={insignia * 0.8} viewBox="0 0 48 48">
        <UteroMark mono={acento} className="" />
      </svg>
    </svg>
  )
}

/** Borde de progreso que se consume alrededor de una tarjeta cuadrada. */
export function MarcoProgreso({ progreso, color = '#22e1ff' }: { progreso: number; color?: string }) {
  return (
    <svg className="pointer-events-none absolute -inset-[7px] h-[calc(100%+14px)] w-[calc(100%+14px)]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="7" fill="none" stroke="#e7eaf1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <rect
        x="0.6" y="0.6" width="98.8" height="98.8" rx="7" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(100, progreso * 100))} 100`}
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.25s linear' }}
      />
    </svg>
  )
}
