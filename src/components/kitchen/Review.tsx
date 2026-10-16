// Ventanas del administrador para revisar: rechazar una baja y aplicar (o descartar) un conteo.
// Se usan en Cocina y directamente dentro de las hojas.
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Count, Waste } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, Field, cx } from '../ui';
import { formatQty, niceUnit } from '../../../shared/units.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import { COUNT_KIND_LABELS } from '../../../shared/kitchen.ts';

export function RejectWaste({ w, onClose }: { w: Waste; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/wastes/${w.id}/review`, { decision: 'rechazar', note });
      toast.success('Baja rechazada', 'El inventario no cambió.');
      bump();
      onClose();
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Rechazar baja"
      subtitle={`${w.item_name} · ${formatQty(w.qty_m, w.unit)}`}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-danger" form="reject-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Rechazar
          </button>
        </>
      }
    >
      <form id="reject-form" onSubmit={submit}>
        <Field label="¿Por qué se rechaza?" hint="La cocina verá este comentario.">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={200} placeholder="Ej. ese producto todavía sirve" />
        </Field>
      </form>
    </Modal>
  );
}

export function CountReview({ id, onClose }: { id: number; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const c = useApi<Count>(`/counts/${id}`, [id]);
  const [busy, setBusy] = useState<'aplicar' | 'descartar' | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(true);

  const decide = async (decision: 'aplicar' | 'descartar') => {
    setBusy(decision);
    try {
      await api.post(`/counts/${id}/review`, { decision });
      toast.success(decision === 'aplicar' ? 'Inventario ajustado con el conteo' : 'Conteo descartado');
      bump();
      onClose();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  const lines = (c.data?.lines ?? []).filter((l) => !onlyDiff || l.diff_m !== 0);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={c.data ? `${COUNT_KIND_LABELS[c.data.kind]} · ${c.data.location}` : 'Conteo'}
      subtitle={c.data ? `${c.data.counted_by_name} · ${formatDateTime(c.data.counted_at)}${c.data.note ? ` · ${c.data.note}` : ''}` : undefined}
      footer={
        c.data?.status === 'pendiente' && (
          <>
            <button className="btn-secondary" onClick={() => void decide('descartar')} disabled={!!busy}>
              {busy === 'descartar' && <Loader2 className="size-4 animate-spin" />} Descartar
            </button>
            <button className="btn-primary" onClick={() => void decide('aplicar')} disabled={!!busy}>
              {busy === 'aplicar' && <Loader2 className="size-4 animate-spin" />} Aplicar {c.data.diff_count} ajustes
            </button>
          </>
        )
      }
    >
      {!c.data ? (
        <Loading />
      ) : (
        <>
          <p className="mb-3 rounded-xl bg-cream-100 p-3 text-xs text-ink-700">
            «Sistema» es lo que había registrado cuando se contó. Al aplicar, solo se ajusta la diferencia: las ventas que pasaron después no se cuentan dos veces.
          </p>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            Ver solo lo que no coincide
          </label>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-50">
                <tr>
                  <th className="th-cell">Producto</th>
                  <th className="th-cell text-right">Sistema</th>
                  <th className="th-cell text-right">Contado</th>
                  <th className="th-cell text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {lines.map((l) => (
                  <tr key={l.item_id}>
                    <td className="td-cell font-semibold">{l.item_name}</td>
                    <td className="td-cell text-right text-ink-500 tabular-nums">{formatQty(l.expected_m, l.unit)}</td>
                    <td className="td-cell text-right tabular-nums">{formatQty(l.counted_m, l.unit)}</td>
                    <td className={cx('td-cell text-right font-bold tabular-nums', l.diff_m < 0 ? 'text-brand-700' : l.diff_m > 0 ? 'text-emerald-700' : 'text-ink-400')}>
                      {l.diff_m === 0 ? '—' : `${l.diff_m > 0 ? '+' : '−'}${formatQty(Math.abs(l.diff_m), niceUnit(Math.abs(l.diff_m), l.base_unit))}`}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="td-cell py-8 text-center text-ink-500">
                      Todo lo contado coincide con el sistema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
