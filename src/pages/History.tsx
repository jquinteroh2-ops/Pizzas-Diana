import { useMemo, useState } from 'react';
import { ReceiptText, ChevronRight, Ban, Loader2, Plus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { navigate, useApi, useApp, useHashRoute } from '../lib/app';
import type { Product, Sale, SaleDetail, User } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, EmptyState, Badge, DemoTag, Modal, Field, Pagination, cx } from '../components/ui';
import { addDays, formatDateTime, monthStart, shortDate } from '../../shared/dates.ts';
import { formatNumber, formatQty, niceUnit } from '../../shared/units.ts';

type Preset = 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'rango';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Mes actual' },
  { value: 'rango', label: 'Personalizado' },
];
const PAGE = 15;

export default function History() {
  const { session, can } = useApp();
  const route = useHashRoute();
  const today = session.today;
  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [productId, setProductId] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const range = useMemo(() => {
    switch (preset) {
      case 'hoy':
        return { from: today, to: today };
      case 'ayer':
        return { from: addDays(today, -1), to: addDays(today, -1) };
      case '7d':
        return { from: addDays(today, -6), to: today };
      case '30d':
        return { from: addDays(today, -29), to: today };
      case 'mes':
        return { from: monthStart(today), to: today };
      default:
        return from <= to ? { from, to } : { from: to, to: from };
    }
  }, [preset, from, to, today]);

  const path = `/sales${qs({ from: range.from, to: range.to, productId, userId, status, limit: 2000 })}`;
  const sales = useApi<Sale[]>(path, [path]);
  const products = useApi<Product[]>('/products');
  const users = useApi<User[]>(can('sales.viewAll') ? '/users' : null);

  const list = sales.data ?? [];
  const confirmed = list.filter((s) => s.status === 'confirmada');
  const units = confirmed.reduce((s, x) => s + x.total_units, 0);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const visible = list.slice((page - 1) * PAGE, page * PAGE);
  const openId = route.params.get('venta');

  const onFilter = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Historial de ventas"
        subtitle={can('sales.viewAll') ? 'Todas las ventas registradas, incluidas las anuladas para auditoría.' : 'Las ventas que has registrado tú.'}
        actions={
          can('sales.create') && (
            <button className="btn-primary" onClick={() => navigate('vender')}>
              <Plus className="size-4" /> Registrar venta
            </button>
          )
        }
      />

      <div className="card mb-5 p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => onFilter(setPreset)(p.value)}
              className={cx('chip shrink-0', preset === p.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {preset === 'rango' && (
            <>
              <Field label="Desde">
                <input type="date" className="input" value={from} max={today} onChange={(e) => onFilter(setFrom)(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <input type="date" className="input" value={to} max={today} onChange={(e) => onFilter(setTo)(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Producto">
            <select className="input" value={productId} onChange={(e) => onFilter(setProductId)(e.target.value)}>
              <option value="">Todos</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {can('sales.viewAll') && (
            <Field label="Registrada por">
              <select className="input" value={userId} onChange={(e) => onFilter(setUserId)(e.target.value)}>
                <option value="">Todos</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Estado">
            <select className="input" value={status} onChange={(e) => onFilter(setStatus)(e.target.value)}>
              <option value="">Todos</option>
              <option value="confirmada">Confirmadas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-500">
        <span>
          Período: <b className="text-ink-900">{range.from === range.to ? shortDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`}</b>
        </span>
        <span>
          <b className="text-ink-900">{formatNumber(confirmed.length)}</b> ventas confirmadas
        </span>
        <span>
          <b className="text-ink-900">{formatNumber(units)}</b> unidades vendidas
        </span>
      </div>

      <div className="card overflow-hidden">
        {sales.error ? (
          <ErrorBox message={sales.error} onRetry={sales.reload} />
        ) : !sales.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No hay ventas con estos filtros" text="Cambia el período o los filtros para ver otras ventas." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-cream-50">
                  <tr>
                    <th className="th-cell">Fecha y hora</th>
                    <th className="th-cell">Productos</th>
                    <th className="th-cell text-right">Unidades</th>
                    <th className="th-cell">Registró</th>
                    <th className="th-cell">Estado</th>
                    <th className="th-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200">
                  {visible.map((s) => (
                    <tr key={s.id} className="cursor-pointer transition-colors hover:bg-cream-50" onClick={() => navigate('historial', { venta: s.id })}>
                      <td className="td-cell whitespace-nowrap">
                        <span className="font-medium">{formatDateTime(s.created_at)}</span>
                        <span className="block text-xs text-ink-400">#{s.id.slice(0, 8).toUpperCase()}</span>
                      </td>
                      <td className="td-cell max-w-md">
                        <span className={cx('line-clamp-2', s.status === 'anulada' && 'text-ink-400 line-through')}>
                          {s.items.map((i) => `${i.qty} × ${i.product_name}`).join(', ')}
                        </span>
                      </td>
                      <td className="td-cell text-right font-display text-lg font-semibold tabular-nums">{s.total_units}</td>
                      <td className="td-cell text-ink-700">
                        <span className="flex items-center gap-1.5">
                          {s.user_name} {s.is_demo ? <DemoTag /> : null}
                        </span>
                      </td>
                      <td className="td-cell">{s.status === 'anulada' ? <Badge tone="red">Anulada</Badge> : <Badge tone="green">Confirmada</Badge>}</td>
                      <td className="td-cell text-right">
                        <ChevronRight className="inline size-4 text-ink-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-cream-200 md:hidden">
              {visible.map((s) => (
                <li key={s.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => navigate('historial', { venta: s.id })}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cream-200 font-display text-lg font-semibold">{s.total_units}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-sm font-semibold', s.status === 'anulada' && 'text-ink-400 line-through')}>
                        {s.items.map((i) => `${i.qty} × ${i.product_name}`).join(', ')}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {formatDateTime(s.created_at)} · {s.user_name}
                      </span>
                    </span>
                    {s.status === 'anulada' ? <Badge tone="red">Anulada</Badge> : <ChevronRight className="size-4 text-ink-400" />}
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      {openId && <SaleDetailModal id={openId} onClose={() => navigate('historial')} />}
    </>
  );
}

function SaleDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, bump } = useApp();
  const toast = useToast();
  const sale = useApi<SaleDetail>(`/sales/${encodeURIComponent(id)}`, [id]);
  const [annulling, setAnnulling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const annul = async () => {
    setBusy(true);
    try {
      await api.post(`/sales/${encodeURIComponent(id)}/annul`, { reason });
      toast.success('Venta anulada', 'Las cantidades se devolvieron al inventario.');
      setAnnulling(false);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const s = sale.data;
  // Consumo agrupado por ingrediente (suma de todos los productos de la venta).
  const totals = useMemo(() => {
    const m = new Map<number, { name: string; base: SaleDetail['consumption'][number]['base_unit']; total: number }>();
    for (const c of s?.consumption ?? []) {
      const cur = m.get(c.item_id) ?? { name: c.item_name, base: c.base_unit, total: 0 };
      cur.total += c.total_m;
      m.set(c.item_id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [s]);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={s ? `Venta #${s.id.slice(0, 8).toUpperCase()}` : 'Venta'}
      subtitle={s ? `${formatDateTime(s.created_at)} · registrada por ${s.user_name}` : undefined}
      footer={
        s && (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            {can('sales.annul') && s.status === 'confirmada' && !annulling && (
              <button className="btn-danger" onClick={() => setAnnulling(true)}>
                <Ban className="size-4" /> Anular venta
              </button>
            )}
          </>
        )
      }
    >
      {sale.error ? (
        <ErrorBox message={sale.error} />
      ) : !s ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {s.status === 'anulada' ? <Badge tone="red">Anulada</Badge> : <Badge tone="green">Confirmada</Badge>}
            {s.is_demo ? <DemoTag /> : null}
            <span className="text-sm text-ink-500">
              <b className="text-ink-900">{s.total_units}</b> unidades
            </span>
          </div>

          {s.status === 'anulada' && (
            <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
              Anulada por <b>{s.annulled_by_name}</b> el {formatDateTime(s.annulled_at!)}. Motivo: {s.annul_reason}
              <p className="mt-1 text-xs text-brand-800/80">Las cantidades se devolvieron al inventario y la venta no cuenta en los reportes.</p>
            </div>
          )}

          {annulling && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
              <p className="mb-3 text-sm text-ink-700">
                Al anular, los ingredientes descontados vuelven al inventario. El registro original se conserva para auditoría.
              </p>
              <Field label="Motivo de la anulación">
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. se registró dos veces" maxLength={200} />
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setAnnulling(false)} disabled={busy}>
                  Cancelar
                </button>
                <button className="btn-danger btn-sm" onClick={annul} disabled={busy || reason.trim().length < 3}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Confirmar anulación
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="label">Productos</p>
            <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-200">
              {s.items.map((i) => (
                <li key={i.product_id} className="px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{i.product_name}</span>
                    <span className="font-bold tabular-nums">× {i.qty}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    Receta aplicada por unidad:{' '}
                    {s.consumption
                      .filter((c) => c.product_id === i.product_id)
                      .map((c) => `${c.item_name} ${formatQty(c.per_unit_m, niceUnit(c.per_unit_m, c.base_unit))}`)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label">Ingredientes descontados</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {totals.map((t) => (
                <li key={t.name} className="flex items-center justify-between rounded-xl bg-cream-50 px-3.5 py-2.5 text-sm">
                  <span className="text-ink-700">{t.name}</span>
                  <span className="font-semibold tabular-nums">{formatQty(t.total, niceUnit(t.total, t.base))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
