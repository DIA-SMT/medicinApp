import { useId } from 'react'
import { Link } from 'react-router-dom'

/** Útero y anexos en trazo continuo: la marca de la cátedra. */
export function UteroMark({ className = 'h-9 w-9', mono }: { className?: string; mono?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fill = mono ?? `url(#u${id})`
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={`u${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0246f" />
          <stop offset="0.55" stopColor="#d1358f" />
          <stop offset="1" stopColor="#f472a8" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={fill} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 16.5C17 12.8 20 11 24 11s7 1.8 7 5.5c0 5.8-2.4 10.6-4.4 13.6v5c0 1.5-1.2 2.6-2.6 2.6s-2.6-1.1-2.6-2.6v-5C19.4 27.1 17 22.3 17 16.5Z" />
        <path d="M17.6 14.6c-3.4-3.5-8-4-10-1.1-1.4 2-.6 4.7 1.7 5.6" />
        <path d="M30.4 14.6c3.4-3.5 8-4 10-1.1 1.4 2 .6 4.7-1.7 5.6" />
      </g>
      <ellipse cx="11.3" cy="22.6" rx="3.3" ry="2.5" fill={fill} opacity="0.9" />
      <ellipse cx="36.7" cy="22.6" rx="3.3" ry="2.5" fill={fill} opacity="0.9" />
      <path d="M21.2 16.4h5.6L24 23.6Z" fill={fill} opacity="0.4" />
    </svg>
  )
}

export function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="Inicio">
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-linea bg-white shadow-[0_6px_18px_-10px_rgb(224_36_111/0.6)] transition group-hover:border-rosa/40">
        <UteroMark className="h-8 w-8" />
      </div>
      {!compacta && (
        <div className="leading-none max-[379px]:hidden">
          <div className="font-display text-[1.15rem] font-bold tracking-[0.22em] text-tinta">CICLO</div>
          <div className="mt-1 hidden font-mono text-[0.62rem] tracking-[0.2em] whitespace-nowrap text-slate-500 uppercase sm:block">Ginecología · FM-UNT</div>
        </div>
      )}
    </Link>
  )
}

export function SelloUNT({ className = 'h-10 w-auto' }: { className?: string }) {
  return <img src="/logo-unt.png" alt="Universidad Nacional de Tucumán" className={className} />
}
