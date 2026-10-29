// Pestañas «Preparaciones» y «Pedido» de la hoja del día, con el formato de las hojas de papel.
import { useState } from 'react';
import { ChefHat, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Shortage } from '../../lib/types';
import { localDate, shortDate } from '../../../shared/dates.ts';
import { SHORTAGE_LEVEL_LABELS, SHORTAGE_STATUS_LABELS } from '../../../shared/kitchen.ts';
import { formatQty } from '../../../shared/units.ts';
import { useToast } from '../toast';
import { ErrorBox, Loading, cx } from '../ui';
import { MasaSheet, MermaSheet, Paper, TD, TH, Wide } from '../kitchen/Sheets';
import type { Flow } from '../kitchen/FlowHost';

// ---------- Preparaciones: hoja de merma (porcionado) y hoja de masa ----------

export function PrepTab({ onFlow, editable }: { onFlow: (f: Flow) => void; editable: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border border-ink-900 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-ink-700">
          Al porcionar (pechuga, cerdo, quesos) o hacer las recetas (salsas, carne molida, adobo, masa), el sistema descuenta lo que se usó y suma lo que salió.{' '}
          <b>No hay que contarlo otra vez.</b>
        </p>
        {editable && (
          <button className="btn shrink-0 bg-ink-900 text-white hover:bg-ink-700" onClick={() => onFlow({ kind: 'preparar' })}>
            <ChefHat className="size-4" /> Registrar preparación
          </button>
        )}
      </div>
      <MermaSheet onFlow={onFlow} />
      <MasaSheet onFlow={onFlow} />
    </div>
  );
}

// ---------- Pedido: lista de lo que hace falta ----------

export function OrderTab({ onFlow }: { onFlow: (f: Flow) => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const open = useApi<Shortage[]>('/shortages?scope=open');
  const items = useApi<Item[]>('/kitchen/items');
  const [busy, setBusy] = useState<number | null>(null);

  const reported = new Set((open.data ?? []).map((s) => s.item_id));
  const low = (items.data ?? []).filter((i) => i.status !== 'disponible' && !reported.has(i.id)).sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'es'));
  const rows = open.data ?? [];
  const empty = Math.max(0, 8 - rows.length);

  const add = async (i: Item) => {
    setBusy(i.id);
    try {
      await api.post('/shortages', { item_id: i.id, level: i.status === 'agotado' ? 'agotado' : 'poco', note: '' });
      toast.success('Agregado a la lista', i.name);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Paper
        title="Lista de lo que hace falta"
        subtitle="Pedido al proveedor"
        note="Cuando llegue, anótelo en la columna Entrada de la hoja: sale solo de esta lista"
        actions={
          <button className="btn btn-sm shrink-0 bg-ink-900 whitespace-nowrap text-white hover:bg-ink-700" onClick={() => onFlow({ kind: 'faltante' })}>
            <Megaphone className="size-4" /> Falta algo
          </button>
        }
      >
        {open.error ? (
          <ErrorBox message={open.error} onRetry={open.reload} />
        ) : !open.data ? (
          <Loading />
        ) : (
          <Wide>
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Producto</th>
                  <th className={TH}>Cómo está</th>
                  <th className={TH}>Avisó</th>
                  <th className={TH}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className={cx(TD, 'text-center tabular-nums')}>{shortDate(localDate(s.created_at))}</td>
                    <td className={cx(TD, 'font-semibold uppercase')}>
                      {s.item_name}
                      {s.note && <span className="block text-[11px] font-normal normal-case text-ink-500">{s.note}</span>}
                    </td>
                    <td className={cx(TD, 'text-center font-bold', s.level === 'agotado' ? 'text-brand-700' : 'text-amber-700')}>{SHORTAGE_LEVEL_LABELS[s.level].toUpperCase()}</td>
                    <td className={cx(TD, 'uppercase')}>{s.reported_by_name}</td>
                    <td className={cx(TD, 'text-center text-[12px] font-bold', s.status === 'pedido' ? 'text-emerald-700' : 'text-ink-700')}>{SHORTAGE_STATUS_LABELS[s.status]}</td>
                  </tr>
                ))}
                {/* Renglones vacíos, como en la hoja impresa. */}
                {Array.from({ length: empty }, (_, i) => (
                  <tr key={`v${i}`}>
                    {Array.from({ length: 5 }, (__, j) => (
                      <td key={j} className={cx(TD, 'h-8')} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Wide>
        )}
      </Paper>

      <Paper title="Según el sistema se está acabando" subtitle="Por debajo del mínimo">
        {items.error ? (
          <ErrorBox message={items.error} onRetry={items.reload} />
        ) : !items.data ? (
          <Loading />
        ) : (
          <Wide>
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Producto</th>
                  <th className={TH}>Queda</th>
                  <th className={TH}>Mínimo</th>
                  <th className={cx(TH, 'print:hidden')} />
                </tr>
              </thead>
              <tbody>
                {low.length === 0 && (
                  <tr>
                    <td colSpan={4} className={cx(TD, 'py-5 text-center text-ink-500')}>
                      Nada por debajo del mínimo.
                    </td>
                  </tr>
                )}
                {low.map((i) => (
                  <tr key={i.id}>
                    <td className={cx(TD, 'font-semibold uppercase')}>{i.name}</td>
                    <td className={cx(TD, 'text-center tabular-nums', i.status === 'agotado' ? 'font-bold text-brand-700' : 'text-amber-700')}>
                      {i.status === 'agotado' ? 'SE ACABÓ' : formatQty(i.qty_m, i.unit)}
                    </td>
                    <td className={cx(TD, 'text-center tabular-nums')}>{formatQty(i.min_m, i.unit)}</td>
                    <td className={cx(TD, 'text-center print:hidden')}>
                      <button
                        className="rounded-md border border-ink-400 px-2 py-1 text-[11px] font-bold text-ink-700 hover:border-ink-900 disabled:opacity-50"
                        disabled={busy === i.id}
                        onClick={() => void add(i)}
                      >
                        Agregar a la lista
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Wide>
        )}
      </Paper>
    </div>
  );
}
