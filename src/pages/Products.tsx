import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Pizza, CupSoda, Pencil, Power, Trash2, AlertTriangle, Loader2, Search, ChefHat } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useApp } from '../lib/app';
import { PRODUCT_CATEGORIES, type Item, type Product } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, EmptyState, DemoTag, Badge, Modal, ConfirmModal, Field, Segmented, cx } from '../components/ui';
import { UNIT_SHORT, formatQty, fromMilli, unitsFor, type Unit } from '../../shared/units.ts';

export default function Products() {
  const { bump } = useApp();
  const toast = useToast();
  const products = useApi<Product[]>('/products');
  const [editing, setEditing] = useState<{ product?: Product } | null>(null);
  const [toggle, setToggle] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const list = useMemo(
    () =>
      (products.data ?? []).filter((p) => (showInactive || p.active) && (!q || p.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [products.data, q, showInactive],
  );
  const incomplete = (products.data ?? []).filter((p) => p.active && p.warnings.length);

  const doToggle = async () => {
    if (!toggle) return;
    setBusy(true);
    try {
      await api.post(`/products/${toggle.id}/active`, { active: !toggle.active });
      toast.success(toggle.active ? 'Producto desactivado' : 'Producto reactivado', toggle.name);
      setToggle(null);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Productos y recetas"
        subtitle="Define qué ingredientes y cantidades consume cada producto al venderse."
        actions={
          <button className="btn-primary" onClick={() => setEditing({})}>
            <Plus className="size-4" /> Nuevo producto
          </button>
        }
      />

      {incomplete.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p>
            <b>{incomplete.length === 1 ? 'Un producto necesita' : `${incomplete.length} productos necesitan`} atención</b> y no se pueden vender hasta corregirlo:{' '}
            {incomplete.map((p) => p.name).join(', ')}.
          </p>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-10" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-500">
          <input type="checkbox" className="accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivos
        </label>
      </div>

      {products.error ? (
        <ErrorBox message={products.error} onRetry={products.reload} />
      ) : !products.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Pizza}
            title={products.data.length ? 'No hay resultados' : 'Todavía no hay productos'}
            text={products.data.length ? 'Prueba con otro nombre.' : 'Crea tus pizzas y bebidas. Primero registra los ingredientes en el inventario para poder armar las recetas.'}
            action={
              !products.data.length && (
                <button className="btn-primary" onClick={() => setEditing({})}>
                  <Plus className="size-4" /> Crear el primer producto
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const Icon = p.type === 'directo' ? CupSoda : Pizza;
            return (
              <article key={p.id} className={cx('card flex flex-col p-5 transition-all hover:shadow-pop', !p.active && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', p.type === 'directo' ? 'bg-sky-50 text-sky-700' : 'bg-brand-50 text-brand-600')}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg leading-tight font-semibold text-ink-900">{p.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{p.category}</Badge>
                      <Badge tone={p.type === 'directo' ? 'neutral' : 'red'}>{p.type === 'directo' ? 'Venta directa' : 'Preparado'}</Badge>
                      {!p.active && <Badge tone="dark">Inactivo</Badge>}
                      {p.is_demo && <DemoTag />}
                    </div>
                  </div>
                </div>
                {p.description && <p className="mt-3 text-sm text-ink-500">{p.description}</p>}

                <div className="mt-4 flex-1 rounded-xl bg-cream-50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                    <ChefHat className="size-3.5" /> {p.type === 'directo' ? 'Descuenta del inventario' : 'Receta por unidad'}
                  </p>
                  {p.recipe.length === 0 ? (
                    <p className="text-sm text-ink-400">Sin configurar</p>
                  ) : (
                    <ul className="space-y-1">
                      {p.recipe.map((l) => (
                        <li key={l.item_id} className="flex justify-between gap-2 text-sm">
                          <span className={cx('truncate', l.item_active ? 'text-ink-700' : 'text-brand-700 line-through')}>{l.item_name}</span>
                          <span className="font-semibold text-ink-900 tabular-nums">{formatQty(l.qty_m, l.unit)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {p.warnings.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" /> {p.warnings.join(' ')}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary btn-sm flex-1" onClick={() => setEditing({ product: p })}>
                    <Pencil className="size-4" /> {p.type === 'directo' ? 'Editar' : 'Editar receta'}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setToggle(p)} title={p.active ? 'Desactivar' : 'Reactivar'}>
                    <Power className="size-4" /> {p.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && <ProductEditor product={editing.product} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={!!toggle}
        onClose={() => setToggle(null)}
        onConfirm={doToggle}
        busy={busy}
        danger={toggle?.active}
        title={toggle?.active ? 'Desactivar producto' : 'Reactivar producto'}
        confirmText={toggle?.active ? 'Desactivar' : 'Reactivar'}
      >
        {toggle?.active ? (
          <>
            <b>{toggle?.name}</b> ya no aparecerá al registrar ventas. Su historial de ventas se conserva intacto.
          </>
        ) : (
          <>
            <b>{toggle?.name}</b> volverá a estar disponible para vender.
          </>
        )}
      </ConfirmModal>
    </>
  );
}

interface LineDraft {
  key: number;
  itemId: string;
  qty: string;
  unit: Unit;
}
let lineKey = 1;

function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/items');
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? 'Pizzas');
  const [type, setType] = useState<'preparado' | 'directo'>(product?.type ?? 'preparado');
  const [description, setDescription] = useState(product?.description ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    product?.recipe.map((l) => ({ key: lineKey++, itemId: String(l.item_id), qty: String(fromMilli(l.qty_m, l.unit)), unit: l.unit })) ?? [
      { key: lineKey++, itemId: '', qty: '', unit: 'g' },
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItems = (items.data ?? []).filter((i) => i.active || lines.some((l) => l.itemId === String(i.id)));
  const byId = new Map(activeItems.map((i) => [String(i.id), i]));
  const used = new Set(lines.map((l) => l.itemId));

  const changeType = (t: 'preparado' | 'directo') => {
    setType(t);
    if (t === 'directo') {
      setLines((ls) => [{ ...(ls[0] ?? { key: lineKey++, itemId: '' }), qty: '1', unit: 'unidad' }]);
      if (category === 'Pizzas') setCategory('Bebidas');
    }
  };

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.itemId) {
          const it = byId.get(patch.itemId);
          // Unidad sugerida: g para kg, ml para l, unidades para unidades.
          if (it) next.unit = it.base_unit === 'g' ? 'g' : it.base_unit === 'ml' ? 'ml' : 'unidad';
          if (it && type === 'directo') next.qty = '1';
        }
        return next;
      }),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const recipe = lines
      .filter((l) => l.itemId)
      .map((l) => ({ item_id: Number(l.itemId), qty: Number(l.qty.replace(',', '.')), unit: l.unit }));
    if (recipe.some((r) => !Number.isFinite(r.qty) || r.qty <= 0)) {
      setError('Todas las cantidades deben ser mayores que cero.');
      return;
    }
    if (new Set(recipe.map((r) => r.item_id)).size !== recipe.length) {
      setError('Hay ingredientes repetidos. Usa una sola línea por ingrediente.');
      return;
    }
    setBusy(true);
    try {
      const body = { name, category, type, description, recipe };
      const saved = product ? await api.put<Product>(`/products/${product.id}`, body) : await api.post<Product>('/products', body);
      if (saved.warnings.length) toast.warning('Producto guardado con avisos', saved.warnings.join(' '));
      else toast.success(product ? 'Producto actualizado' : 'Producto creado', saved.name);
      bump();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={product ? `Editar: ${product.name}` : 'Nuevo producto'}
      subtitle="Los cambios en la receta solo afectan las ventas futuras; el historial conserva las cantidades usadas."
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="product-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar producto
          </button>
        </>
      }
    >
      {!items.data ? (
        <Loading />
      ) : (
        <form id="product-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nombre">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ej. Pizza de pepperoni" />
              </Field>
            </div>
            <Field label="Categoría">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">Tipo de producto</span>
              <Segmented
                value={type}
                onChange={changeType}
                options={[
                  { value: 'preparado', label: 'Preparado (receta)' },
                  { value: 'directo', label: 'Venta directa' },
                ]}
              />
            </div>
            <div className="sm:col-span-2">
              <Field label="Descripción (opcional)">
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
              </Field>
            </div>
          </div>

          <div>
            <p className="label">{type === 'directo' ? 'Artículo del inventario que se descuenta' : 'Receta: ingredientes por cada unidad vendida'}</p>
            {activeItems.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Primero registra ingredientes en el Inventario para poder armar la receta.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => {
                  const it = byId.get(l.itemId);
                  return (
                    <div key={l.key} className="grid grid-cols-[1fr_5.5rem_4.5rem_auto] items-center gap-2 rounded-xl bg-cream-50 p-2 sm:grid-cols-[1fr_7rem_6rem_auto]">
                      <select className="input" value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })} aria-label="Ingrediente" required={type === 'directo'}>
                        <option value="">Elegir…</option>
                        {activeItems.map((i) => (
                          <option key={i.id} value={i.id} disabled={used.has(String(i.id)) && l.itemId !== String(i.id)}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => update(l.key, { qty: e.target.value })}
                        placeholder="Cant."
                        aria-label="Cantidad"
                        required={!!l.itemId}
                        disabled={type === 'directo'}
                      />
                      <select className="input px-2" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value as Unit })} aria-label="Unidad" disabled={!it || type === 'directo'}>
                        {(it ? unitsFor(it.base_unit) : (['g'] as Unit[])).map((u) => (
                          <option key={u} value={u}>
                            {UNIT_SHORT[u]}
                          </option>
                        ))}
                      </select>
                      {type === 'preparado' ? (
                        <button type="button" className="btn-ghost p-2 text-ink-400 hover:text-brand-700" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar ingrediente">
                          <Trash2 className="size-4" />
                        </button>
                      ) : (
                        <span className="w-8" />
                      )}
                    </div>
                  );
                })}
                {type === 'preparado' && (
                  <button type="button" className="btn-ghost btn-sm text-brand-700" onClick={() => setLines((ls) => [...ls, { key: lineKey++, itemId: '', qty: '', unit: 'g' }])}>
                    <Plus className="size-4" /> Agregar ingrediente
                  </button>
                )}
              </div>
            )}
            {type === 'preparado' && lines.filter((l) => l.itemId).length === 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="size-4 text-amber-600" /> Sin receta, este producto no se podrá vender.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
