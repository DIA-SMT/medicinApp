import { Activity, Baby, Bug, Dna, Microscope, Pill, Ribbon, ScanLine, Thermometer, type LucideIcon } from 'lucide-react'
import { AREAS, type Area } from '../lib/cronograma'
import type { EstadoVentana } from '../lib/time'

const ICONOS: Record<Area, LucideIcon> = {
  endocrino: Activity,
  obstetricia: Baby,
  infecto: Bug,
  'salud-sexual': Pill,
  reproduccion: Dna,
  climaterio: Thermometer,
  oncologia: Microscope,
  mastologia: Ribbon,
}

export function IconoArea({ area, className = 'h-4 w-4', color }: { area: Area; className?: string; color?: string }) {
  const I = ICONOS[area] ?? ScanLine
  return <I className={className} style={{ color: color ?? AREAS[area].color }} strokeWidth={1.9} />
}

export function ChipArea({ area }: { area: Area }) {
  const a = AREAS[area]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.62rem] font-medium tracking-[0.12em] uppercase"
      style={{ borderColor: `${a.color}40`, background: `${a.color}0f`, color: a.color }}
    >
      <IconoArea area={area} className="h-3 w-3" />
      {a.label}
    </span>
  )
}

export function ChipParcial({ texto }: { texto: string }) {
  return (
    <span className="rounded-full border border-ambar/40 bg-ambar-suave px-2.5 py-1 font-mono text-[0.62rem] font-medium tracking-[0.12em] text-ambar uppercase">{texto}</span>
  )
}

const ESTADO: Record<EstadoVentana, { texto: string; color: string }> = {
  abierta: { texto: 'Registro abierto', color: '#0e9f68' },
  programada: { texto: 'Programado', color: '#c27c03' },
  cerrada: { texto: 'Registro cerrado', color: '#e0246f' },
}

export function PildoraEstado({ estado, grande }: { estado: EstadoVentana; grande?: boolean }) {
  const e = ESTADO[estado]
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-mono font-medium tracking-[0.14em] uppercase ${grande ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-[0.65rem]'}`}
      style={{ borderColor: `${e.color}55`, background: `${e.color}12`, color: e.color }}
    >
      <span className="relative flex h-2 w-2">
        {estado === 'abierta' && <span className="animate-latido absolute inline-flex h-full w-full rounded-full" style={{ background: e.color }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: e.color }} />
      </span>
      {e.texto}
    </span>
  )
}

export function Kpi({ etiqueta, valor, sufijo, color = '#0b1220', icono: I, nota }: { etiqueta: string; valor: React.ReactNode; sufijo?: string; color?: string; icono?: LucideIcon; nota?: string }) {
  return (
    <div className="tarjeta hud p-4">
      <div className="flex items-center justify-between">
        <span className="etiqueta">{etiqueta}</span>
        {I && <I className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums" style={{ color }}>
        {valor}
        {sufijo && <span className="ml-1 text-base text-slate-400">{sufijo}</span>}
      </div>
      {nota && <div className="mt-1 text-xs text-slate-500">{nota}</div>}
    </div>
  )
}

export function Seccion({ etiqueta, titulo, children, id, accion }: { etiqueta: string; titulo: React.ReactNode; children: React.ReactNode; id?: string; accion?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="etiqueta mb-2 flex items-center gap-2">
            <span className="h-px w-6 bg-gradient-to-r from-rosa to-cian" />
            {etiqueta}
          </div>
          <h2 className="font-display text-2xl font-semibold text-tinta sm:text-3xl">{titulo}</h2>
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}
