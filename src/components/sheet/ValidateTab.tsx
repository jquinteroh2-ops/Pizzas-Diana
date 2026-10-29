// Pestaña «Validar con caja», en formato de hoja: lo que se gastó según la hoja frente a lo
// que vendió la caja (según las recetas). La jefa de cocina revisa y firma (valida) el día;
// al validar, el inventario del sistema queda igual a lo que se contó al cerrar.
import { useState } from 'react';
import { LockOpen, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app';
import type { DaySheet, DaySheetLine } from '../../../shared/daySheet.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import { useToast } from '../toast';
import { ConfirmModal, cx } from '../ui';
import { Paper, TD, TH, Wide } from '../kitchen/Sheets';
import { qtyText, signedText } from './qty';

type Filter = 'revisar' | 'todo';

const paperDate = (ymd: string) => `${Number(ymd.slice(8, 10))}.${ymd.slice(5, 7)}.${ymd.slice(2, 4)}`;

function Result({ l }: { l: DaySheetLine }) {
  if (l.diff_m === null) return <span className="text-ink-500">FALTA EL FIN</span>;
  if (l.diff_level === 'ok') return <span className="font-bold text-emerald-700">CUADRA</span>;
  const amount = signedText(Math.abs(l.diff_m), l).replace('+', '');
  return l.diff_level === 'falta' ? (
    <span className="font-bold text-brand-700">FALTAN {amount}</span>
  ) : (
    <span className="font-bold text-amber-700">SOBRAN {amount}</span>
  );
}

export function ValidateTab({ sheet, lines, onSheet }: { sheet: DaySheet; lines: DaySheetLine[]; onSheet: (s: DaySheet) => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('revisar');
  const [note, setNote] = useState(sheet.note);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'validar' | 'reabrir' | null>(null);

  // Solo lo que se movió ese día: algo contado o algo vendido.
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

  const tabBtn = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)} className={cx('border border-ink-900 px-3 py-1 text-[11px] font-extrabold uppercase', filter === f ? 'bg-ink-900 text-white' : 'bg-[#d9d9d9] text-ink-900')}>
      {label}
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Paper
        title="Caja vs cocina"
        subtitle={`Fecha: ${paperDate(sheet.date)} · la caja vendió ${sheet.sold_units} platos`}
        nav={
          <div className="flex">
            {tabBtn('revisar', `No cuadran (${toReview.length})`)}
            {tabBtn('todo', 'Todo')}
          </div>
        }
        note="Se aceptan diferencias pequeñas (5 %, o 20 g / media unidad): las porciones nunca son exactas"
      >
        <Wide>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th className={cx(TH, 'w-[34%]')}>Producto</th>
                <th className={TH}>Se gastó (hoja)</th>
                <th className={TH}>Según ventas</th>
                <th className={cx(TH, 'bg-ink-900 text-white')}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className={cx(TD, 'py-6 text-center text-ink-500')}>
                    {relevant.length === 0 ? 'Todavía no hay nada para comparar: falta llenar el fin o no hubo ventas.' : 'Todo cuadra con lo que vendió la caja.'}
                  </td>
                </tr>
              )}
              {shown.map((l) => (
                <tr key={l.item_id}>
                  <td className={TD}>
                    <span className="font-semibold">{l.name}</span>
                    <span className="block text-[10.5px] text-ink-500">{l.location}</span>
                  </td>
                  <td className={cx(TD, 'text-center font-semibold text-[#1f3f8f] tabular-nums')}>{l.consumption_m === null ? '' : qtyText(Math.max(0, l.consumption_m), l) || '0'}</td>
                  <td className={cx(TD, 'text-center tabular-nums')}>{qtyText(l.sales_m, l) || '0'}</td>
                  <td className={cx(TD, 'text-center text-[12px]')}>
                    <Result l={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Wide>
      </Paper>

      <div className="space-y-5">
        <Paper title="Ventas de caja" subtitle={`${sheet.sold_units} platos`}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Producto</th>
                  <th className={cx(TH, 'w-16')}>Cant.</th>
                </tr>
              </thead>
              <tbody>
                {sheet.sold.length === 0 && (
                  <tr>
                    <td colSpan={2} className={cx(TD, 'py-5 text-center text-ink-500')}>
                      Sin ventas este día.
                    </td>
                  </tr>
                )}
                {sheet.sold.map((p) => (
                  <tr key={p.product_id}>
                    <td className={TD}>{p.product_name}</td>
                    <td className={cx(TD, 'text-center font-bold tabular-nums')}>{p.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Paper>

        {/* La firma de la hoja */}
        <div className="border-2 border-ink-900 bg-white p-4">
          <p className="text-[11px] font-extrabold tracking-wider text-ink-900 uppercase">Revisado y validado por</p>
          {sheet.status === 'validada' ? (
            <>
              <p className="mt-2 flex items-center gap-2 border-b border-ink-900 pb-1 text-lg font-semibold text-[#1f3f8f]">
                <ShieldCheck className="size-5 text-emerald-700" /> {sheet.validated_by_name}
              </p>
              {sheet.validated_at && <p className="mt-1 text-xs text-ink-500">{formatDateTime(sheet.validated_at)}</p>}
              {sheet.note && <p className="mt-2 text-sm text-ink-700">«{sheet.note}»</p>}
              {can('sheet.reopen') && (
                <button className="btn-secondary btn-sm mt-3" onClick={() => setConfirm('reabrir')}>
                  <LockOpen className="size-4" /> Volver a abrir
                </button>
              )}
            </>
          ) : (
            <div className="mt-3 space-y-3">
              {missingClose.length > 0 && (
                <p className="flex gap-2 border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <TriangleAlert className="size-4 shrink-0" />
                  Faltan {missingClose.length} productos por llenar en el fin. Los que no se llenen quedan como dice el sistema.
                </p>
              )}
              <label className="block">
                <span className="text-xs font-bold text-ink-700 uppercase">Observaciones</span>
                <textarea
                  className="mt-1 min-h-20 w-full border border-ink-400 px-3 py-2 text-sm focus:border-ink-900 focus:outline-none"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Ej.: el queso se gastó de más porque hubo un pedido grande."
                />
              </label>
              <button className="btn w-full bg-ink-900 py-3 text-white hover:bg-ink-700" onClick={() => setConfirm('validar')} disabled={sheet.summary.close_filled === 0}>
                <ShieldCheck className="size-5" /> Validar el día
              </button>
              {sheet.summary.close_filled === 0 && <p className="text-xs text-ink-500">Primero llene el fin en la hoja de inventario.</p>}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal open={confirm === 'validar'} onClose={() => setConfirm(null)} onConfirm={() => void run('validar')} title="¿Validar el día?" confirmText="Sí, validar" busy={busy}>
        El inventario del sistema quedará igual a lo que se contó al cerrar ({sheet.summary.close_filled} productos). Después solo el administrador puede volver a abrir la hoja.
        {toReview.length > 0 && <p className="mt-2 font-semibold text-brand-700">Hay {toReview.length} productos que no cuadran con la caja.</p>}
      </ConfirmModal>
      <ConfirmModal open={confirm === 'reabrir'} onClose={() => setConfirm(null)} onConfirm={() => void run('reabrir')} title="¿Volver a abrir la hoja?" confirmText="Abrir" busy={busy}>
        Se deshacen los ajustes que hizo la validación y la cocina podrá corregir la hoja. Después hay que validarla otra vez.
      </ConfirmModal>
    </div>
  );
}
