import { useMemo, useRef, useState } from 'react';
import { Search, Pizza, CupSoda, Minus, Plus, ShoppingBag, Trash2, Loader2, CheckCircle2, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { api, ApiError, newRequestId } from '../lib/api';
import { navigate, useApi, useApp } from '../lib/app';
import type { Product, Requirement, Sale, SalePreview } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, EmptyState, Modal, cx } from '../components/ui';
import { formatQty, niceUnit, formatNumber } from '../../shared/units.ts';

type Cart = Map<number, number>;

function qtyText(r: Requirement, field: 'needed_m' | 'available_m' | 'after_m' | 'short_m') {
  const unit = field === 'needed_m' || field === 'short_m' ? niceUnit(r[field], r.base_unit) : r.unit;
  return formatQty(r[field], unit);
}

export default function NewSale() {
  const { bump, can } = useApp();
  const toast = useToast();
  const products = useApi<Product[]>('/products');
  const [cart, setCart] = useState<Cart>(new Map());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [preview, setPreview] = useState<SalePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const [mobileCart, setMobileCart] = useState(false);
  // Un identificador por venta: si se envía dos veces (doble clic, red lenta), el servidor no la duplica.
  const requestId = useRef<string>(newRequestId());

  const sellable = useMemo(() => (products.data ?? []).filter((p) => p.active), [products.data]);
  const categories = useMemo(() => [...new Set(sellable.map((p) => p.category))], [sellable]);
  const visible = sellable.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const byId = new Map(sellable.map((p) => [p.id, p]));
  const lines = [...cart].filter(([id]) => byId.has(id));
  const totalUnits = lines.reduce((s, [, n]) => s + n, 0);

  const setQty = (id: number, n: number) =>
    setCart((c) => {
      const next = new Map(c);
      if (n <= 0) next.delete(id);
      else next.set(id, Math.min(n, 999));
      return next;
    });

  const reset = () => {
    setCart(new Map());
    setPreview(null);
    requestId.current = newRequestId();
  };

  const review = async () => {
    setChecking(true);
    try {
      setPreview(await api.post<SalePreview>('/sales/preview', { items: lines.map(([productId, qty]) => ({ productId, qty })) }));
      setMobileCart(false);
    } catch (e) {
      toast.fail(e, 'No se pudo revisar la venta');
    } finally {
      setChecking(false);
    }
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.post<{ sale: Sale; duplicate: boolean }>('/sales', {
        requestId: requestId.current,
        items: lines.map(([productId, qty]) => ({ productId, qty })),
      });
      setDone(res.sale);
      reset();
      bump();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details) {
        // El inventario cambió mientras se revisaba: se muestra de nuevo qué falta.
        const shortages = (e.details as { shortages: Requirement[] }).shortages;
        setPreview((p) => (p ? { ...p, ok: false, shortages } : p));
      }
      toast.fail(e, 'La venta no se registró');
    } finally {
      setSaving(false);
    }
  };

  const summary = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-cream-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShoppingBag className="size-5 text-brand-600" /> Resumen
        </h2>
        {lines.length > 0 && (
          <button className="btn-ghost btn-sm text-ink-500" onClick={reset}>
            <Trash2 className="size-4" /> Vaciar
          </button>
        )}
      </div>
      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center text-sm text-ink-500">
          <ShoppingBag className="mb-3 size-10 text-cream-300" />
          Toca un producto para agregarlo a la venta.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-cream-200 overflow-y-auto px-5">
          {lines.map(([id, n]) => {
            const p = byId.get(id)!;
            return (
              <li key={id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{p.name}</p>
                  <p className="text-xs text-ink-500">{p.category}</p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-cream-300 bg-white p-0.5">
                  <button className="grid size-8 place-items-center rounded-lg text-ink-700 hover:bg-cream-100" onClick={() => setQty(id, n - 1)} aria-label={`Quitar uno de ${p.name}`}>
                    <Minus className="size-4" />
                  </button>
                  <input
                    className="w-10 bg-transparent text-center text-sm font-bold tabular-nums focus:outline-none"
                    inputMode="numeric"
                    value={n}
                    onChange={(e) => setQty(id, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0))}
                    aria-label={`Cantidad de ${p.name}`}
                  />
                  <button className="grid size-8 place-items-center rounded-lg text-ink-700 hover:bg-cream-100" onClick={() => setQty(id, n + 1)} aria-label={`Agregar uno de ${p.name}`}>
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-cream-200 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-sm text-ink-500">Total de unidades</span>
          <span className="font-display text-3xl font-semibold tabular-nums">{formatNumber(totalUnits)}</span>
        </div>
        <button className="btn-primary w-full py-3" disabled={!lines.length || checking} onClick={review}>
          {checking ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Revisar y confirmar
        </button>
        {lines.length > 0 && (
          <button className="btn-ghost mt-2 w-full" onClick={reset}>
            Cancelar venta
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Registrar venta" subtitle="Selecciona los productos vendidos y sus cantidades. El inventario se descuenta al confirmar." />

      {products.error ? (
        <ErrorBox message={products.error} onRetry={products.reload} />
      ) : !products.data ? (
        <Loading />
      ) : sellable.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Pizza}
            title="No hay productos activos"
            text="Un administrador debe crear los productos y sus recetas antes de registrar ventas."
            action={
              can('products.edit') && (
                <button className="btn-primary" onClick={() => navigate('productos')}>
                  Ir a productos
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
                <input className="input pl-10" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
              </div>
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {['', ...categories].map((c) => (
                <button
                  key={c || 'todos'}
                  onClick={() => setCat(c)}
                  className={cx('chip shrink-0', cat === c ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400')}
                >
                  {c || 'Todos'}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="card">
                <EmptyState icon={Search} title="Sin resultados" text="Prueba con otro nombre o categoría." />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visible.map((p) => {
                  const n = cart.get(p.id) ?? 0;
                  const blocked = p.warnings.length > 0;
                  const Icon = p.type === 'directo' ? CupSoda : Pizza;
                  return (
                    <button
                      key={p.id}
                      disabled={blocked}
                      onClick={() => setQty(p.id, n + 1)}
                      className={cx(
                        'group relative flex min-h-[8.5rem] flex-col rounded-2xl border bg-white p-4 text-left shadow-card transition-all',
                        n > 0 ? 'border-brand-500 ring-4 ring-brand-100' : 'border-cream-300/70 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop',
                        blocked && 'cursor-not-allowed opacity-50 hover:translate-y-0',
                      )}
                    >
                      <span className={cx('grid size-10 place-items-center rounded-xl transition-colors', n > 0 ? 'bg-brand-600 text-white' : p.type === 'directo' ? 'bg-sky-50 text-sky-700' : 'bg-brand-50 text-brand-600')}>
                        <Icon className="size-5" />
                      </span>
                      <span className="mt-3 text-sm leading-snug font-semibold text-ink-900">{p.name}</span>
                      <span className="mt-auto pt-1 text-xs text-ink-500">{blocked ? 'No disponible: falta configurar' : p.category}</span>
                      {n > 0 && (
                        <span className="absolute top-3 right-3 grid min-w-7 animate-pop place-items-center rounded-full bg-brand-600 px-2 py-0.5 text-sm font-bold text-white tabular-nums">
                          {n}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="card sticky top-6 hidden h-[calc(100dvh-8rem)] max-h-[44rem] overflow-hidden lg:block">{summary}</aside>
        </div>
      )}

      {/* Barra inferior con el resumen en celular */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-[3.75rem] z-20 px-4 pb-3 lg:hidden">
          <button className="btn-primary w-full justify-between rounded-2xl px-5 py-4 shadow-pop" onClick={() => setMobileCart(true)}>
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" /> {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}
            </span>
            <span className="flex items-center gap-1">
              Ver resumen <ArrowRight className="size-4" />
            </span>
          </button>
        </div>
      )}
      {mobileCart && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileCart(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] animate-fade-up flex-col rounded-t-3xl bg-white">
            <button className="absolute top-3 right-3 z-10 btn-ghost p-2" onClick={() => setMobileCart(false)} aria-label="Cerrar">
              <X className="size-5" />
            </button>
            {summary}
          </div>
        </div>
      )}

      {/* Confirmación con el detalle de lo que se descontará */}
      <Modal
        open={!!preview}
        onClose={() => !saving && setPreview(null)}
        size="lg"
        title={preview?.ok ? 'Confirmar venta' : 'Existencias insuficientes'}
        subtitle={preview?.ok ? 'Revisa los productos y lo que se descontará del inventario.' : 'No se puede registrar la venta hasta reponer lo que falta.'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPreview(null)} disabled={saving}>
              Volver
            </button>
            {preview?.ok && (
              <button className="btn-primary" onClick={confirm} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirmar venta
              </button>
            )}
          </>
        }
      >
        {preview && (
          <div className="space-y-5">
            {!preview.ok && (
              <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brand-700" />
                <div>
                  <p className="font-semibold">Faltan ingredientes:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.shortages.map((s) => (
                      <li key={s.item_id}>
                        <b>{s.item_name}</b>: se necesitan {qtyText(s, 'needed_m')} y hay {qtyText(s, 'available_m')} (faltan {qtyText(s, 'short_m')}).
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div>
              <p className="label">Productos ({preview.totalUnits} unidades)</p>
              <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-200">
                {preview.items.map((i) => (
                  <li key={i.productId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium text-ink-900">{i.name}</span>
                    <span className="font-bold tabular-nums">× {i.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label">Se descontará del inventario</p>
              <div className="overflow-hidden rounded-2xl border border-cream-200">
                <table className="w-full text-sm">
                  <thead className="bg-cream-50">
                    <tr>
                      <th className="th-cell py-2">Ingrediente</th>
                      <th className="th-cell py-2 text-right">Descuento</th>
                      <th className="th-cell hidden py-2 text-right sm:table-cell">Disponible</th>
                      <th className="th-cell py-2 text-right">Quedará</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-200">
                    {preview.requirements.map((r) => (
                      <tr key={r.item_id} className={r.short_m > 0 ? 'bg-brand-50/60' : undefined}>
                        <td className="px-4 py-2 font-medium">{r.item_name}</td>
                        <td className="px-4 py-2 text-right font-semibold text-brand-700 tabular-nums">−{qtyText(r, 'needed_m')}</td>
                        <td className="hidden px-4 py-2 text-right text-ink-500 tabular-nums sm:table-cell">{qtyText(r, 'available_m')}</td>
                        <td className={cx('px-4 py-2 text-right font-semibold tabular-nums', r.short_m > 0 ? 'text-brand-800' : 'text-ink-900')}>
                          {r.short_m > 0 ? 'Insuficiente' : qtyText(r, 'after_m')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Venta registrada */}
      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        size="sm"
        title="¡Venta registrada!"
        footer={
          <>
            <button className="btn-secondary" onClick={() => navigate('historial', { venta: done!.id })}>
              Ver detalle
            </button>
            <button className="btn-primary" onClick={() => setDone(null)}>
              <Plus className="size-4" /> Nueva venta
            </button>
          </>
        }
      >
        {done && (
          <div className="flex flex-col items-center text-center">
            <span className="grid size-16 animate-pop place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-9" />
            </span>
            <p className="mt-4 text-sm text-ink-700">
              Se registraron <b>{done.total_units} unidades</b> y el inventario se actualizó.
            </p>
            <p className="mt-1 text-xs text-ink-500">Venta #{done.id.slice(0, 8).toUpperCase()}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
