// Las hojas de Pizza Diana, iguales a las de papel que usaba la cocina:
// inventario diario (inicio | entrada | fin | consumo), merma, masa de pizza y bajas.
// Se llenan en la misma tabla y se pueden imprimir con el mismo formato.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Printer, Pencil, Copy, Loader2, Camera, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { InventorySheet, InventorySheetLine, Preparation, Production, Waste } from '../../lib/types';
import { useToast } from '../toast';
import { Loading, ErrorBox, cx } from '../ui';
import { formatNumber, formatQty, fromMilli, niceUnit, toMilli, UNIT_SHORT, baseOf, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { formatPacks, WASTE_REASON_LABELS, type Location } from '../../../shared/kitchen.ts';
import { addDays, daysBetween, formatTime, localDate, shortDate, shortDateDow, weekEnd, weekStart } from '../../../shared/dates.ts';
import type { Flow } from './FlowHost';
import { parseQty, smallUnit, validQty } from './helpers';

type SheetTab = 'inventario' | 'merma' | 'masa' | 'bajas';

const TABS: { value: SheetTab; label: string }[] = [
  { value: 'inventario', label: 'Inventario diario' },
  { value: 'merma', label: 'Merma' },
  { value: 'masa', label: 'Masa de pizza' },
  { value: 'bajas', label: 'Bajas' },
];

/** Las 4 hojas con sus pestañas. `onFlow` abre preparar / dar de baja desde la hoja. */
export function KitchenSheets({ onFlow }: { onFlow: (f: Flow) => void }) {
  const [tab, setTab] = useState<SheetTab>('inventario');
  return (
    <section>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cx(
              'shrink-0 rounded-xl border px-4 py-2 text-sm font-bold transition-all',
              tab === t.value ? 'border-ink-900 bg-ink-900 text-white shadow-sm' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400/50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'inventario' && <InventoryDaySheet />}
      {tab === 'merma' && <MermaSheet onFlow={onFlow} />}
      {tab === 'masa' && <MasaSheet onFlow={onFlow} />}
      {tab === 'bajas' && <BajasSheet onFlow={onFlow} />}
    </section>
  );
}

// ---------- Piezas con el estilo de la hoja de papel ----------

const TH = 'border border-ink-900 bg-[#d9d9d9] px-2 py-1.5 text-center text-[11px] font-extrabold tracking-wide text-ink-900 uppercase';
const TD = 'border border-ink-700/60 px-2 py-1.5 text-[13px] text-ink-900';
const SECTION = 'border border-ink-900 bg-[#8c8c8c] px-2 py-1 text-center text-[12px] font-extrabold tracking-wider text-white uppercase';

function Paper({ title, subtitle, nav, actions, note, children }: { title: string; subtitle: string; nav?: ReactNode; actions?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 px-4 py-3 print:hidden">
        <div className="flex items-center gap-2">{nav}</div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <button className="btn-secondary btn-sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </button>
        </div>
      </div>
      <div className="bg-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-block border-2 border-ink-900 px-4 py-1 text-sm font-extrabold tracking-[0.2em] text-ink-900">PIZZA DIANA</p>
            <h2 className="mt-2 text-lg font-extrabold tracking-wide text-ink-900 uppercase">{title}</h2>
            <p className="text-sm font-semibold text-ink-700">{subtitle}</p>
          </div>
          {note && <div className="max-w-56 border-2 border-ink-900 px-3 py-2 text-center text-[10px] leading-tight font-extrabold text-ink-900 uppercase">{note}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function DayNav({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const today = localDate();
  return (
    <>
      <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-32 text-center text-sm font-bold capitalize">{date === today ? 'Hoy' : shortDateDow(date)}</span>
      <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Día siguiente">
        <ChevronRight className="size-4" />
      </button>
    </>
  );
}

function WeekNav({ from, setDate }: { from: string; setDate: (d: string) => void }) {
  const today = localDate();
  return (
    <>
      <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, -7))} aria-label="Semana anterior">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-40 text-center text-sm font-bold">Semana del {shortDate(from)}</span>
      <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, 7))} disabled={weekEnd(from) >= today} aria-label="Semana siguiente">
        <ChevronRight className="size-4" />
      </button>
    </>
  );
}

