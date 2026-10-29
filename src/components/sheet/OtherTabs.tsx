// Pestañas «Preparaciones» y «Pedido» de la hoja del día.
import { useState } from 'react';
import { ArrowRight, ChefHat, Megaphone, PackageCheck, ScrollText } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Production, Shortage } from '../../lib/types';
import { formatTime } from '../../../shared/dates.ts';
import { SHORTAGE_LEVEL_LABELS, SHORTAGE_STATUS_LABELS } from '../../../shared/kitchen.ts';
import { formatNumber, formatQty, niceUnit } from '../../../shared/units.ts';
import { useToast } from '../toast';
import { Badge, EmptyState, ErrorBox, Loading, cx } from '../ui';
import { efficiencyTone } from '../kitchen/helpers';
import { MasaSheet, MermaSheet } from '../kitchen/Sheets';
import type { Flow } from '../kitchen/FlowHost';

// Sin centésimas de gramo: «831,945 g» → «832 g».
const qty = (m: number, base: Parameters<typeof niceUnit>[1]) => {
  const r = base === 'unidad' ? m : Math.round(m / 1000) * 1000;
  return formatQty(r, niceUnit(r, base));
};

// ---------- Preparaciones ----------

export function PrepTab({ date, onFlow, editable }: { date: string; onFlow: (f: Flow) => void; editable: boolean }) {
  const prods = useApi<Production[]>(`/productions?from=${date}&to=${date}&limit=200`, [date]);
  const [paper, setPaper] = useState(false);
  const list = (prods.data ?? []).filter((p) => p.status === 'activa').sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm text-ink-700">
          <p className="font-display text-lg font-semibold text-ink-900">Recetas y porcionado</p>
          <p className="mt-1">
            Cuando preparas (salsas, carne molida, adobo, masa) o porcionas (pechuga, cerdo, quesos), el sistema descuenta lo que usaste y suma lo que salió.
            <b> No hay que contarlo dos veces</b>: en la hoja aparece solo en «Preparado / bajas».
          </p>
        </div>
        {editable && (
          <button className="btn shrink-0 bg-ink-900 px-5 py-3 text-white hover:bg-ink-700" onClick={() => onFlow({ kind: 'preparar' })}>
            <ChefHat className="size-5" /> Registrar preparación
          </button>
        )}
      </div>

      <section className="card overflow-hidden">
        <h3 className="border-b border-cream-200 px-4 py-3 font-display text-lg font-semibold">Lo que se preparó este día</h3>
        {prods.error ? (
          <ErrorBox message={prods.error} onRetry={prods.reload} />
        ) : !prods.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState icon={ChefHat} title="Nada preparado todavía" text="Lo que registres aparece aquí con lo que usaste, lo que salió y la merma." />
        ) : (
          <ul className="divide-y divide-cream-200">
            {list.map((p) => {
              const base = p.inputs[0];
              const merma = p.merma_util_m + p.merma_inutil_m;
              return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">{p.preparation_name}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-700">
                      {p.inputs.map((i, idx) => (
                        <span key={i.item_id}>
                          {qty(i.qty_m, i.base_unit)} de {i.item_name.toLowerCase()}
                          {idx < p.inputs.length - 1 ? ',' : ''}
                        </span>
                      ))}
                      <ArrowRight className="size-3.5 text-ink-400" />
                      <b>
                        {qty(p.output_m, outputBase(p))} de {p.output_name.toLowerCase()}
                      </b>
                    </p>
                    <p className="text-xs text-ink-500">
                      {p.user_name} · {formatTime(p.created_at)}
                      {merma > 0 && base && <> · merma {qty(merma, base.base_unit)}</>}
                    </p>
                  </div>
                  {p.efficiency_pct !== null && (
                    <span className="self-start sm:self-center"><Badge tone={efficiencyTone(p.efficiency_pct)}>Rindió {formatNumber(p.efficiency_pct)} %</Badge></span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button className="btn-secondary" onClick={() => setPaper((v) => !v)}>
        <ScrollText className="size-4" /> {paper ? 'Ocultar' : 'Ver'} la semana como en las hojas de merma y masa
      </button>
      {paper && (
        <div className="space-y-5">
          <MermaSheet onFlow={onFlow} />
          <MasaSheet onFlow={onFlow} />
        </div>
      )}
    </div>
  );
}

/** Unidad base de la salida de una preparación (la de su artículo). */
function outputBase(p: Production) {
  return p.output_unit === 'kg' || p.output_unit === 'g' ? 'g' : p.output_unit === 'l' || p.output_unit === 'ml' ? 'ml' : 'unidad';
}

// ---------- Pedido: lo que hace falta ----------

export function OrderTab({ onFlow }: { onFlow: (f: Flow) => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const open = useApi<Shortage[]>('/shortages?scope=open');
  const items = useApi<Item[]>('/kitchen/items');
  const [busy, setBusy] = useState<number | null>(null);

  const reported = new Set((open.data ?? []).map((s) => s.item_id));
  const low = (items.data ?? []).filter((i) => i.status !== 'disponible' && !reported.has(i.id)).sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'es'));

  const add = async (i: Item) => {
    setBusy(i.id);
    try {
      await api.post('/shortages', { item_id: i.id, level: i.status === 'agotado' ? 'agotado' : 'poco', note: '' });
      toast.success('Agregado a la lista', i.name);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-cream-200 px-4 py-3">
          <h3 className="font-display text-lg font-semibold">Lista de lo que hace falta</h3>
          <button className="btn btn-sm shrink-0 bg-ink-900 whitespace-nowrap text-white hover:bg-ink-700" onClick={() => onFlow({ kind: 'faltante' })}>
            <Megaphone className="size-4" /> Falta algo
          </button>
        </div>
        {open.error ? (
          <ErrorBox message={open.error} onRetry={open.reload} />
        ) : !open.data ? (
          <Loading />
        ) : open.data.length === 0 ? (
          <EmptyState icon={PackageCheck} title="No falta nada" text="Cuando algo se esté acabando, agrégalo aquí. Al anotarlo en «Llegó» sale solo de la lista." />
        ) : (
          <ul className="divide-y divide-cream-200">
            {open.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{s.item_name}</p>
                  <p className="text-xs text-ink-500">
                    {s.location} · {s.reported_by_name}
                    {s.note && <> · «{s.note}»</>}
                  </p>
                </div>
                <Badge tone={s.level === 'agotado' ? 'red' : 'amber'}>{SHORTAGE_LEVEL_LABELS[s.level]}</Badge>
                <Badge tone={s.status === 'pedido' ? 'green' : 'neutral'}>{SHORTAGE_STATUS_LABELS[s.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-cream-200 px-4 py-2.5 text-[11px] text-ink-500">
          Cuando llegue la mercancía, anótala en la columna «Llegó» de la hoja: entra al inventario y sale de esta lista.
        </p>
      </section>

      <section className="card overflow-hidden">
        <h3 className="border-b border-cream-200 px-4 py-3 font-display text-lg font-semibold">Según el sistema se está acabando</h3>
        {items.error ? (
          <ErrorBox message={items.error} onRetry={items.reload} />
        ) : !items.data ? (
          <Loading />
        ) : low.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">Nada por debajo del mínimo.</p>
        ) : (
          <ul className="divide-y divide-cream-200">
            {low.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{i.name}</p>
                  <p className={cx('text-xs', i.status === 'agotado' ? 'text-brand-700' : 'text-amber-700')}>
                    {i.status === 'agotado' ? 'Se acabó' : `Quedan ${formatQty(i.qty_m, i.unit)} (mínimo ${formatQty(i.min_m, i.unit)})`}
                  </p>
                </div>
                <button className="btn-secondary btn-sm" disabled={busy === i.id} onClick={() => void add(i)}>
                  Agregar a la lista
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
