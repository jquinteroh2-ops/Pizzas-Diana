// Logotipo tipográfico de Pizza Diana con un pequeño símbolo de porción de pizza.
export function PizzaMark({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#c42d1a" />
      <path d="M14 19c11-6.2 25-6.2 36 0L32 54Z" fill="#f7c873" />
      <path d="M14 19c11-6.2 25-6.2 36 0l-2.6 5.2c-9.6-4.9-21.2-4.9-30.8 0Z" fill="#e9a23b" />
      <circle cx="27" cy="31" r="3.6" fill="#c42d1a" />
      <circle cx="37.5" cy="30" r="3.2" fill="#c42d1a" />
      <circle cx="32" cy="41" r="3" fill="#c42d1a" />
      <circle cx="33" cy="25" r="1.3" fill="#2f7d4f" />
      <circle cx="29" cy="38" r="1.1" fill="#2f7d4f" />
    </svg>
  );
}

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <PizzaMark className={compact ? 'size-9' : 'size-11'} />
      <div className="leading-none">
        <span className={`font-display text-[1.45rem] font-semibold italic tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>
          Pizza <span className={light ? 'text-crust-300' : 'text-brand-600'}>Diana</span>
        </span>
        {!compact && (
          <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.22em] ${light ? 'text-white/55' : 'text-ink-500'}`}>
            Inventario &amp; ventas
          </span>
        )}
      </div>
    </div>
  );
}