/** Cantidad como en la hoja: «3 paq + 385 g» o «1,2 kg». Vacío si no hay dato. */
function qtyText(m: number | null, l: { unit: Unit; base_unit: BaseUnit; pack_size_m: number; pack_label: string }) {
  if (m === null) return '';
  if (l.pack_size_m > 0) return formatPacks(m, l.pack_size_m, l.pack_label === 'paquete' ? 'paq' : l.pack_label, l.unit) ?? '';
  return formatQty(m, niceUnit(m, l.base_unit));
}

// ---------- 1. Inventario diario ----------

type Edit = { location: Location; kind: 'apertura' | 'cierre' } | null;
type Cell = { packs: string; loose: string };

function toCell(m: number, l: InventorySheetLine): Cell {
  const u = smallUnit(l.base_unit);
  if (l.pack_size_m > 0) {
    const packs = Math.floor(m / l.pack_size_m);
    const rest = m - packs * l.pack_size_m;
    return { packs: packs ? String(packs) : '', loose: rest ? String(fromMilli(rest, u)) : packs ? '' : '0' };
  }
  return { packs: '', loose: String(fromMilli(m, u)) };
}

function cellMilli(c: Cell | undefined, l: InventorySheetLine): number | null {
  if (!c) return null;
  const hasP = l.pack_size_m > 0 && validQty(c.packs, true);
  const hasL = validQty(c.loose, true);
  if (!hasP && !hasL) return null;
  return (hasP ? Math.round(parseQty(c.packs) * l.pack_size_m) : 0) + (hasL ? toMilli(parseQty(c.loose), smallUnit(l.base_unit)) : 0);
}

