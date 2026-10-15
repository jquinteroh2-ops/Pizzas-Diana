import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Minus, ShoppingBag, ChefHat, BarChart3, ReceiptText, Ban } from 'lucide-react';
import { useApi, useApp } from '../lib/app';
import type { KitchenReport, PeriodReport } from '../lib/types';
import { PageHeader, Loading, ErrorBox, EmptyState, Segmented, cx } from '../components/ui';
import { UnitsColumns, TopProductsBars } from '../components/charts';
import { addDays, longDate, monthName, prevMonthStart, shortDate, shortDateDow, monthEnd } from '../../shared/dates.ts';
import { baseOf, formatNumber, formatQty, fromMilli, niceUnit, UNIT_SHORT } from '../../shared/units.ts';
import { WASTE_REASON_LABELS } from '../../shared/kitchen.ts';

type Period = 'dia' | 'semana' | 'mes';

function shift(period: Period, date: string, dir: 1 | -1): string {
  if (period === 'dia') return addDays(date, dir);
  if (period === 'semana') return addDays(date, 7 * dir);
  return dir === -1 ? prevMonthStart(date) : addDays(monthEnd(date), 1);
}

function title(r: PeriodReport) {
  if (r.period === 'dia') return longDate(r.range.from);
  if (r.period === 'semana') return `Semana del ${shortDateDow(r.range.from)} al ${shortDateDow(r.range.to)}`;
  return monthName(r.range.from).replace(/^./, (c) => c.toUpperCase());
}

const prevLabels: Record<Period, string> = { dia: 'el día anterior', semana: 'la semana anterior', mes: 'el mes anterior' };
// Período en curso: se compara contra los mismos días del anterior.
const prevLabelsPartial: Record<Period, string> = { dia: 'el día anterior', semana: 'los mismos días de la semana anterior', mes: 'los mismos días del mes anterior' };

function Delta({ now, prev, period, partial }: { now: number; prev: number; period: Period; partial: boolean }) {
  const label = (partial ? prevLabelsPartial : prevLabels)[period];
  if (prev === 0) return <span className="text-xs text-ink-500">Sin ventas en {label} para comparar</span>;
  const diff = now - prev;
  const pct = Math.round((diff / prev) * 100);
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-brand-700' : 'text-ink-500')}>
      <Icon className="size-4" />
      {diff > 0 ? '+' : ''}
      {formatNumber(diff)} ({pct > 0 ? '+' : ''}
      {pct} %) frente a {label} ({formatNumber(prev)})
    </span>
  );
}

