import { useId } from 'react'

/** Un latido PQRST de 100 unidades de ancho sobre línea de base y=20. */
const latido = (o: number) =>
  `L${o + 16} 20 Q${o + 19.5} 15.5 ${o + 23} 20 L${o + 29} 20 L${o + 31} 23 L${o + 34} 3 L${o + 37.5} 31 L${o + 40.5} 20 L${o + 50} 20 Q${o + 57} 12.5 ${o + 64} 20 L${o + 100} 20`

interface Props {
  latidos?: number
  className?: string
  color?: string
  /** segundos que tarda el barrido en recorrer el trazo */
  duracion?: number
}

/** Trazo de electrocardiograma con barrido luminoso, como un monitor multiparamétrico. */
export function EcgLine({ latidos = 6, className = '', color = '#ff3d81', duracion = 3.6 }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  let d = 'M0 20'
  for (let i = 0; i < latidos; i++) d += ' ' + latido(i * 100)
  return (
    <svg viewBox={`0 0 ${latidos * 100} 34`} preserveAspectRatio="none" className={className} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeOpacity={duracion > 0 ? 0.16 : 0.9} strokeWidth={duracion > 0 ? 1.3 : 1.6} vectorEffect="non-scaling-stroke" />
      {duracion > 0 && <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1000}
        strokeDasharray="220 780"
        style={{ animation: `ecg-${id} ${duracion}s linear infinite`, filter: `drop-shadow(0 0 4px ${color})` }}
      />}
      <style>{`@keyframes ecg-${id}{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}`}</style>
    </svg>
  )
}
