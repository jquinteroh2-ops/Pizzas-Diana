// Las hojas de Pizza Diana, iguales a las de papel que usaba la cocina:
// inventario diario (inicio | entrada | fin | consumo), merma, masa de pizza y bajas.
// Se llenan en la misma tabla y se pueden imprimir con el mismo formato.
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Printer, Pencil, Copy, Loader2, Camera } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { InventorySheet, InventorySheetLine, Item, PeriodReport, Preparation, Production, Waste } from '../../lib/types';
import { useToast } from '../toast';
import { Loading, ErrorBox, Modal, cx } from '../ui';
import { CountReview, RejectWaste } from './Review';
import { WastePhoto } from './ReportFlows';
import { formatNumber, formatQty, fromMilli, niceUnit, toMilli, UNIT_SHORT, baseOf, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { formatPacks, WASTE_REASON_LABELS, type Location, type WasteReason } from '../../../shared/kitchen.ts';
import { addDays, daysBetween, formatTime, localDate, shortDate, shortDateDow, weekEnd, weekStart } from '../../../shared/dates.ts';
import type { Flow } from './FlowHost';
import { compressPhoto, parseQty, smallUnit, validQty } from './helpers';
import { parseSheetText } from '../sheet/qty';

// ---------- Piezas con el estilo de la hoja de papel ----------

export const TH = 'border border-ink-900 bg-[#d9d9d9] px-2 py-1.5 text-center text-[11px] font-extrabold tracking-wide text-ink-900 uppercase';
export const TD = 'border border-ink-700/60 px-2 py-1.5 text-[13px] text-ink-900';
export const SECTION = 'border border-ink-900 bg-[#8c8c8c] px-2 py-1 text-center text-[12px] font-extrabold tracking-wider text-white uppercase';

export function Paper({ title, subtitle, nav, actions, note, children }: { title: string; subtitle: string; nav?: ReactNode; actions?: ReactNode; note?: ReactNode; children: ReactNode }) {
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

/** Tabla ancha como la hoja de papel: en el celular se desliza de lado, y se avisa. */
export function Wide({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-right text-[11px] font-semibold text-ink-500 md:hidden print:hidden">Desliza la tabla →</p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>
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

export function WeekNav({ from, setDate }: { from: string; setDate: (d: string) => void }) {
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

export function InventoryDaySheet() {
  const { can, bump } = useApp();
  const toast = useToast();
  const today = localDate();
  const [date, setDate] = useState(today);
  const sheet = useApi<InventorySheet>(`/sheets/inventory?date=${date}`, [date]);
  const [edit, setEdit] = useState<Edit>(null);
  const [review, setReview] = useState<number | null>(null);
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
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                    {status(s.apertura, 'Inicio')} · {status(s.cierre, 'Fin')}
                    {/* El administrador revisa y aplica la diferencia desde la misma hoja. */}
                    {admin &&
                      ([s.apertura, s.cierre] as const).map(
                        (c, i) =>
                          c?.status === 'pendiente' && (
                            <button key={i} className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white" onClick={() => setReview(c.id)}>
                              Revisar {i === 0 ? 'inicio' : 'fin'}
                            </button>
                          ),
                      )}
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
                <Wide>
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
                </Wide>
              </div>
            );
          })}
          <p className="text-[11px] text-ink-500">
            Consumo = inicio + entrada + lo preparado − fin. {admin && 'En rojo: se gastó más de 5 % por encima de lo vendido según las recetas.'}
          </p>
        </div>
      )}
      {review && <CountReview id={review} onClose={() => setReview(null)} />}
    </Paper>
  );
}

// ---------- Datos de la semana para merma y masa ----------

export function useWeekProductions(date: string) {
  const from = weekStart(date);
  const to = weekEnd(date);
  const prods = useApi<Production[]>(`/productions?from=${from}&to=${to}&limit=500`, [from, to]);
  const preps = useApi<Preparation[]>('/preparations');
  const days = daysBetween(from, to);
  return { from, to, days, prods, preps };
}