function InventoryDaySheet() {
  const { can, bump } = useApp();
  const toast = useToast();
  const today = localDate();
  const [date, setDate] = useState(today);
  const sheet = useApi<InventorySheet>(`/sheets/inventory?date=${date}`, [date]);
  const [edit, setEdit] = useState<Edit>(null);
  const [cells, setCells] = useState<Record<number, Cell>>({});
  const [busy, setBusy] = useState(false);
  const canFill = can('kitchen.use') && date === today;
  const admin = can('kitchen.manage');

  const startEdit = (location: Location, kind: 'apertura' | 'cierre', lines: InventorySheetLine[], from?: 'prev') => {
    const next: Record<number, Cell> = {};
    for (const l of lines) {
      const m = from === 'prev' ? l.prev_close_m : kind === 'apertura' ? l.open_m : l.close_m;
      if (m !== null) next[l.item_id] = toCell(m, l);
    }
    setCells(next);
    setEdit({ location, kind });
  };

  const save = async (lines: InventorySheetLine[]) => {
    if (!edit) return;
    const filled = lines.map((l) => ({ l, m: cellMilli(cells[l.item_id], l) })).filter((x) => x.m !== null);
    if (!filled.length) {
      toast.error('No hay nada escrito', 'Escribe al menos un producto.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/counts', {
        location: edit.location,
        kind: edit.kind,
        lines: filled.map(({ l, m }) => ({ item_id: l.item_id, qty: m! / 1000, unit: smallUnit(l.base_unit) })),
      });
      toast.success(
        edit.kind === 'apertura' ? 'Inicio guardado' : 'Fin guardado',
        admin ? `${edit.location}: el inventario quedó ajustado.` : `${edit.location}: el administrador revisará las diferencias.`,
      );
      setEdit(null);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const setCell = (id: number, k: keyof Cell, v: string) =>
    setCells((s) => ({ ...s, [id]: { ...(s[id] ?? { packs: '', loose: '' }), [k]: v.replace(/[^0-9.,]/g, '') } }));

  return (
    <Paper
      title="Inventario diario"
      subtitle={date === today ? `Hoy, ${shortDateDow(date)}` : shortDateDow(date)}
      nav={
        <DayNav
          date={date}
          setDate={(d) => {
            setEdit(null);
            setDate(d);
          }}
        />
      }
    >
      {sheet.error ? (
        <ErrorBox message={sheet.error} onRetry={sheet.reload} />
      ) : !sheet.data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          {canFill && !edit && (
            <p className="text-xs text-ink-500 print:hidden">
              Al abrir: toca <b>Llenar inicio</b> en cada nevera. Al cerrar: <b>Llenar fin</b>. La entrada y el consumo se calculan solos.
            </p>
          )}
          {sheet.data.sections.map((s) => {
            const editing = edit?.location === s.location ? edit.kind : null;
            const hasPrev = s.lines.some((l) => l.prev_close_m !== null);
            const status = (c: typeof s.apertura, label: string) =>
              c ? `${label}: ${c.counted_by_name} ${formatTime(c.counted_at)}${c.status === 'pendiente' ? ' (por revisar)' : ''}` : `${label}: sin contar`;
            return (
              <div key={s.location}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 print:hidden">
                  <p className="text-xs text-ink-500">
                    {status(s.apertura, 'Inicio')} · {status(s.cierre, 'Fin')}
                  </p>
                  {canFill &&
                    (editing ? (
                      <div className="flex flex-wrap gap-2">
                        {editing === 'apertura' && hasPrev && (
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(s.location, 'apertura', s.lines, 'prev')}>
                            <Copy className="size-4" /> Copiar el fin de ayer
                          </button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => setEdit(null)} disabled={busy}>
                          Cancelar
                        </button>
                        <button className="btn-primary btn-sm" onClick={() => void save(s.lines)} disabled={busy}>
                          {busy && <Loader2 className="size-4 animate-spin" />} Guardar {editing === 'apertura' ? 'inicio' : 'fin'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button className={s.apertura ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} onClick={() => startEdit(s.location, 'apertura', s.lines)}>
                          {s.apertura ? <Pencil className="size-3.5" /> : null} {s.apertura ? 'Corregir inicio' : 'Llenar inicio'}
                        </button>
                        <button className={s.apertura && !s.cierre ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => startEdit(s.location, 'cierre', s.lines)}>
                          {s.cierre ? <Pencil className="size-3.5" /> : null} {s.cierre ? 'Corregir fin' : 'Llenar fin'}
                        </button>
                      </div>
                    ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead>
                      <tr>
                        <th className={cx(TH, 'w-[30%] text-left')}>Producto</th>
                        <th className={TH}>Inicio · paquete + uso</th>
                        <th className={TH}>Entrada</th>
                        <th className={TH}>Fin · paquete + uso</th>
                        <th className={TH}>Consumo</th>
                        {admin && <th className={cx(TH, 'print:hidden')}>Vendido (caja)</th>}
                      </tr>
                      <tr>
                        <td className={SECTION} colSpan={admin ? 6 : 5}>
                          {s.location}
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lines.map((l) => {
                        const editCell = (kind: 'apertura' | 'cierre') =>
                          editing === kind ? (
                            <div className="flex items-center justify-center gap-1">
                              {l.pack_size_m > 0 && (
                                <>
                                  <input
                                    className="w-11 rounded-md border border-ink-400 px-1 py-1 text-center text-sm tabular-nums focus:border-brand-500 focus:outline-none"
                                    inputMode="decimal"
                                    value={cells[l.item_id]?.packs ?? ''}
                                    onChange={(e) => setCell(l.item_id, 'packs', e.target.value)}
                                    placeholder="0"
                                    aria-label={`${l.name}: paquetes`}
                                  />
                                  <span className="text-[11px] text-ink-500">paq +</span>
                                </>
                              )}
                              <input
                                className="w-16 rounded-md border border-ink-400 px-1 py-1 text-center text-sm tabular-nums focus:border-brand-500 focus:outline-none"
                                inputMode="decimal"
                                value={cells[l.item_id]?.loose ?? ''}
                                onChange={(e) => setCell(l.item_id, 'loose', e.target.value)}
                                placeholder="0"
                                aria-label={`${l.name}: ${UNIT_SHORT[smallUnit(l.base_unit)]}`}
                              />
                              <span className="text-[11px] text-ink-500">{UNIT_SHORT[smallUnit(l.base_unit)]}</span>
                            </div>
                          ) : (
                            qtyText(kind === 'apertura' ? l.open_m : l.close_m, l)
                          );
                        const over = admin && l.consumption_m !== null && l.sales_m !== null && l.sales_m > 0 && l.consumption_m > l.sales_m * 1.05;
                        return (
                          <tr key={l.item_id} className="odd:bg-white even:bg-cream-50/60">
                            <td className={cx(TD, 'font-semibold')}>{l.name}</td>
                            <td className={cx(TD, 'text-center tabular-nums', editing === 'apertura' && 'bg-amber-50 p-1')}>{editCell('apertura')}</td>
                            <td className={cx(TD, 'text-center tabular-nums')}>{l.entries_m ? qtyText(l.entries_m, l) : ''}</td>
                            <td className={cx(TD, 'text-center tabular-nums', editing === 'cierre' && 'bg-amber-50 p-1')}>{editCell('cierre')}</td>
                            <td className={cx(TD, 'text-center font-bold tabular-nums', over && 'text-brand-700')}>
                              {l.consumption_m === null ? '' : formatQty(l.consumption_m, niceUnit(Math.abs(l.consumption_m), l.base_unit))}
                            </td>
                            {admin && (
                              <td className={cx(TD, 'text-center tabular-nums print:hidden')}>{l.sales_m ? formatQty(l.sales_m, niceUnit(l.sales_m, l.base_unit)) : ''}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-ink-500">
            Consumo = inicio + entrada + lo preparado − fin. {admin && 'En rojo: se gastó más de 5 % por encima de lo vendido según las recetas.'}
          </p>
        </div>
      )}
    </Paper>
  );
}

// ---------- Datos de la semana para merma y masa ----------

function useWeekProductions(date: string) {
  const from = weekStart(date);
  const to = weekEnd(date);
  const prods = useApi<Production[]>(`/productions?from=${from}&to=${to}&limit=500`, [from, to]);
  const preps = useApi<Preparation[]>('/preparations');
  const days = daysBetween(from, to);
  return { from, to, days, prods, preps };
}

const dayHead = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(day)}/${Number(m)}`;
};

// ---------- 2. Merma ----------

function MermaSheet({ onFlow }: { onFlow: (f: Flow) => void }) {
  const { can } = useApp();
  const today = localDate();
  const [date, setDate] = useState(today);
  const { from, days, prods, preps } = useWeekProductions(date);

  const blocks = useMemo(() => {
    const list = (preps.data ?? []).filter((p) => p.active && p.mode === 'transformacion');
    return list.map((p) => {
      const byDay = new Map<string, { input: number; util: number; inutil: number; output: number }>();
      for (const pr of prods.data ?? []) {
        if (pr.preparation_id !== p.id || pr.status !== 'activa') continue;
        const g = byDay.get(pr.local_date) ?? { input: 0, util: 0, inutil: 0, output: 0 };
        g.input += pr.inputs[0]?.qty_m ?? 0;
        g.util += pr.merma_util_m;
        g.inutil += pr.merma_inutil_m;
        g.output += pr.output_m;
        byDay.set(pr.local_date, g);
      }
      return { p, byDay };
    });
  }, [preps.data, prods.data]);

  // En la hoja se pesa al gramo: sin decimales de gramo.
  const g = (m: number, base: BaseUnit) => {
    const r = base === 'unidad' ? m : Math.round(m / 1000) * 1000;
    return formatQty(r, niceUnit(r, base));
  };

  return (
    <Paper title="Hoja de merma" subtitle={`Semana del ${shortDate(from)} al ${shortDate(addDays(from, 6))}`} nav={<WeekNav from={from} setDate={setDate} />}>
      {prods.error ? (
        <ErrorBox message={prods.error} onRetry={prods.reload} />
      ) : !prods.data || !preps.data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          {blocks.map(({ p, byDay }) => {
            const base = p.inputs[0]?.base_unit ?? 'g';
            const rows: [string, (x: { input: number; util: number; inutil: number; output: number }) => string][] = [
              ['Peso inicial', (x) => g(x.input, base)],
              ['Merma útil', (x) => g(x.util, base)],
              ['Merma inútil', (x) => g(x.inutil, base)],
              ['Peso final', (x) => g(x.output, p.output_base)],
              ['Rendimiento', (x) => (x.input ? `${formatNumber(Math.round((x.output / x.input) * 1000) / 10)} %` : '')],
            ];
            return (
              <div key={p.id} className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed border-collapse">
                  <thead>
                    <tr>
                      <td className={SECTION} colSpan={8}>
                        {p.inputs[0]?.item_name} → {p.name} · estándar {formatNumber(p.std_yield_pct ?? 0)} %
                      </td>
                    </tr>
                    <tr>
                      <th className={cx(TH, 'w-32 text-left')}>Fecha</th>
                      {days.map((d) => (
                        <th key={d} className={cx(TH, d === today && 'bg-crust-300')}>
                          {dayHead(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, fn]) => (
                      <tr key={label}>
                        <td className={cx(TD, 'font-bold uppercase text-[11px]')}>{label}</td>
                        {days.map((d) => {
                          const x = byDay.get(d);
                          const low = !!(label === 'Rendimiento' && x && p.std_yield_pct && x.input && (x.output / x.input) * 100 < p.std_yield_pct * 0.9);
                          return (
                            <td key={d} className={cx(TD, 'text-center tabular-nums', low && 'font-bold text-brand-700')}>
                              {x ? (
                                fn(x)
                              ) : label === 'Peso inicial' && d === today && can('kitchen.use') ? (
                                <button className="text-xs font-bold text-brand-700 underline print:hidden" onClick={() => onFlow({ kind: 'preparar', prepId: p.id })}>
                                  Registrar
                                </button>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {blocks.length === 0 && <p className="text-sm text-ink-500">No hay preparaciones con merma configuradas.</p>}
          <p className="text-[11px] text-ink-500">Merma inútil = peso inicial − peso final − merma útil. Cuando se prepara algo, la hoja se llena sola.</p>
        </div>
      )}
    </Paper>
  );
}

// ---------- 3. Masa de pizza ----------

function MasaSheet({ onFlow }: { onFlow: (f: Flow) => void }) {
  const { can } = useApp();
  const today = localDate();
  const [date, setDate] = useState(today);
  const { from, days, prods, preps } = useWeekProductions(date);
  const batches = (preps.data ?? []).filter((p) => p.active && p.mode === 'lote');

  return (
    <Paper
      title="Masa de pizza"
      subtitle={`Semana del ${shortDate(from)} al ${shortDate(addDays(from, 6))}`}
      nav={<WeekNav from={from} setDate={setDate} />}
      actions={
        can('kitchen.use') &&
        batches[0] && (
          <button className="btn-primary btn-sm" onClick={() => onFlow({ kind: 'preparar', prepId: batches[0].id })}>
            <Plus className="size-4" /> Registrar lote
          </button>
        )
      }
    >
      {prods.error ? (
        <ErrorBox message={prods.error} onRetry={prods.reload} />
      ) : !prods.data || !preps.data ? (
        <Loading />
      ) : batches.length === 0 ? (
        <p className="text-sm text-ink-500">No hay recetas por lote configuradas.</p>
      ) : (
        <div className="space-y-6">
          {batches.map((p) => {
            const used = new Map<string, Map<number, number>>();
            const out = new Map<string, number>();
            const expected = new Map<string, number>();
            for (const pr of prods.data!) {
              if (pr.preparation_id !== p.id || pr.status !== 'activa') continue;
              const m = used.get(pr.local_date) ?? new Map<number, number>();
              for (const i of pr.inputs) m.set(i.item_id, (m.get(i.item_id) ?? 0) + i.qty_m);
              used.set(pr.local_date, m);
              out.set(pr.local_date, (out.get(pr.local_date) ?? 0) + pr.output_m);
              expected.set(pr.local_date, (expected.get(pr.local_date) ?? 0) + pr.expected_m);
            }
            // La UM queda fija por fila (g o ml): en el papel se confundían con «kg».
            const um = (b: BaseUnit) => UNIT_SHORT[smallUnit(b)].toUpperCase();
            return (
              <div key={p.id} className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr>
                      <td className={SECTION} colSpan={3 + days.length}>
                        {p.name}
                      </td>
                    </tr>
                    <tr>
                      <th className={cx(TH, 'text-left')}>Fecha</th>
                      <th className={TH} colSpan={2}>
                        Receta estándar
                      </th>
                      {days.map((d) => (
                        <th key={d} className={cx(TH, d === today && 'bg-crust-300')}>
                          {dayHead(d)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={cx(TH, 'text-left')}>Ingrediente</th>
                      <th className={TH}>Cantidad</th>
                      <th className={TH}>UM</th>
                      {days.map((d) => (
                        <th key={d} className={TH}>
                          Cantidad
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.inputs.map((i) => (
                      <tr key={i.item_id}>
                        <td className={cx(TD, 'font-bold uppercase text-[11px]')}>{i.item_name}</td>
                        <td className={cx(TD, 'text-center tabular-nums')}>{formatNumber(fromMilli(i.qty_m, smallUnit(i.base_unit)))}</td>
                        <td className={cx(TD, 'text-center text-[11px] font-bold')}>{um(i.base_unit)}</td>
                        {days.map((d) => {
                          const v = used.get(d)?.get(i.item_id);
                          return (
                            <td key={d} className={cx(TD, 'text-center tabular-nums')}>
                              {v ? `${formatNumber(fromMilli(v, smallUnit(i.base_unit)))} ${UNIT_SHORT[smallUnit(i.base_unit)]}` : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td className={cx(TD, 'font-extrabold uppercase text-[11px]')}>Rendimiento final</td>
                      <td className={cx(TD, 'text-center font-bold tabular-nums')}>{formatNumber(fromMilli(p.std_output_m, smallUnit(p.output_base)))}</td>
                      <td className={cx(TD, 'text-center text-[11px] font-bold')}>{um(p.output_base)}</td>
                      {days.map((d) => {
                        const o = out.get(d);
                        const e = expected.get(d);
                        const eff = o && e ? Math.round((o / e) * 1000) / 10 : null;
                        return (
                          <td key={d} className={cx(TD, 'text-center font-bold tabular-nums')}>
                            {o ? (
                              <>
                                {formatQty(o, niceUnit(o, p.output_base))}
                                {eff !== null && <span className={cx('block text-[10px]', eff < 90 ? 'text-brand-700' : 'text-emerald-700')}>{formatNumber(eff)} %</span>}
                              </>
                            ) : (
                              ''
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
                {p.instructions && <p className="mt-1 text-[11px] text-ink-500">{p.instructions}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Paper>
  );
}

// ---------- 4. Formato de bajas ----------

function BajasSheet({ onFlow }: { onFlow: (f: Flow) => void }) {
  const today = localDate();
  const [date, setDate] = useState(today);
  const from = weekStart(date);
  const to = weekEnd(date);
  const wastes = useApi<Waste[]>(`/wastes?from=${from}&to=${to}&limit=500`, [from, to]);
  const rows = [...(wastes.data ?? [])].sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  const empty = Math.max(0, 12 - rows.length);

  return (
    <Paper
      title="Formato de bajas · Cocina"
      subtitle={`Semana del ${shortDate(from)} al ${shortDate(to)}`}
      nav={<WeekNav from={from} setDate={setDate} />}
      note="Nota: toda baja entregada debe estar autorizada por el administrador con evidencia de fotografía"
      actions={
        <button className="btn-primary btn-sm" onClick={() => onFlow({ kind: 'baja' })}>
          <Plus className="size-4" /> Registrar baja
        </button>
      }
    >
      {wastes.error ? (
        <ErrorBox message={wastes.error} onRetry={wastes.reload} />
      ) : !wastes.data ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Producto</th>
                <th className={TH}>Cantidad</th>
                <th className={TH}>Motivo de la baja</th>
                <th className={TH}>Responsable</th>
                <th className={TH}>Autorización</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className={cx(TD, 'text-center tabular-nums')}>{dayHead(w.local_date)}</td>
                  <td className={cx(TD, 'font-semibold uppercase')}>{w.item_name}</td>
                  <td className={cx(TD, 'text-center tabular-nums')}>{formatQty(w.qty_m, niceUnit(w.qty_m, baseOf(w.unit)))}</td>
                  <td className={TD}>
                    {WASTE_REASON_LABELS[w.reason].toUpperCase()}
                    {w.note && <span className="block text-[11px] text-ink-500">{w.note}</span>}
                  </td>
                  <td className={cx(TD, 'uppercase')}>{w.reported_by_name}</td>
                  <td className={cx(TD, 'text-center text-[12px] font-bold')}>
                    <span className={w.status === 'aprobada' ? 'text-emerald-700' : w.status === 'rechazada' ? 'text-brand-700' : 'text-amber-700'}>
                      {w.status === 'aprobada' ? `Autorizada · ${w.reviewed_by_name ?? ''}` : w.status === 'rechazada' ? 'Rechazada' : 'Por autorizar'}
                    </span>
                    {w.has_photo && <Camera className="ml-1 inline size-3.5 text-ink-500" aria-label="Con foto" />}
                  </td>
                </tr>
              ))}
              {/* Renglones vacíos, como en el formato impreso. */}
              {Array.from({ length: empty }, (_, i) => (
                <tr key={`v${i}`}>
                  {Array.from({ length: 6 }, (__, j) => (
                    <td key={j} className={cx(TD, 'h-8')} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Paper>
  );
}
