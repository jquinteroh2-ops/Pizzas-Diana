// «Caja vs cocina»: lo que descontaron las ventas (según las recetas) frente a lo que
// de verdad gastó la cocina según el conteo de apertura y el de cierre.
import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Scale, XCircle } from 'lucide-react';
import { useApi } from '../lib/app';
import type { Reconciliation, ReconciliationLine } from '../lib/types';
import { EmptyState, ErrorBox, Loading, cx } from '../components/ui';
import { formatNumber, formatQty, niceUnit, type BaseUnit } from '../../shared/units.ts';
import { addDays, localDate, shortDateDow } from '../../shared/dates.ts';

/** Desde este % de diferencia la fila se marca para revisar. */
const ALERT_PCT = 5;

/** % que gastó la cocina por encima (o por debajo) de lo que descontaron las ventas. */
function diffPct(l: ReconciliationLine): number | null {
  return l.sales_m > 0 ? Math.round(((l.real_m - l.sales_m) / l.sales_m) * 1000) / 10 : null;
}

function flagged(l: ReconciliationLine): boolean {
  const p = diffPct(l);
  return p === null ? l.real_m !== 0 : Math.abs(p) >= ALERT_PCT;
}

const fmt = (m: number, base: BaseUnit) => (m === 0 ? '—' : formatQty(Math.abs(m), niceUnit(Math.abs(m), base)));

export default function ReconTab() {
  const [date, setDate] = useState(addDays(localDate(), -1));
  const [all, setAll] = useState(false);
  const r = useApi<Reconciliation>(`/reconciliation?date=${date}`, [date]);

  const lines = (r.data?.lines ?? [])
    .filter((l) => all || l.sales_m !== 0 || l.real_m !== 0 || l.diff_m !== 0)
    .sort((a, b) => Math.abs(b.diff_m) / Math.max(b.sales_m, 1) - Math.abs(a.diff_m) / Math.max(a.sales_m, 1));
  const alerts = lines.filter(flagged);

  return (
    <>
      <div className="card mb-4 p-4 text-sm text-ink-700">
        <p>
          <b>Descontó caja</b>: lo que se debió gastar según las recetas de lo vendido (el descuento automático de cada venta). <b>Gastó la cocina</b>: lo que de verdad salió
          según los conteos: <i>lo que había al abrir + lo que entró + lo preparado − lo usado para preparar − las bajas − lo que quedó al cerrar</i>.
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Si la cocina gastó más de lo vendido puede ser: porciones más grandes que la receta, comida de personal o regalada, pérdidas sin reportar o una receta mal
          configurada.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
            <ChevronLeft className="size-4" />
          </button>
          <p className="font-display text-lg font-semibold capitalize">{shortDateDow(date)}</p>
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente" disabled={date >= localDate()}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-600" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Ver también lo que no se movió
        </label>
      </div>

      {r.error ? (
        <ErrorBox message={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {r.data.status.map((s) => (
              <span key={s.location} className="chip border-cream-300 bg-white text-ink-700">
                {s.location}:
                {s.apertura ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-ink-400" />} abrió
                {s.cierre ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-ink-400" />} cerró
              </span>
            ))}
          </div>
          {r.data.lines.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={Scale}
                title="Sin apertura y cierre ese día"
                text="Para comparar, la cocina tiene que contar las neveras al abrir y al cerrar (Cocina → Contar nevera → Apertura / Cierre)."
              />
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-700">
                <b>{lines.length}</b> productos comparados ·{' '}
                {alerts.length ? (
                  <b className="text-brand-700">
                    {alerts.length} con diferencia de {ALERT_PCT} % o más
                  </b>
                ) : (
                  <b className="text-emerald-700">todo cuadra</b>
                )}
              </p>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-cream-50">
                    <tr>
                      <th className="th-cell">Producto</th>
                      <th className="th-cell text-right">Al abrir</th>
                      <th className="th-cell text-right">Entró</th>
                      <th className="th-cell text-right">Preparado</th>
                      <th className="th-cell text-right">Usado p/ preparar</th>
                      <th className="th-cell text-right">Bajas</th>
                      <th className="th-cell text-right">Al cerrar</th>
                      <th className="th-cell bg-ink-900/5 text-right">Gastó cocina</th>
                      <th className="th-cell bg-ink-900/5 text-right">Descontó caja</th>
                      <th className="th-cell text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-200">
                    {lines.map((l) => {
                      const pct = diffPct(l);
                      const bad = flagged(l);
                      return (
                        <tr key={l.item_id} className={cx(bad && 'bg-brand-50/40')}>
                          <td className="td-cell">
                            <span className="font-semibold text-ink-900">{l.name}</span>
                            <span className="block text-xs text-ink-500">{l.location}</span>
                          </td>
                          <td className="td-cell text-right tabular-nums">{fmt(l.open_m, l.base_unit)}</td>
                          <td className="td-cell text-right text-emerald-700 tabular-nums">{l.entries_m ? `+${fmt(l.entries_m, l.base_unit)}` : '—'}</td>
                          <td className="td-cell text-right text-emerald-700 tabular-nums">{l.produced_m ? `+${fmt(l.produced_m, l.base_unit)}` : '—'}</td>
                          <td className="td-cell text-right tabular-nums">{l.used_m ? `−${fmt(l.used_m, l.base_unit)}` : '—'}</td>
                          <td className="td-cell text-right tabular-nums">{l.waste_m ? `−${fmt(l.waste_m, l.base_unit)}` : '—'}</td>
                          <td className="td-cell text-right tabular-nums">{fmt(l.close_m, l.base_unit)}</td>
                          <td className="td-cell bg-ink-900/5 text-right font-semibold tabular-nums">{fmt(l.real_m, l.base_unit)}</td>
                          <td className="td-cell bg-ink-900/5 text-right font-semibold tabular-nums">{fmt(l.sales_m, l.base_unit)}</td>
                          <td className={cx('td-cell text-right font-bold tabular-nums', l.diff_m === 0 ? 'text-ink-400' : bad ? 'text-brand-700' : 'text-amber-700')}>
                            {l.diff_m === 0 ? 'Cuadra' : `${l.diff_m > 0 ? '+' : '−'}${fmt(l.diff_m, l.base_unit)}`}
                            {pct !== null && l.diff_m !== 0 && (
                              <span className="block text-[11px] font-semibold">
                                {pct > 0 ? '+' : ''}
                                {formatNumber(pct)} %
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
