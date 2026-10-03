/** Fondo global: rosa claro, auroras pastel muy suaves y retícula de puntos de monitor. */
export function Background() {
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-fondo">
      <div className="animate-deriva absolute -top-[30%] -left-[15%] h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(circle,rgb(224_36_111/0.12),transparent_60%)]" />
      <div
        className="animate-deriva absolute top-[5%] -right-[20%] h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,rgb(244_114_168/0.14),transparent_60%)]"
        style={{ animationDelay: '-9s', animationDirection: 'alternate-reverse' }}
      />
      <div
        className="animate-deriva absolute -bottom-[40%] left-[25%] h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,rgb(176_74_166/0.08),transparent_60%)]"
        style={{ animationDelay: '-15s' }}
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(rgb(224 36 111 / 0.16) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, black, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 70%)',
        }}
      />
    </div>
  )
}
