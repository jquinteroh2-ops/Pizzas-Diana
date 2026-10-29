// Pestaña «Validar»: la jefa de cocina compara lo que se gastó según la hoja con lo que
// vendió la caja (según las recetas) y cierra el día. Al validar, el inventario del sistema
// queda igual a lo que se contó al cerrar.
import { useState } from 'react';
import { CheckCircle2, LockOpen, ReceiptText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app';
import type { DaySheet, DaySheetLine } from '../../../shared/daySheet.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import { formatNumber } from '../../../shared/units.ts';
import { useToast } from '../toast';
import { ConfirmModal, Segmented, cx } from '../ui';
import { qtyText, signedText } from './qty';

type Filter = 'revisar' | 'todo';

function DiffCell({ l }: { l: DaySheetLine }) {
  if (l.diff_m === null) return <span className="text-ink-400">Falta contar</span>;
  if (l.diff_level === 'ok') return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> Cuadra</span>;
  const falta = l.diff_level === 'falta';
  return (
    <span className={cx('font-semibold tabular-nums', falta ? 'text-brand-700' : 'text-amber-700')}>
      {falta ? 'Se gastó ' : 'Sobró '}
      {signedText(Math.abs(l.diff_m), l).replace('+', '')} {falta ? 'de más' : ''}
    </span>
  );
}

export function ValidateTab({ sheet, lines, onSheet }: { sheet: DaySheet; lines: DaySheetLine[]; onSheet: (s: DaySheet) => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('revisar');
  const [note, setNote] = useState(sheet.note);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'validar' | 'reabrir' | null>(null);

  // Solo lo que se movió ese día: algo contado, algo vendido o algo preparado.
  const relevant = lines.filter((l) => l.consumption_m !== null || l.sales_m > 0);
  const toReview = relevant.filter((l) => l.diff_level === 'falta' || l.diff_level === 'sobra');
  const missingClose = lines.filter((l) => l.close_m === null && (l.open_m !== null || l.sales_m > 0));
  const shown = filter === 'revisar' ? [...toReview, ...relevant.filter((l) => l.diff_m === null && l.sales_m > 0)] : relevant;

  const run = async (what: 'validar' | 'reabrir') => {
    setBusy(true);
    try {
      const s = await api.post<DaySheet>(what === 'validar' ? '/day-sheet/validate' : '/day-sheet/reopen', { date: sheet.date, note });
      onSheet(s);
      bump();
      toast.success(what === 'validar' ? 'Día validado' : 'Hoja abierta de nuevo', what === 'validar' ? 'El inventario quedó igual a lo que se contó al cerrar.' : 'Ya se puede corregir.');
      setConfirm(null);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {sheet.status === 'validada' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <ShieldCheck className="size-5 shrink-0" />
          <p className="mr-auto">
            Validada por <b>{sheet.validated_by_name}</b>
            {sheet.validated_at && <> · {formatDateTime(sheet.validated_at)}</>}
            {sheet.note && <span className="block text-emerald-800">«{sheet.note}»</span>}
          </p>
          {can('sheet.reopen') && (
            <button className="btn-secondary btn-sm" onClick={() => setConfirm('reabrir')}>
              <LockOpen className="size-4" /> Volver a abrir
            </button>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase">La caja vendió</p>
          <p className="font-display text-2xl font-semibold text-ink-900">{formatNumber(sheet.sold_units)} platos</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase">Contados al cerrar</p>
          <p className="font-display text-2xl font-semibold text-ink-900">
            {sheet.summary.close_filled} <span className="text-base text-ink-500">de {sheet.summary.items}</span>
          </p>
        </div>
        <div className={cx('card p-4', toReview.length > 0 && 'border-brand-200 bg-brand-50/40')}>
          <p className="text-xs font-semibold text-ink-500 uppercase">No cuadran</p>
          <p className={cx('font-display text-2xl font-semibold', toReview.length ? 'text-brand-700' : 'text-emerald-700')}>{toReview.length}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-200 px-4 py-3">
            <h3 className="font-display text-lg font-semibold">Lo gastado frente a lo vendido</h3>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'revisar', label: `Para revisar (${toReview.length})` },
                { value: 'todo', label: 'Todo' },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-500">
              {relevant.length === 0 ? 'Todavía no hay nada para comparar: falta contar el fin o no hubo ventas.' : 'Todo cuadra con lo que vendió la caja.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                    <th className="px-4 py-2">Ingrediente</th>
                    <th className="px-2 py-2 text-right">Se gastó (hoja)</th>
                    <th className="px-2 py-2 text-right">Según ventas</th>
                    <th className="px-4 py-2 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.item_id} className="border-b border-cream-200/70 last:border-0">
                      <td className="px-4 py-2 font-semibold text-ink-900">
                        {l.name}
                        <span className="block text-[11px] font-normal text-ink-500">{l.location}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.consumption_m === null ? '—' : qtyText(Math.max(0, l.consumption_m), l) || '0'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{qtyText(l.sales_m, l) || '0'}</td>
                      <td className="px-4 py-2 text-right">
                        <DiffCell l={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-cream-200 px-4 py-2.5 text-[11px] text-ink-500">
            Se aceptan diferencias pequeñas (5 %, o 20 g / media unidad): las porciones nunca son exactas.
          </p>
        </section>

        <div className="space-y-5">
          <section className="card overflow-hidden">
            <h3 className="flex items-center gap-2 border-b border-cream-200 px-4 py-3 font-display text-lg font-semibold">
              <ReceiptText className="size-5 text-ink-500" /> Lo que vendió la caja
            </h3>
            {sheet.sold.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">No hay ventas registradas este día.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-cream-200 overflow-y-auto text-sm">
                {sheet.sold.map((p) => (
                  <li key={p.product_id} className="flex justify-between gap-3 px-4 py-2">
                    <span className="text-ink-700">{p.product_name}</span>
                    <span className="font-semibold tabular-nums">{p.qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {sheet.editable && (
            <section className="card space-y-3 p-4">
              <h3 className="font-display text-lg font-semibold">Validar el día</h3>
              {missingClose.length > 0 && (
                <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <TriangleAlert className="size-4 shrink-0" />
                  Faltan {missingClose.length} ingredientes por contar al cerrar. Los que no se cuenten quedan como dice el sistema.
                </p>
              )}
              <label className="block">
                <span className="label">Nota (opcional)</span>
                <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ej.: el queso se gastó de más porque hubo un pedido grande." />
              </label>
              <button className="btn w-full bg-ink-900 py-3 text-white hover:bg-ink-700" onClick={() => setConfirm('validar')} disabled={sheet.summary.close_filled === 0}>
                <ShieldCheck className="size-5" /> Validar el día
              </button>
              {sheet.summary.close_filled === 0 && <p className="text-xs text-ink-500">Primero escribe el Fin en la pestaña Inventario.</p>}
            </section>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirm === 'validar'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void run('validar')}
        title="¿Validar el día?"
        confirmText="Sí, validar"
        busy={busy}
      >
        El inventario del sistema quedará igual a lo que se contó al cerrar ({sheet.summary.close_filled} ingredientes). Después solo el administrador puede volver a abrir la hoja.
        {toReview.length > 0 && <p className="mt-2 font-semibold text-brand-700">Hay {toReview.length} ingredientes que no cuadran con la caja.</p>}
      </ConfirmModal>
      <ConfirmModal open={confirm === 'reabrir'} onClose={() => setConfirm(null)} onConfirm={() => void run('reabrir')} title="¿Volver a abrir la hoja?" confirmText="Abrir" busy={busy}>
        Se deshacen los ajustes que hizo la validación y la cocina podrá corregir la hoja. Después hay que validarla otra vez.
      </ConfirmModal>
    </div>
  );
}