export const dayHead = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(day)}/${Number(m)}`;
};

// La casilla para escribir en la hoja (se escribe como a mano: «1000», «1,2 kg»).
function SheetInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      className="h-8 w-full bg-transparent px-1 text-center text-[14px] font-semibold text-[#1f3f8f] tabular-nums outline-none focus:bg-amber-50 focus:ring-2 focus:ring-ink-900 focus:ring-inset"
      value={value}
      aria-label={label}
      autoComplete="off"
      inputMode="decimal"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Lo escrito en una casilla de merma o masa, en milésimas de la unidad base (null si está vacía o no se entiende). */
function sheetMilli(text: string, base: BaseUnit): number | null {
  const m = parseSheetText(text, { unit: smallUnit(base), base_unit: base, pack_size_m: 0, pack_label: '' });
  return m === null || Number.isNaN(m) ? null : m;
}

// ---------- 2. Merma ----------

type MermaDraft = { ini: string; util: string; fin: string };

export function MermaSheet(_props: { onFlow?: (f: Flow) => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const today = localDate();
  const [date, setDate] = useState(today);
  const { from, days, prods, preps } = useWeekProductions(date);
  const [draft, setDraft] = useState<Record<number, MermaDraft>>({});
  const [more, setMore] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const canWrite = can('kitchen.use');

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
    return formatQty(r, smallUnit(base));
  };

  const save = async (p: Preparation) => {
    const d = draft[p.id];
    const base = p.inputs[0]?.base_unit ?? 'g';
    const ini = d ? sheetMilli(d.ini, base) : null;
    const fin = d ? sheetMilli(d.fin, p.output_base) : null;
    const util = d && d.util.trim() ? sheetMilli(d.util, base) : 0;
    if (!ini || !fin || util === null) {
      toast.error('Falta llenar', 'Escriba el peso inicial y el peso final (y la merma útil si la hubo).');
      return;
    }
    setBusy(p.id);
    try {
      await api.post('/productions', {
        preparation_id: p.id,
        input_qty: ini / 1000,
        input_unit: smallUnit(base),
        output_qty: fin / 1000,
        output_unit: smallUnit(p.output_base),
        merma_util_qty: util / 1000,
        merma_util_unit: smallUnit(base),
      });
      toast.success('Anotado en la hoja de merma', p.name);
      setDraft((x) => ({ ...x, [p.id]: { ini: '', util: '', fin: '' } }));
      setMore((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
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
            const d = draft[p.id] ?? { ini: '', util: '', fin: '' };
            const set = (k: keyof MermaDraft) => (v: string) => setDraft((x) => ({ ...x, [p.id]: { ...d, [k]: v } }));
            const todayData = byDay.get(today);
            const writing = canWrite && date <= today && (!todayData || more.has(p.id));
            const ini = sheetMilli(d.ini, base);
            const fin = sheetMilli(d.fin, p.output_base);
            const util = d.util.trim() ? sheetMilli(d.util, base) : 0;
            const inutil = ini && fin !== null && util !== null ? Math.max(0, ini - fin - util) : null;
            const um = UNIT_SHORT[smallUnit(base)].toUpperCase();
            type Row = { key: string; label: string; show: (x: { input: number; util: number; inutil: number; output: number }) => string; input?: keyof MermaDraft; calc?: string };
            const rows: Row[] = [
              { key: 'ini', label: 'Peso inicial', show: (x) => g(x.input, base), input: 'ini' },
              { key: 'util', label: 'Merma útil', show: (x) => g(x.util, base), input: 'util' },
              { key: 'inutil', label: 'Merma inútil', show: (x) => g(x.inutil, base), calc: inutil === null ? '' : g(inutil, base) },
              { key: 'fin', label: 'Peso final', show: (x) => g(x.output, p.output_base), input: 'fin' },
              { key: 'rend', label: 'Rendimiento', show: (x) => (x.input ? `${formatNumber(Math.round((x.output / x.input) * 1000) / 10)} %` : '') },
            ];
            return (
              <Wide key={p.id}>
                <table className="w-full min-w-[760px] table-fixed border-collapse">
                  <thead>
                    <tr>
                      <td className={SECTION} colSpan={9}>
                        {p.inputs[0]?.item_name} → {p.name} · estándar {formatNumber(p.std_yield_pct ?? 0)} %
                      </td>
                    </tr>
                    <tr>
                      <th className={cx(TH, 'w-32 text-left')}>Fecha</th>
                      <th className={cx(TH, 'w-12')}>UM</th>
                      {days.map((day) => (
                        <th key={day} className={cx(TH, day === today && 'bg-crust-300')}>
                          {dayHead(day)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className={cx(TD, 'text-[11px] font-bold uppercase')}>{r.label}</td>
                        <td className={cx(TD, 'text-center text-[11px] font-bold')}>{r.key === 'rend' ? '%' : r.key === 'fin' ? UNIT_SHORT[smallUnit(p.output_base)].toUpperCase() : um}</td>
                        {days.map((day) => {
                          const x = byDay.get(day);
                          if (day === today && writing) {
                            return (
                              <td key={day} className={cx(TD, 'bg-amber-50/40 p-0 text-center')}>
                                {r.input ? (
                                  <SheetInput value={d[r.input]} onChange={set(r.input)} label={`${p.name}: ${r.label.toLowerCase()}`} />
                                ) : r.key === 'rend' ? (
                                  <button
                                    className="m-1 rounded bg-ink-900 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40 print:hidden"
                                    disabled={busy === p.id || !ini || !fin}
                                    onClick={() => void save(p)}
                                  >
                                    {busy === p.id ? <Loader2 className="mx-auto size-3 animate-spin" /> : 'Guardar'}
                                  </button>
                                ) : (
                                  <span className="text-[13px] text-ink-500 tabular-nums">{r.calc}</span>
                                )}
                              </td>
                            );
                          }
                          const low = !!(r.key === 'rend' && x && p.std_yield_pct && x.input && (x.output / x.input) * 100 < p.std_yield_pct * 0.9);
                          return (
                            <td key={day} className={cx(TD, 'text-center font-semibold text-[#1f3f8f] tabular-nums', low && 'text-brand-700')}>
                              {x ? r.show(x) : ''}
                              {r.key === 'rend' && day === today && x && canWrite && (
                                <button className="block w-full text-[10px] font-bold text-ink-500 underline print:hidden" onClick={() => setMore((s) => new Set(s).add(p.id))}>
                                  + anotar otra
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Wide>
            );
          })}
          {blocks.length === 0 && <p className="text-sm text-ink-500">No hay preparaciones con merma configuradas.</p>}
          <p className="text-[11px] text-ink-500">
            Se llena la columna de hoy: peso inicial, merma útil (lo que se aprovecha) y peso final. La merma inútil = peso inicial − merma útil − peso final. Al guardar, el sistema
            descuenta lo que entró y suma lo que salió.
          </p>
        </div>
      )}
    </Paper>
  );
}

// ---------- 3. Masa de pizza ----------

export function MasaSheet(_props: { onFlow?: (f: Flow) => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const today = localDate();
  const [date, setDate] = useState(today);
  const { from, days, prods, preps } = useWeekProductions(date);
  const batches = (preps.data ?? []).filter((p) => p.active && p.mode === 'lote');
  const [draft, setDraft] = useState<Record<number, Record<string, string>>>({});
  const [more, setMore] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const canWrite = can('kitchen.use');

  const save = async (p: Preparation) => {
    const d = draft[p.id] ?? {};
    const inputs = p.inputs.map((i) => ({ i, m: d[i.item_id] ? sheetMilli(d[i.item_id], i.base_unit) : 0 }));
    const out = d.out ? sheetMilli(d.out, p.output_base) : null;
    if (inputs.some((x) => x.m === null) || !inputs[0].m || !out) {
      toast.error('Falta llenar', `Escriba al menos ${p.inputs[0]?.item_name.toLowerCase()} y el rendimiento final.`);
      return;
    }
    setBusy(p.id);
    try {
      await api.post('/productions', {
        preparation_id: p.id,
        inputs: inputs.filter((x) => x.m).map((x) => ({ item_id: x.i.item_id, qty: x.m! / 1000, unit: smallUnit(x.i.base_unit) })),
        output_qty: out / 1000,
        output_unit: smallUnit(p.output_base),
      });
      toast.success('Anotado en la hoja de masa', p.name);
      setDraft((x) => ({ ...x, [p.id]: {} }));
      setMore((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Paper title="Masa de pizza" subtitle={`Semana del ${shortDate(from)} al ${shortDate(addDays(from, 6))}`} nav={<WeekNav from={from} setDate={setDate} />}>
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
            const d = draft[p.id] ?? {};
            const set = (k: string) => (v: string) => setDraft((x) => ({ ...x, [p.id]: { ...d, [k]: v } }));
            const writing = canWrite && (!out.has(today) || more.has(p.id));
            // La UM queda fija por fila (g o ml): en el papel se confundían con «kg».
            const um = (b: BaseUnit) => UNIT_SHORT[smallUnit(b)].toUpperCase();
            const fmt = (m: number, b: BaseUnit) => formatNumber(fromMilli(b === 'unidad' ? m : Math.round(m / 1000) * 1000, smallUnit(b)));
            return (
              <Wide key={p.id}>
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
                      {days.map((day) => (
                        <th key={day} className={cx(TH, day === today && 'bg-crust-300')}>
                          {dayHead(day)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={cx(TH, 'text-left')}>Ingrediente</th>
                      <th className={TH}>Cantidad</th>
                      <th className={TH}>UM</th>
                      {days.map((day) => (
                        <th key={day} className={TH}>
                          Cantidad
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.inputs.map((i) => (
                      <tr key={i.item_id}>
                        <td className={cx(TD, 'text-[11px] font-bold uppercase')}>{i.item_name}</td>
                        <td className={cx(TD, 'text-center tabular-nums')}>{fmt(i.qty_m, i.base_unit)}</td>
                        <td className={cx(TD, 'text-center text-[11px] font-bold')}>{um(i.base_unit)}</td>
                        {days.map((day) => {
                          if (day === today && writing) {
                            return (
                              <td key={day} className={cx(TD, 'bg-amber-50/40 p-0')}>
                                <SheetInput value={d[i.item_id] ?? ''} onChange={set(String(i.item_id))} label={`${p.name}: ${i.item_name}`} />
                              </td>
                            );
                          }
                          const v = used.get(day)?.get(i.item_id);
                          return (
                            <td key={day} className={cx(TD, 'text-center font-semibold text-[#1f3f8f] tabular-nums')}>
                              {v ? fmt(v, i.base_unit) : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td className={cx(TD, 'text-[11px] font-extrabold uppercase')}>Rendimiento final</td>
                      <td className={cx(TD, 'text-center font-bold tabular-nums')}>{fmt(p.std_output_m, p.output_base)}</td>
                      <td className={cx(TD, 'text-center text-[11px] font-bold')}>{um(p.output_base)}</td>
                      {days.map((day) => {
                        if (day === today && writing) {
                          return (
                            <td key={day} className={cx(TD, 'bg-amber-50/40 p-0')}>
                              <SheetInput value={d.out ?? ''} onChange={set('out')} label={`${p.name}: rendimiento final`} />
                            </td>
                          );
                        }
                        const o = out.get(day);
                        const e = expected.get(day);
                        const eff = o && e ? Math.round((o / e) * 1000) / 10 : null;
                        return (
                          <td key={day} className={cx(TD, 'text-center font-bold text-[#1f3f8f] tabular-nums')}>
                            {o ? (
                              <>
                                {fmt(o, p.output_base)}
                                {eff !== null && <span className={cx('block text-[10px]', eff < 90 ? 'text-brand-700' : 'text-emerald-700')}>{formatNumber(eff)} %</span>}
                              </>
                            ) : (
                              ''
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {canWrite && (
                      <tr className="print:hidden">
                        <td colSpan={3} className={cx(TD, 'text-[11px] text-ink-500')}>
                          Llene la columna de hoy y guarde.
                        </td>
                        {days.map((day) => (
                          <td key={day} className={cx(TD, 'p-1 text-center')}>
                            {day === today &&
                              (writing ? (
                                <button className="rounded bg-ink-900 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-40" disabled={busy === p.id} onClick={() => void save(p)}>
                                  {busy === p.id ? <Loader2 className="mx-auto size-3 animate-spin" /> : 'Guardar'}
                                </button>
                              ) : (
                                <button className="text-[10px] font-bold text-ink-500 underline" onClick={() => setMore((s) => new Set(s).add(p.id))}>
                                  + anotar otro lote
                                </button>
                              ))}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
                {p.instructions && <p className="mt-1 text-[11px] text-ink-500">{p.instructions}</p>}
              </Wide>
            );
          })}
        </div>
      )}
    </Paper>
  );
}

// ---------- 4. Formato de bajas ----------

// Motivo escrito como en la hoja («poca rotación y tiene moho») → el tipo de baja del sistema.
function reasonFrom(text: string): WasteReason {
  const t = text.toLowerCase();
  if (/venc/.test(t)) return 'vencido';
  if (/moho|dañ|dan[oa]|podr|malo|mala|rotaci/.test(t)) return 'danado';
  if (/quem|mal prepar|pas[oó] de/.test(t)) return 'mal_preparado';
  if (/cay|reg[oó]|derram|accident/.test(t)) return 'accidente';
  if (/devol|cliente/.test(t)) return 'devolucion';
  return 'otro';
}

/** El renglón en blanco de la hoja de bajas: se escribe ahí mismo y se guarda. */
function NewWasteRow({ onSaved }: { onSaved: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/kitchen/items');
  const [product, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const item = (items.data ?? []).find((i) => i.name.toLowerCase() === product.trim().toLowerCase());
  const input = 'h-9 w-full bg-transparent px-2 text-[13px] font-semibold text-[#1f3f8f] outline-none placeholder:font-normal placeholder:text-ink-400 focus:bg-amber-50 focus:ring-2 focus:ring-ink-900 focus:ring-inset';

  const save = async () => {
    if (!item) return toast.error('Producto', 'Escriba el producto tal como está en el inventario (aparece la lista al escribir).');
    const m = parseSheetText(amount, { unit: smallUnit(item.base_unit), base_unit: item.base_unit, pack_size_m: item.pack_size_m, pack_label: item.pack_label });
    if (!m || Number.isNaN(m)) return toast.error('Cantidad', 'Escriba la cantidad como en la hoja: 100 gramos, 2 und, 1 paq.');
    if (reason.trim().length < 3) return toast.error('Motivo', 'Escriba el motivo de la baja.');
    setBusy(true);
    try {
      await api.post('/wastes', { item_id: item.id, qty: m / 1000, unit: smallUnit(item.base_unit), reason: reasonFrom(reason), note: reason.trim(), photo });
      toast.success('Baja anotada', `${item.name}: queda para que el administrador la autorice.`);
      setProduct('');
      setAmount('');
      setReason('');
      setPhoto(null);
      onSaved();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="bg-amber-50/30 print:hidden">
      <td className={cx(TD, 'text-center tabular-nums')}>{dayHead(localDate())}</td>
      <td className={cx(TD, 'p-0')}>
        <input className={input} list="baja-productos" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="producto" aria-label="Producto" />
        <datalist id="baja-productos">
          {(items.data ?? []).map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
      </td>
      <td className={cx(TD, 'p-0')}>
        <input className={cx(input, 'text-center')} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={item ? `100 ${UNIT_SHORT[smallUnit(item.base_unit)]}` : 'cantidad'} aria-label="Cantidad" />
      </td>
      <td className={cx(TD, 'p-0')}>
        <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="motivo de la baja" aria-label="Motivo de la baja" />
      </td>
      <td className={cx(TD, 'uppercase')}>{user.name}</td>
      <td className={cx(TD, 'text-center')}>
        <span className="flex items-center justify-center gap-1">
          <label className={cx('inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold', photo ? 'border-emerald-600 text-emerald-700' : 'border-ink-400 text-ink-700')} title="Foto de evidencia">
            <Camera className="size-3.5" /> {photo ? 'Foto ✓' : 'Foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await compressPhoto(f).catch(() => null));
              }}
            />
          </label>
          <button className="rounded-md bg-ink-900 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-3 animate-spin" /> : 'Guardar'}
          </button>
        </span>
      </td>
    </tr>
  );
}


export function BajasSheet(_props: { onFlow?: (f: Flow) => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const admin = can('kitchen.manage');
  const today = localDate();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<number | null>(null);
  const [reject, setReject] = useState<Waste | null>(null);
  const [photo, setPhoto] = useState<Waste | null>(null);
  const from = weekStart(date);
  const to = weekEnd(date);
  const wastes = useApi<Waste[]>(`/wastes?from=${from}&to=${to}&limit=500`, [from, to]);

  // El administrador autoriza en la misma hoja, como firmaba el formato de papel.
  const approve = async (w: Waste) => {
    setBusy(w.id);
    try {
      await api.post(`/wastes/${w.id}/review`, { decision: 'aprobar' });
      toast.success('Baja autorizada', `${w.item_name}: quedó autorizada.`);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };
  const rows = [...(wastes.data ?? [])].sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  const empty = Math.max(0, 12 - rows.length);

  return (
    <Paper
      title="Formato de bajas · Cocina"
      subtitle={`Semana del ${shortDate(from)} al ${shortDate(to)}`}
      nav={<WeekNav from={from} setDate={setDate} />}
      note="Nota: toda baja entregada debe estar autorizada por el administrador con evidencia de fotografía"
    >
      {wastes.error ? (
        <ErrorBox message={wastes.error} onRetry={wastes.reload} />
      ) : !wastes.data ? (
        <Loading />
      ) : (
        <Wide>
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
                    {w.status === 'pendiente' && admin ? (
                      <span className="flex items-center justify-center gap-1 print:hidden">
                        <button className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50" disabled={busy === w.id} onClick={() => void approve(w)}>
                          {busy === w.id ? <Loader2 className="size-3 animate-spin" /> : 'Aprobar'}
                        </button>
                        <button className="rounded-md border border-ink-400 px-2 py-1 text-[11px] font-bold text-ink-700" onClick={() => setReject(w)}>
                          Rechazar
                        </button>
                      </span>
                    ) : (
                      <span className={w.status === 'aprobada' ? 'text-emerald-700' : w.status === 'rechazada' ? 'text-brand-700' : 'text-amber-700'}>
                        {w.status === 'aprobada' ? `Autorizada · ${w.reviewed_by_name ?? ''}` : w.status === 'rechazada' ? 'Rechazada' : 'Por autorizar'}
                      </span>
                    )}
                    {w.has_photo && (
                      <button className="ml-1 inline-flex align-middle text-ink-500 hover:text-brand-700 print:hidden" onClick={() => setPhoto(w)} aria-label="Ver la foto">
                        <Camera className="size-4" />
                      </button>
                    )}
                    {w.status === 'rechazada' && w.review_note && <span className="block text-[10px] font-normal text-ink-500">{w.review_note}</span>}
                  </td>
                </tr>
              ))}
              {/* El renglón para escribir una baja nueva (solo en la semana de hoy). */}
              {can('kitchen.report') && from <= today && today <= to && <NewWasteRow onSaved={bump} />}
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
        </Wide>
      )}
      {reject && <RejectWaste w={reject} onClose={() => setReject(null)} />}
      {photo && (
        <Modal open onClose={() => setPhoto(null)} title={`Foto · ${photo.item_name}`} subtitle={`${photo.reported_by_name} · ${WASTE_REASON_LABELS[photo.reason]}`}>
          <WastePhoto id={photo.id} className="max-h-[60dvh] w-full rounded-xl" />
        </Modal>
      )}
    </Paper>
  );
}

// ---------- 5. Ventas del día ----------

/**
 * Lo que vendió la caja ese día y lo que esas ventas descontaron del inventario,
 * en el mismo formato de las hojas (sin gráficos).
 */
export function VentasSheet() {
  const today = localDate();
  const [date, setDate] = useState(today);
  const rep = useApi<PeriodReport>(`/reports?period=dia&date=${date}`, [date]);
  const r = rep.data;
  const rows = r?.byProduct ?? [];
  const cons = r?.consumption ?? [];
  const blanks = (n: number, cols: number) =>
    Array.from({ length: Math.max(0, n) }, (_, i) => (
      <tr key={`v${i}`}>
        {Array.from({ length: cols }, (__, j) => (
          <td key={j} className={cx(TD, 'h-8')} />
        ))}
      </tr>
    ));

  return (
    <Paper title="Ventas del día" subtitle={date === today ? `Hoy, ${shortDateDow(date)}` : shortDateDow(date)} nav={<DayNav date={date} setDate={setDate} />}>
      {rep.error ? (
        <ErrorBox message={rep.error} onRetry={rep.reload} />
      ) : !r ? (
        <Loading />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <td className={SECTION} colSpan={3}>
                    Lo que se vendió
                  </td>
                </tr>
                <tr>
                  <th className={cx(TH, 'w-10')}>#</th>
                  <th className={cx(TH, 'text-left')}>Producto</th>
                  <th className={cx(TH, 'w-28')}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.product_id}>
                    <td className={cx(TD, 'text-center text-ink-500 tabular-nums')}>{i + 1}</td>
                    <td className={cx(TD, 'font-semibold uppercase')}>{p.name}</td>
                    <td className={cx(TD, 'text-center font-bold tabular-nums')}>{formatNumber(p.units)}</td>
                  </tr>
                ))}
                {blanks(8 - rows.length, 3)}
                <tr>
                  <td className={cx(TD, 'font-extrabold uppercase text-[11px]')} colSpan={2}>
                    Total ({formatNumber(r.salesCount)} ventas{r.annulled ? ` · ${r.annulled} anuladas no cuentan` : ''})
                  </td>
                  <td className={cx(TD, 'text-center font-extrabold tabular-nums')}>{formatNumber(r.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <td className={SECTION} colSpan={2}>
                    Lo que se descontó del inventario
                  </td>
                </tr>
                <tr>
                  <th className={cx(TH, 'text-left')}>Insumo</th>
                  <th className={cx(TH, 'w-32')}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {cons.map((c) => (
                  <tr key={c.item_id}>
                    <td className={cx(TD, 'font-semibold uppercase')}>{c.name}</td>
                    <td className={cx(TD, 'text-center tabular-nums')}>{formatQty(c.total_m, niceUnit(c.total_m, c.base_unit))}</td>
                  </tr>
                ))}
                {blanks(8 - cons.length, 2)}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-500">Según la receta de cada producto. Se descuenta solo, en cada venta.</p>
          </div>
        </div>
      )}
    </Paper>
  );
}
