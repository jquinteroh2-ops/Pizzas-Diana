// «Contar nevera»: reemplaza la hoja de conteo por ubicación (congelador, nevera negra…).
// Conteo a ciegas: la cocina no ve lo que dice el sistema, para que cuente lo que de verdad hay.
// El administrador sí ve la diferencia mientras cuenta.
import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, ClipboardList } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Count, CountSheet, CountSheetLine, DayCountStatus, Item } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, ErrorBox, EmptyState, Segmented, Field, cx } from '../ui';
import { formatQty, niceUnit, toMilli, UNIT_SHORT, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { COUNT_KINDS, COUNT_KIND_LABELS, LOCATIONS, formatPacks, presentationText, type CountKind, type Location } from '../../../shared/kitchen.ts';
import { formatTime } from '../../../shared/dates.ts';
import { LOCATION_ICONS, parseQty, validQty } from './helpers';

type Scale = 'pequena' | 'grande';

function looseUnit(base: BaseUnit, scale: Scale): Unit {
  if (base === 'unidad') return 'unidad';
  if (base === 'g') return scale === 'pequena' ? 'g' : 'kg';
  return scale === 'pequena' ? 'ml' : 'l';
}

export function CountFlow({ onClose, initialKind }: { onClose: () => void; initialKind?: CountKind }) {
  const items = useApi<Item[]>('/kitchen/items');
  const day = useApi<DayCountStatus[]>('/counts/day');
  // Antes de las 3 p. m. lo normal es la apertura; después, el cierre.
  const [kind, setKind] = useState<CountKind>(() => initialKind ?? (new Date().getHours() < 15 ? 'apertura' : 'cierre'));
  const [location, setLocation] = useState<Location | null>(null);
  const [sent, setSent] = useState<Count | null>(null);

  const counts = useMemo(() => {
    const m = new Map<Location, number>();
    for (const i of items.data ?? []) m.set(i.location, (m.get(i.location) ?? 0) + 1);
    return m;
  }, [items.data]);
  const doneFor = (l: Location) => (kind === 'libre' ? null : (day.data?.find((d) => d.location === l)?.[kind] ?? null));

  return (
    <Modal
      open
      onClose={onClose}
      title={sent ? 'Conteo enviado' : location ? `${COUNT_KIND_LABELS[kind]}: ${location}` : '¿Qué vas a contar?'}
      size="lg"
    >
      {sent ? (
        <SentCount c={sent} onClose={onClose} />
      ) : !location ? (
        items.error ? (
          <ErrorBox message={items.error} onRetry={items.reload} />
        ) : !items.data ? (
          <Loading />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {COUNT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cx(
                    'rounded-2xl border p-3 text-left transition-all',
                    kind === k ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400',
                  )}
                >
                  <span className="block text-sm font-semibold">{COUNT_KIND_LABELS[k]}</span>
                  <span className={cx('block text-[11px]', kind === k ? 'text-white/70' : 'text-ink-500')}>
                    {k === 'apertura' ? 'Al empezar el día' : k === 'cierre' ? 'Al terminar el día' : 'En cualquier momento'}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOCATIONS.filter((l) => counts.get(l)).map((l) => {
                const Icon = LOCATION_ICONS[l];
                const done = doneFor(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocation(l)}
                    className={cx(
                      'flex min-h-28 flex-col justify-between rounded-3xl border p-4 text-left transition-all hover:shadow-card active:scale-[0.98]',
                      done ? 'border-emerald-300 bg-emerald-50/60' : 'border-cream-300 bg-white hover:border-brand-300',
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-2xl bg-sky-50 text-sky-700">
                        <Icon className="size-5" />
                      </span>
                      {done && <CheckCircle2 className="size-6 text-emerald-600" />}
                    </span>
                    <span>
                      <span className="block font-display text-lg font-semibold text-ink-900">{l}</span>
                      <span className="text-xs text-ink-500">
                        {done ? `Ya contada por ${done.counted_by_name} a las ${formatTime(done.counted_at)}` : `${counts.get(l)} productos`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : (
        <CountSheetForm location={location} kind={kind} onBack={() => setLocation(null)} onSent={setSent} />
      )}
    </Modal>
  );
}

function CountSheetForm({ location, kind, onBack, onSent }: { location: Location; kind: CountKind; onBack: () => void; onSent: (c: Count) => void }) {
  const { bump, can } = useApp();
  const toast = useToast();
  const sheet = useApi<CountSheet>(`/counts/sheet?location=${encodeURIComponent(location)}`, [location]);
  const [scale, setScale] = useState<Scale>('pequena');
  const [values, setValues] = useState<Record<number, { packs: string; portions: string[]; loose: string }>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = can('kitchen.manage');

  const countedM = (l: CountSheetLine): number | null => {
    const v = values[l.item_id];
    if (!v) return null;
    const hasPacks = l.pack_size_m > 0 && validQty(v.packs, true);
    const portions = l.portions.map((p, i) => (validQty(v.portions[i] ?? '', true) ? Math.round(parseQty(v.portions[i])) * p.size_m : null));
    const hasLoose = validQty(v.loose, true);
    if (!hasPacks && !hasLoose && portions.every((x) => x === null)) return null;
    return (
      (hasPacks ? Math.round(parseQty(v.packs) * l.pack_size_m) : 0) +
      portions.reduce<number>((sum, x) => sum + (x ?? 0), 0) +
      (hasLoose ? toMilli(parseQty(v.loose), looseUnit(l.base_unit, scale)) : 0)
    );
  };

  const lines = sheet.data?.lines ?? [];
  const filled = lines.filter((l) => countedM(l) !== null).length;

  const set = (l: CountSheetLine, k: 'packs' | 'loose' | number, v: string) =>
    setValues((s) => {
      const cur = s[l.item_id] ?? { packs: '', portions: l.portions.map(() => ''), loose: '' };
      const clean = v.replace(/[^0-9.,]/g, '');
      return { ...s, [l.item_id]: typeof k === 'number' ? { ...cur, portions: cur.portions.map((p, i) => (i === k ? clean : p)) } : { ...cur, [k]: clean } };
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        location,
        kind,
        note,
        lines: lines
          .map((l) => ({ l, m: countedM(l) }))
          .filter((x) => x.m !== null)
          // Paquetes + porciones + suelto (el suelto ya convertido a g/ml/und): el servidor guarda el desglose.
          .map(({ l }) => {
            const v = values[l.item_id]!;
            const lu = looseUnit(l.base_unit, scale);
            const loose = validQty(v.loose, true) ? toMilli(parseQty(v.loose), lu) / 1000 : undefined;
            return { item_id: l.item_id, packs: v.packs || undefined, portions: v.portions.map((p) => (p ? parseQty(p) : 0)), loose };
          }),
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
                  <p className="font-semibold text-ink-900">
                    {l.name}
                    {presentationText(l) && <span className="ml-1.5 text-xs font-medium text-ink-500">· {presentationText(l)}</span>}
                  </p>
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {l.pack_size_m > 0 && (
                  <>
                    <input
                      className="input w-20 text-center tabular-nums"
                      inputMode="decimal"
                      value={values[l.item_id]?.packs ?? ''}
                      onChange={(e) => set(l, 'packs', e.target.value)}
                      placeholder="0"
                      aria-label={`${l.name}: ${l.pack_label}s`}
                    />
                    <span className="text-xs font-semibold text-ink-500">{l.pack_label}s +</span>
                  </>
                )}
                {l.portions.map((p, i) => (
                  <span key={p.label} className="flex items-center gap-2">
                    <input
                      className="input w-20 text-center tabular-nums"
                      inputMode="numeric"
                      value={values[l.item_id]?.portions[i] ?? ''}
                      onChange={(e) => set(l, i, e.target.value)}
                      placeholder="0"
                      aria-label={`${l.name}: ${p.label}`}
                    />
                    <span className="text-xs font-semibold text-ink-500">{p.label} +</span>
                  </span>
                ))}
                <input
                  className="input w-28 tabular-nums"
                  inputMode="decimal"
                  value={values[l.item_id]?.loose ?? ''}
                  onChange={(e) => set(l, 'loose', e.target.value)}
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
        {COUNT_KIND_LABELS[c.kind]}: {c.lines_count} productos contados en {c.location}
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
