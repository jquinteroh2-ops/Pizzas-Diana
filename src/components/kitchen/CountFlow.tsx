// «Contar nevera»: reemplaza la hoja de conteo por ubicación (congelador, nevera negra…).
// Conteo a ciegas: la cocina no ve lo que dice el sistema, para que cuente lo que de verdad hay.
// El administrador sí ve la diferencia mientras cuenta.
import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Count, CountSheet, CountSheetLine, Item } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, ErrorBox, EmptyState, Segmented, Field, cx } from '../ui';
import { formatQty, niceUnit, toMilli, UNIT_SHORT, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { LOCATIONS, formatPacks, type Location } from '../../../shared/kitchen.ts';
import { LOCATION_ICONS, parseQty, validQty } from './helpers';

type Scale = 'pequena' | 'grande';

function looseUnit(base: BaseUnit, scale: Scale): Unit {
  if (base === 'unidad') return 'unidad';
  if (base === 'g') return scale === 'pequena' ? 'g' : 'kg';
  return scale === 'pequena' ? 'ml' : 'l';
}

export function CountFlow({ onClose }: { onClose: () => void }) {
  const items = useApi<Item[]>('/kitchen/items');
  const [location, setLocation] = useState<Location | null>(null);
  const [sent, setSent] = useState<Count | null>(null);

  const counts = useMemo(() => {
    const m = new Map<Location, number>();
    for (const i of items.data ?? []) m.set(i.location, (m.get(i.location) ?? 0) + 1);
    return m;
  }, [items.data]);

  return (
    <Modal open onClose={onClose} title={sent ? 'Conteo enviado' : location ? `Contar: ${location}` : '¿Qué vas a contar?'} size="lg">
      {sent ? (
        <SentCount c={sent} onClose={onClose} />
      ) : !location ? (
        items.error ? (
          <ErrorBox message={items.error} onRetry={items.reload} />
        ) : !items.data ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {LOCATIONS.filter((l) => counts.get(l)).map((l) => {
              const Icon = LOCATION_ICONS[l];
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocation(l)}
                  className="flex min-h-28 flex-col justify-between rounded-3xl border border-cream-300 bg-white p-4 text-left transition-all hover:border-brand-300 hover:shadow-card active:scale-[0.98]"
                >
                  <span className="grid size-10 place-items-center rounded-2xl bg-sky-50 text-sky-700">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-display text-lg font-semibold text-ink-900">{l}</span>
                    <span className="text-xs text-ink-500">{counts.get(l)} productos</span>
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <CountSheetForm location={location} onBack={() => setLocation(null)} onSent={setSent} />
      )}
    </Modal>
  );
}

function CountSheetForm({ location, onBack, onSent }: { location: Location; onBack: () => void; onSent: (c: Count) => void }) {
  const { bump, can } = useApp();
  const toast = useToast();
  const sheet = useApi<CountSheet>(`/counts/sheet?location=${encodeURIComponent(location)}`, [location]);
  const [scale, setScale] = useState<Scale>('pequena');
  const [values, setValues] = useState<Record<number, { packs: string; loose: string }>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = can('kitchen.manage');

  const countedM = (l: CountSheetLine): number | null => {
    const v = values[l.item_id];
    if (!v) return null;
    const hasPacks = l.pack_size_m > 0 && validQty(v.packs, true);
    const hasLoose = validQty(v.loose, true);
    if (!hasPacks && !hasLoose) return null;
    return (hasPacks ? Math.round(parseQty(v.packs) * l.pack_size_m) : 0) + (hasLoose ? toMilli(parseQty(v.loose), looseUnit(l.base_unit, scale)) : 0);
  };

  const lines = sheet.data?.lines ?? [];
  const filled = lines.filter((l) => countedM(l) !== null).length;

  const set = (id: number, k: 'packs' | 'loose', v: string) =>
    setValues((s) => ({ ...s, [id]: { ...(s[id] ?? { packs: '', loose: '' }), [k]: v.replace(/[^0-9.,]/g, '') } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        location,
        note,
        lines: lines
          .map((l) => ({ l, m: countedM(l) }))
          .filter((x) => x.m !== null)
          .map(({ l, m }) => ({ item_id: l.item_id, qty: m! / 1000, unit: l.base_unit === 'g' ? 'g' : l.base_unit === 'ml' ? 'ml' : 'unidad' })),
      };
      const c = await api.post<Count>('/counts', body);
      bump();
      onSent(c);
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (sheet.error) return <ErrorBox message={sheet.error} onRetry={sheet.reload} />;
  if (!sheet.data) return <Loading />;
  if (lines.length === 0) return <EmptyState icon={ClipboardList} title="No hay productos en esta ubicación" />;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          Cuenta lo que ves y escríbelo. Deja vacío lo que no cuentes.
          {!admin && ' No se muestra lo que dice el sistema, para que el conteo sea real.'}
        </p>
        <Segmented<Scale>
          size="sm"
          value={scale}
          onChange={setScale}
          options={[
            { value: 'pequena', label: 'Sueltos en g / ml' },
            { value: 'grande', label: 'en kg / l' },
          ]}
        />
      </div>

      <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-300 bg-white">
        {lines.map((l) => {
          const m = countedM(l);
          const diff = m === null ? null : m - l.qty_m;
          const lu = looseUnit(l.base_unit, scale);
          return (
            <li key={l.item_id} className={cx('px-3 py-3 sm:px-4', m !== null && 'bg-emerald-50/40')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{l.name}</p>
                  {admin && (
                    <p className="text-xs text-ink-500">
                      Sistema: {formatPacks(l.qty_m, l.pack_size_m, l.pack_label, l.unit) ?? formatQty(l.qty_m, l.unit)}
                      {diff !== null && diff !== 0 && (
                        <b className={cx('ml-2', diff < 0 ? 'text-brand-700' : 'text-emerald-700')}>
                          {diff > 0 ? '+' : '−'}
                          {formatQty(Math.abs(diff), niceUnit(Math.abs(diff), l.base_unit))}
                        </b>
                      )}
                    </p>
                  )}
                  {l.pack_size_m > 0 && <p className="text-xs text-ink-500">1 {l.pack_label} = {formatQty(l.pack_size_m, niceUnit(l.pack_size_m, l.base_unit))}</p>}
                </div>
                {m !== null && <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {l.pack_size_m > 0 && (
                  <>
                    <input
                      className="input w-20 text-center tabular-nums"
                      inputMode="decimal"
                      value={values[l.item_id]?.packs ?? ''}
                      onChange={(e) => set(l.item_id, 'packs', e.target.value)}
                      placeholder="0"
                      aria-label={`${l.name}: ${l.pack_label}s`}
                    />
                    <span className="text-xs font-semibold text-ink-500">{l.pack_label}s +</span>
                  </>
                )}
                <input
                  className="input w-28 tabular-nums"
                  inputMode="decimal"
                  value={values[l.item_id]?.loose ?? ''}
                  onChange={(e) => set(l.item_id, 'loose', e.target.value)}
                  placeholder="0"
                  aria-label={`${l.name}: ${UNIT_SHORT[lu]} sueltos`}
                />
                <span className="text-xs font-semibold text-ink-500">{UNIT_SHORT[lu]}{l.pack_size_m > 0 ? ' sueltos' : ''}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <Field label="Nota (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. conteo de apertura" />
      </Field>
      <div className="sticky bottom-0 -mx-6 flex flex-col-reverse gap-2 border-t border-cream-200 bg-white px-6 pt-4 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Otra ubicación
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-ink-500">
            {filled} de {lines.length} contados
          </span>
          <button className="btn-primary flex-1 py-3 sm:flex-none sm:px-6" disabled={busy || filled === 0}>
            {busy && <Loader2 className="size-4 animate-spin" />} {admin ? 'Guardar y ajustar' : 'Enviar conteo'}
          </button>
        </div>
      </div>
    </form>
  );
}

function SentCount({ c, onClose }: { c: Count; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="size-9" />
      </span>
      <p className="mt-4 font-display text-xl font-semibold text-ink-900">
        {c.lines_count} productos contados en {c.location}
      </p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">
        {c.status === 'aplicado'
          ? c.diff_count
            ? `Se ajustaron ${c.diff_count} productos que no coincidían con el sistema.`
            : 'Todo coincidía con el sistema.'
          : 'El administrador revisará las diferencias y ajustará el inventario.'}
      </p>
      <button className="btn-primary mt-6 w-full max-w-sm" onClick={onClose}>
        Terminar
      </button>
    </div>
  );
}
