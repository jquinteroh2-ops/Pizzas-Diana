// Pestañas «Preparaciones» y «Pedido» de la hoja del día, con el formato de las hojas de papel.
import { useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Shortage } from '../../lib/types';
import { localDate, shortDate } from '../../../shared/dates.ts';
import { SHORTAGE_LEVEL_LABELS, SHORTAGE_STATUS_LABELS, type ShortageLevel, type ShortageStatus } from '../../../shared/kitchen.ts';
import { formatQty } from '../../../shared/units.ts';
import { useToast } from '../toast';
import { ErrorBox, Loading, cx } from '../ui';
import { MasaSheet, MermaSheet, Paper, TD, TH, Wide } from '../kitchen/Sheets';
import type { Flow } from '../kitchen/FlowHost';

// ---------- Preparaciones: hoja de merma (porcionado) y hoja de masa ----------

export function PrepTab() {
  return (
    <div className="space-y-5">
      <p className="border border-ink-900 bg-white px-4 py-3 text-sm text-ink-700">
        Al porcionar (pechuga, cerdo, quesos) o hacer las recetas (salsas, carne molida, adobo, masa), se llena la columna de hoy y se guarda: el sistema descuenta lo que se usó
        y suma lo que salió. <b>No hay que contarlo otra vez en el inventario.</b>
      </p>
      <MermaSheet />
      <MasaSheet />
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
  const { can } = useApp();
  const canManage = can('sheet.use');

  const setStatus = async (id: number, status: ShortageStatus, what: string) => {
    setBusy(id);
    try {
      await api.post(`/shortages/${id}/status`, { status });
      toast.success(what);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  const reported = new Set((open.data ?? []).map((s) => s.item_id));
  const low = (items.data ?? []).filter((i) => i.status !== 'disponible' && !reported.has(i.id)).sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'es'));
  const rows = open.data ?? [];
  const empty = Math.max(0, 7 - rows.length);

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
                    <td className={cx(TD, 'text-center text-[12px] font-bold', s.status === 'pedido' ? 'text-emerald-700' : 'text-ink-700')}>
                      {SHORTAGE_STATUS_LABELS[s.status]}
                      {canManage && (
                        <span className="mt-1 flex justify-center gap-2 text-[10px] font-bold normal-case print:hidden">
                          {s.status === 'abierto' ? (
                            <button className="text-emerald-700 underline disabled:opacity-40" disabled={busy === s.id} onClick={() => void setStatus(s.id, 'pedido', 'Marcado como pedido')}>
                              ya se pidió
                            </button>
                          ) : (
                            <button className="text-ink-500 underline disabled:opacity-40" disabled={busy === s.id} onClick={() => void setStatus(s.id, 'abierto', 'Vuelve a «por pedir»')}>
                              falta pedir
                            </button>
                          )}
                          <button className="text-brand-700 underline disabled:opacity-40" disabled={busy === s.id} onClick={() => void setStatus(s.id, 'descartado', 'Quitado de la lista')}>
                            quitar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {/* El renglón para escribir lo que falta, como en el papel. */}
                <NewOrderRow items={items.data ?? []} onSaved={bump} />
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

/** Renglón en blanco del pedido: se escribe el producto, cómo está y una nota. */
function NewOrderRow({ items, onSaved }: { items: Item[]; onSaved: () => void }) {
  const { user } = useApp();
  const toast = useToast();
  const [product, setProduct] = useState('');
  const [level, setLevel] = useState<ShortageLevel>('poco');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const item = items.find((i) => i.name.toLowerCase() === product.trim().toLowerCase());
  const input = 'h-9 w-full bg-transparent px-2 text-[13px] font-semibold text-[#1f3f8f] outline-none placeholder:font-normal placeholder:text-ink-400 focus:bg-amber-50 focus:ring-2 focus:ring-ink-900 focus:ring-inset';
  const save = async () => {
    if (!item) return toast.error('Producto', 'Escriba el producto tal como está en el inventario (aparece la lista al escribir).');
    setBusy(true);
    try {
      const r = await api.post<{ merged: boolean }>('/shortages', { item_id: item.id, level, note: note.trim() });
      toast.success(r.merged ? 'Ya estaba en la lista: se actualizó' : 'Agregado a la lista', item.name);
      setProduct('');
      setNote('');
      setLevel('poco');
      onSaved();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className="bg-amber-50/30 print:hidden">
      <td className={cx(TD, 'text-center tabular-nums')}>{shortDate(localDate())}</td>
      <td className={cx(TD, 'p-0')}>
        <input className={input} list="pedido-productos" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="producto" aria-label="Producto" />
        <datalist id="pedido-productos">
          {items.map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        <input className={cx(input, 'h-7 text-[11px] font-normal')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="nota (ej. 2 paquetes)" aria-label="Nota" maxLength={200} />
      </td>
      <td className={cx(TD, 'p-0')}>
        <select className={cx(input, 'text-center')} value={level} onChange={(e) => setLevel(e.target.value as ShortageLevel)} aria-label="Cómo está">
          <option value="poco">Queda poco</option>
          <option value="agotado">Se acabó</option>
        </select>
      </td>
      <td className={cx(TD, 'uppercase')}>{user.name}</td>
      <td className={cx(TD, 'text-center')}>
        <button className="rounded-md bg-ink-900 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : 'Agregar'}
        </button>
      </td>
    </tr>
  );
}