/** Genera un CSV (separado por ;, con BOM para que Excel respete las tildes). */
function exportCsv(r: PeriodReport) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [
    ['Pizza Diana - Reporte', title(r)],
    ['Desde', r.range.from, 'Hasta', r.range.to],
    ['Unidades vendidas', r.total],
    ['Ventas confirmadas', r.salesCount],
    ['Ventas anuladas (excluidas)', r.annulled],
    ['Unidades período anterior', r.prevTotal, r.prev.from, r.prev.to],
    [],
    ['Producto', 'Unidades vendidas', 'Participación %'],
    ...r.byProduct.map((p) => [p.name, p.units, r.total ? ((p.units / r.total) * 100).toFixed(1).replace('.', ',') : '0']),
    [],
    ['Ingrediente', 'Consumo', 'Unidad'],
    ...r.consumption.map((c) => {
      const u = niceUnit(c.total_m, c.base_unit);
      return [c.name, String(fromMilli(c.total_m, u)).replace('.', ','), UNIT_SHORT[u]];
    }),
  ];
  if (r.evolution.length) {
    rows.push([], ['Desde', 'Hasta', 'Unidades'], ...r.evolution.map((e) => [e.from, e.to, e.units]));
  }
  const csv = '﻿' + rows.map((row) => row.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pizza-diana-reporte-${r.period}-${r.range.from}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { session } = useApp();
  const [period, setPeriod] = useState<Period>('dia');
  const [date, setDate] = useState(session.today);
  const rep = useApi<PeriodReport>(`/reports?period=${period}&date=${date}`, [period, date]);
  const r = rep.data;
  const isFuture = (d: string) => d > session.today;
  const next = shift(period, date, 1);

  const evolution =
    r?.period === 'semana'
      ? r.evolution.map((e) => ({ label: shortDateDow(e.from).split(' ')[0], tooltip: shortDateDow(e.from), units: e.units }))
      : r?.period === 'mes'
        ? r.evolution.map((e, i) => ({ label: `Sem ${i + 1}`, tooltip: `${shortDate(e.from)} – ${shortDate(e.to)}`, units: e.units }))
        : [];

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="Calculados con las ventas confirmadas. Las semanas van de lunes a domingo (hora de Colombia)."
        actions={
          r && (
            <button className="btn-secondary" onClick={() => exportCsv(r)}>
              <Download className="size-4" /> Exportar CSV
            </button>
          )
        }
      />

      <div className="card mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'dia', label: 'Diario' },
            { value: 'semana', label: 'Semanal' },
            { value: 'mes', label: 'Mensual' },
          ]}
        />
        <div className="flex items-center gap-2">
          <button className="btn-secondary p-2.5" onClick={() => setDate(shift(period, date, -1))} aria-label="Período anterior">
            <ChevronLeft className="size-4" />
          </button>
          <input type="date" className="input w-44" value={date} max={session.today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Fecha del reporte" />
          <button className="btn-secondary p-2.5" onClick={() => setDate(isFuture(next) ? session.today : next)} disabled={isFuture(next) && date === session.today} aria-label="Período siguiente">
            <ChevronRight className="size-4" />
          </button>
          {date !== session.today && (
            <button className="btn-ghost btn-sm" onClick={() => setDate(session.today)}>
              Hoy
            </button>
          )}
        </div>
      </div>

      {rep.error ? (
        <ErrorBox message={rep.error} onRetry={rep.reload} />
      ) : !r ? (
        <Loading />
      ) : (
        <>
          <div className="mb-6">
            <h2 className="font-display text-2xl font-semibold text-ink-900 first-letter:uppercase">{title(r)}</h2>
            <p className="text-sm text-ink-500">
              Del {longDate(r.range.from)} al {longDate(r.range.to)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5 sm:col-span-1">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-500">
                <ShoppingBag className="size-4 text-brand-600" /> Unidades vendidas
              </p>
              <p className="mt-2 font-display text-5xl font-semibold tabular-nums">{formatNumber(r.total)}</p>
              <div className="mt-2">
                <Delta now={r.total} prev={r.prevTotal} period={r.period} partial={r.range.to > session.today} />
              </div>
            </div>
            <div className="card p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-500">
                <ReceiptText className="size-4 text-brand-600" /> Ventas confirmadas
              </p>
              <p className="mt-2 font-display text-5xl font-semibold tabular-nums">{formatNumber(r.salesCount)}</p>
              <p className="mt-2 text-xs text-ink-500">{r.salesCount ? `${(r.total / r.salesCount).toFixed(1).replace('.', ',')} unidades por venta en promedio` : 'Sin ventas'}</p>
            </div>
            <div className="card p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-500">
                <Ban className="size-4 text-brand-600" /> Ventas anuladas
              </p>
              <p className="mt-2 font-display text-5xl font-semibold tabular-nums">{formatNumber(r.annulled)}</p>
              <p className="mt-2 text-xs text-ink-500">Excluidas de todos los totales</p>
            </div>
          </div>

          {r.total === 0 ? (
            <div className="card mt-6">
              <EmptyState icon={BarChart3} title="Sin ventas en este período" text="Elige otra fecha o período para ver resultados." />
            </div>
          ) : (
            <>
              {evolution.length > 0 && (
                <section className="card mt-6 p-5 sm:p-6">
                  <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
                    <TrendingUp className="size-5 text-brand-600" /> {r.period === 'semana' ? 'Evolución por día' : 'Evolución por semana'}
                  </h3>
                  <p className="mb-4 text-xs text-ink-500">{r.period === 'mes' ? 'Semanas de lunes a domingo, recortadas al inicio y fin del mes.' : 'Unidades vendidas cada día.'}</p>
                  <UnitsColumns data={evolution} />
                </section>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="card p-5 sm:p-6">
                  <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                    <ShoppingBag className="size-5 text-brand-600" /> {r.period === 'dia' ? 'Cantidades por producto' : 'Ranking de productos'}
                  </h3>
                  <TopProductsBars data={r.byProduct} max={10} />
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-200">
                        <th className="py-2 text-left text-xs font-semibold text-ink-500 uppercase">#</th>
                        <th className="py-2 text-left text-xs font-semibold text-ink-500 uppercase">Producto</th>
                        <th className="py-2 text-right text-xs font-semibold text-ink-500 uppercase">Unid.</th>
                        <th className="py-2 text-right text-xs font-semibold text-ink-500 uppercase">%</th>
                        <th className="hidden py-2 text-right text-xs font-semibold text-ink-500 uppercase sm:table-cell">Antes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-200">
                      {r.byProduct.map((p, i) => {
                        const prev = r.prevByProduct.find((x) => x.product_id === p.product_id)?.units ?? 0;
                        return (
                          <tr key={p.product_id}>
                            <td className="py-2 text-ink-400 tabular-nums">{i + 1}</td>
                            <td className="py-2 font-medium">{p.name}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{formatNumber(p.units)}</td>
                            <td className="py-2 text-right text-ink-500 tabular-nums">{Math.round((p.units / r.total) * 100)}</td>
                            <td className="hidden py-2 text-right text-ink-500 tabular-nums sm:table-cell">{formatNumber(prev)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                <section className="card p-5 sm:p-6">
                  <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
                    <ChefHat className="size-5 text-brand-600" /> Ingredientes consumidos
                  </h3>
                  <p className="mb-4 text-xs text-ink-500">Según las recetas guardadas en cada venta.</p>
                  <ul className="divide-y divide-cream-200">
                    {r.consumption.map((c) => (
                      <li key={c.item_id} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="text-ink-700">{c.name}</span>
                        <span className="font-semibold tabular-nums">{formatQty(c.total_m, niceUnit(c.total_m, c.base_unit))}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          )}
          <KitchenSection period={period} date={date} />
        </>
      )}
    </>
  );
}

/** Sección «Cocina»: lo que se preparó y cómo rindió, lo que se botó y lo que entró. */
function KitchenSection({ period, date }: { period: Period; date: string }) {
  const k = useApi<KitchenReport>(`/reports/kitchen?period=${period}&date=${date}`, [period, date]);
  if (k.error) return <ErrorBox message={k.error} onRetry={k.reload} />;
  if (!k.data) return <Loading />;
  const d = k.data;
  const nothing = d.productionsCount + d.wastesCount + d.entries.length + d.countDiffs.length === 0;
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink-900">
        <ChefHat className="size-6 text-brand-600" /> Cocina
      </h2>
      <p className="mb-4 text-sm text-ink-500">Preparaciones, mermas, bajas, entradas de mercancía y diferencias de conteo del mismo período.</p>
      {nothing ? (
        <div className="card">
          <EmptyState icon={ChefHat} title="Sin movimiento de cocina" text="No hubo preparaciones, bajas, entradas ni conteos en este período." />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5 sm:p-6">
            <h3 className="mb-1 font-display text-lg font-semibold">Preparaciones y rendimiento</h3>
            <p className="mb-3 text-xs text-ink-500">Rendimiento = lo que salió frente a lo que debía salir según la receta estándar.</p>
            {d.productions.length === 0 ? (
              <p className="py-4 text-sm text-ink-500">No se registraron preparaciones.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-xs text-ink-500 uppercase">
                    <th className="py-2 text-left font-semibold">Preparación</th>
                    <th className="py-2 text-right font-semibold">Veces</th>
                    <th className="py-2 text-right font-semibold">Salió</th>
                    <th className="py-2 text-right font-semibold">Rend.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {d.productions.map((p) => {
                    const eff = p.expected_m ? Math.round((p.output_m / p.expected_m) * 1000) / 10 : null;
                    return (
                      <tr key={p.preparation_id}>
                        <td className="py-2 font-medium">
                          {p.name}
                          {p.merma_m > 0 && <span className="block text-xs text-ink-500">merma {formatQty(p.merma_m, niceUnit(p.merma_m, baseOf(p.unit)))}</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{p.count}</td>
                        <td className="py-2 text-right tabular-nums">{formatQty(p.output_m, niceUnit(p.output_m, baseOf(p.unit)))}</td>
                        <td className={cx('py-2 text-right font-semibold tabular-nums', eff !== null && eff < 90 ? 'text-brand-700' : 'text-emerald-700')}>{eff === null ? '—' : `${formatNumber(eff)} %`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h3 className="mb-1 font-display text-lg font-semibold">Bajas aprobadas</h3>
            <p className="mb-3 text-xs text-ink-500">Lo que se botó, por producto y motivo.</p>
            {d.wastes.length === 0 ? (
              <p className="py-4 text-sm text-ink-500">No hubo bajas.</p>
            ) : (
              <ul className="divide-y divide-cream-200">
                {d.wastes.map((w) => (
                  <li key={`${w.item_id}-${w.reason}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium text-ink-900">{w.name}</span>
                      <span className="block text-xs text-ink-500">
                        {WASTE_REASON_LABELS[w.reason]} · {w.count} {w.count === 1 ? 'vez' : 'veces'}
                      </span>
                    </span>
                    <span className="font-semibold text-brand-700 tabular-nums">−{formatQty(w.qty_m, niceUnit(w.qty_m, w.base_unit))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h3 className="mb-1 font-display text-lg font-semibold">Entradas de mercancía</h3>
            <p className="mb-3 text-xs text-ink-500">Todo lo que ingresó al inventario.</p>
            {d.entries.length === 0 ? (
              <p className="py-4 text-sm text-ink-500">No entró mercancía.</p>
            ) : (
              <ul className="divide-y divide-cream-200">
                {d.entries.map((e) => (
                  <li key={e.item_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium text-ink-900">{e.name}</span>
                      <span className="block text-xs text-ink-500">
                        {e.count} {e.count === 1 ? 'entrada' : 'entradas'}
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-700 tabular-nums">+{formatQty(e.total_m, niceUnit(e.total_m, e.base_unit))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h3 className="mb-1 font-display text-lg font-semibold">Diferencias de conteo</h3>
            <p className="mb-3 text-xs text-ink-500">Lo que no cuadró entre el sistema y lo que se contó en las neveras.</p>
            {d.countDiffs.length === 0 ? (
              <p className="py-4 text-sm text-ink-500">Los conteos cuadraron (o no hubo conteos aplicados).</p>
            ) : (
              <ul className="divide-y divide-cream-200">
                {d.countDiffs.map((c) => (
                  <li key={c.item_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-ink-900">{c.name}</span>
                    <span className={cx('font-semibold tabular-nums', c.diff_m < 0 ? 'text-brand-700' : 'text-emerald-700')}>
                      {c.diff_m > 0 ? '+' : '−'}
                      {formatQty(Math.abs(c.diff_m), niceUnit(Math.abs(c.diff_m), c.base_unit))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
