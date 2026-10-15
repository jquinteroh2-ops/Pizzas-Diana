// Piezas compartidas por las pantallas de cocina. Pensadas para el celular del
// cocinero: botones grandes, pocas palabras y la unidad siempre a la vista.
import { useState, type ReactNode } from 'react';
import { Search, ChevronRight, type LucideIcon } from 'lucide-react';
import { UNIT_SHORT, formatQty, unitsFor, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { LOCATIONS, type Location } from '../../../shared/kitchen.ts';
import type { Item } from '../../lib/types';
import { cx, StockBadge } from '../ui';
import { LOCATION_ICONS } from './helpers';

/** Campo de cantidad con la unidad pegada (y cambio rápido g ↔ kg). */
export function QtyInput({
  value,
  onChange,
  unit,
  onUnit,
  base,
  placeholder = '0',
  autoFocus,
  big,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: Unit;
  onUnit?: (u: Unit) => void;
  base: BaseUnit;
  placeholder?: string;
  autoFocus?: boolean;
  big?: boolean;
  id?: string;
}) {
  const options = unitsFor(base);
  return (
    <div className="flex items-stretch gap-2">
      <input
        id={id}
        className={cx('input tabular-nums', big && 'py-3.5 text-lg font-semibold')}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {onUnit && options.length > 1 ? (
        <div className="inline-flex shrink-0 rounded-xl bg-cream-200/80 p-1">
          {options.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnit(u)}
              className={cx('min-w-11 rounded-lg px-2.5 text-sm font-bold transition-all', unit === u ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}
            >
              {UNIT_SHORT[u]}
            </button>
          ))}
        </div>
      ) : (
        <span className="grid min-w-14 shrink-0 place-items-center rounded-xl bg-cream-200/80 px-3 text-sm font-bold text-ink-700">{UNIT_SHORT[unit]}</span>
      )}
    </div>
  );
}

/** Buscador de productos del inventario, con filtro por nevera. */
export function ItemPicker({
  items,
  onPick,
  right,
  showStock = true,
}: {
  items: Item[];
  onPick: (i: Item) => void;
  right?: (i: Item) => ReactNode;
  showStock?: boolean;
}) {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState<Location | ''>('');
  const usedLocations = LOCATIONS.filter((l) => items.some((i) => i.location === l));
  const term = q.trim().toLowerCase();
  const list = items
    .filter((i) => i.active && (!loc || i.location === loc) && (!term || i.name.toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
        <input className="input py-3 pl-10" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
      </div>
      {usedLocations.length > 1 && (
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" className={cx('chip shrink-0', !loc ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700')} onClick={() => setLoc('')}>
            Todo
          </button>
          {usedLocations.map((l) => {
            const Icon = LOCATION_ICONS[l];
            return (
              <button
                type="button"
                key={l}
                className={cx('chip shrink-0', loc === l ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700')}
                onClick={() => setLoc(l)}
              >
                <Icon className="size-3.5" /> {l}
              </button>
            );
          })}
        </div>
      )}
      <ul className="mt-2 max-h-[52dvh] divide-y divide-cream-200 overflow-y-auto">
        {list.length === 0 && <li className="py-8 text-center text-sm text-ink-500">No hay productos con ese nombre.</li>}
        {list.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-cream-50 active:bg-cream-100">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink-900">{i.name}</span>
                <span className="block text-xs text-ink-500">
                  {i.location}
                  {showStock && <> · hay {formatQty(i.qty_m, i.unit)}</>}
                </span>
              </span>
              {right ? right(i) : showStock && i.status !== 'disponible' ? <StockBadge status={i.status} /> : null}
              <ChevronRight className="size-4 shrink-0 text-ink-400" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tarjeta grande de acción para la pantalla de cocina. */
export function ActionTile({
  icon: Icon,
  title,
  text,
  onClick,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  onClick: () => void;
  tone: 'brand' | 'amber' | 'ink' | 'green';
}) {
  const tones = {
    brand: 'from-brand-600 to-brand-700 text-white shadow-brand-900/25',
    amber: 'from-crust-300 to-crust-500 text-ink-900 shadow-crust-500/30',
    ink: 'from-ink-700 to-ink-900 text-white shadow-ink-900/25',
    green: 'from-emerald-600 to-emerald-700 text-white shadow-emerald-900/20',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex min-h-32 flex-col justify-between rounded-3xl bg-gradient-to-br p-4 text-left shadow-lg transition-transform active:scale-[0.97] sm:min-h-36 sm:p-5', tones)}
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-white/20">
        <Icon className="size-6" />
      </span>
      <span>
        <span className="block font-display text-xl leading-tight font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs opacity-80">{text}</span>
      </span>
    </button>
  );
}
