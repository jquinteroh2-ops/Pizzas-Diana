// «Porcionar»: partir un insumo en porciones estándar (pechuga en porciones de 80 g para
// las picadas, papas en bolsas…). Las porciones siguen siendo el MISMO producto: no se crea
// otro en el inventario ni hay que contarlo dos veces. Solo se descuenta lo que se botó.
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Scissors } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Portioning } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, ErrorBox, EmptyState, Field } from '../ui';
import { formatNumber, formatQty, niceUnit, toMilli, UNIT_SHORT } from '../../../shared/units.ts';
import { portioningYield } from '../../../shared/kitchen.ts';
import { ItemPicker } from './common';
import { parseQty, smallUnit, validQty } from './helpers';

export function PortionFlow({ onClose }: { onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/kitchen/items');
  const [item, setItem] = useState<Item | null>(null);
  const [counts, setCounts] = useState<string[]>([]);
  const [merma, setMerma] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Portioning | null>(null);

  const withPortions = (items.data ?? []).filter((i) => i.portions.length > 0);
  const output = item ? item.portions.reduce((s, p, i) => s + (validQty(counts[i] ?? '', true) ? Math.round(parseQty(counts[i])) * p.size_m : 0), 0) : 0;
  const mermaM = item && validQty(merma, true) ? toMilli(parseQty(merma), smallUnit(item.base_unit)) : 0;
  const yieldPct = portioningYield(output, mermaM);

  const pick = (i: Item) => {
    setItem(i);
    setCounts(i.portions.map(() => ''));
    setMerma('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    try {
      const r = await api.post<Portioning>('/portionings', { item_id: item.id, portions: counts.map((c) => (c ? parseQty(c) : 0)), merma: merma ? parseQty(merma) : 0, note });
      bump();
      setDone(r);
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={done ? 'Porcionado guardado' : item ? `Porcionar ${item.name}` : '¿Qué vas a porcionar?'} size="md">
      {done ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-9" />
          </span>
          <p className="mt-4 font-display text-xl font-semibold text-ink-900">{done.lines.map((l) => `${l.n} ${l.label}`).join(' · ')}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            Siguen siendo {done.item_name}: al contar escribe las porciones en su casilla.
            {done.merma_m > 0 && ` Se descontaron ${formatQty(done.merma_m, niceUnit(done.merma_m, done.base_unit))} de merma.`}
          </p>
          <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                setDone(null);
                setItem(null);
                setNote('');
              }}
            >
              Porcionar otro producto
            </button>
            <button className="btn-primary" onClick={onClose}>
              Terminar
            </button>
          </div>
        </div>
      ) : items.error ? (
        <ErrorBox message={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <Loading />
      ) : !item ? (
        withPortions.length === 0 ? (
          <EmptyState icon={Scissors} title="Ningún producto tiene porciones" text="El administrador las configura en Inventario → Editar → Porciones (por ejemplo, pechuga: porción picada 80 g)." />
        ) : (
          <ItemPicker items={withPortions} onPick={pick} />
        )
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-ink-500">Escribe cuántas porciones salieron de cada tamaño y cuánto se botó al limpiar (grasa, piel, puntas).</p>
          <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-300 bg-white">
            {item.portions.map((p, i) => (
              <li key={p.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-semibold text-ink-900">{p.label}</span>
                  <span className="text-xs text-ink-500">{formatQty(p.size_m, smallUnit(item.base_unit))} cada una</span>
                </span>
                <input
                  className="input w-24 text-center tabular-nums"
                  inputMode="numeric"
                  value={counts[i] ?? ''}
                  onChange={(e) => setCounts((c) => c.map((x, k) => (k === i ? e.target.value.replace(/[^0-9]/g, '') : x)))}
                  placeholder="0"
                  aria-label={`Cuántas ${p.label}`}
                />
              </li>
            ))}
          </ul>
          <Field label={`Merma: lo que se botó (${UNIT_SHORT[smallUnit(item.base_unit)]})`} hint="Déjalo en 0 si no se botó nada (por ejemplo, las papas).">
            <input className="input tabular-nums" inputMode="decimal" value={merma} onChange={(e) => setMerma(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" />
          </Field>
          <Field label="Nota (opcional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. pechuga con mucha grasa" />
          </Field>
          {output > 0 && (
            <p className="rounded-xl bg-cream-100 px-3 py-2 text-sm text-ink-700">
              Porcionado: <b>{formatQty(output, niceUnit(output, item.base_unit))}</b>
              {mermaM > 0 && yieldPct !== null && (
                <>
                  {' '}
                  · rendimiento <b className={yieldPct < 90 ? 'text-brand-700' : 'text-emerald-700'}>{formatNumber(yieldPct)} %</b>
                </>
              )}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" className="btn-ghost" onClick={() => setItem(null)}>
              Otro producto
            </button>
            <button className="btn-primary" disabled={busy || output === 0}>
              {busy && <Loader2 className="size-4 animate-spin" />} Guardar porcionado
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
