import { useMemo, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  PackagePlus,
  SlidersHorizontal,
  Pencil,
  History,
  Power,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';
import { api } from '../lib/api';
import { navigate, useApi, useApp, useHashRoute } from '../lib/app';
import { ITEM_CATEGORIES, type Item, type Movement, type MovementType } from '../lib/types';
import { useToast } from '../components/toast';
import {
  PageHeader,
  Loading,
  ErrorBox,
  EmptyState,
  StockBadge,
  DemoTag,
  Badge,
  Modal,
  ConfirmModal,
  Field,
  Segmented,
  Pagination,
  cx,
} from '../components/ui';
import { UNIT_LABELS, UNIT_SHORT, formatQty, fromMilli, toMilli, unitsFor, type Unit, type StockStatus } from '../../shared/units.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { ITEM_KINDS, KIND_LABELS, LOCATIONS, formatPacks, type ItemKind, type Location } from '../../shared/kitchen.ts';

const PAGE = 12;

type Sort = 'nombre' | 'nombre-desc' | 'cantidad' | 'cantidad-desc';

const MOV_LABEL: Record<MovementType, { label: string; tone: 'green' | 'red' | 'amber' | 'neutral' | 'dark' }> = {
  inicial: { label: 'Existencia inicial', tone: 'neutral' },
  entrada: { label: 'Entrada', tone: 'green' },
  ajuste: { label: 'Ajuste', tone: 'amber' },
  venta: { label: 'Venta', tone: 'red' },
  anulacion: { label: 'Anulación', tone: 'dark' },
  produccion: { label: 'Preparación', tone: 'neutral' },
  baja: { label: 'Baja', tone: 'red' },
  conteo: { label: 'Conteo', tone: 'amber' },
};

function StockBar({ item }: { item: Item }) {
  // Barra relativa a 3 veces el mínimo: muestra de un vistazo qué tan lejos está de la alerta.
  const ref = Math.max(item.min_m * 3, 1);
  const pct = Math.min(100, (item.qty_m / ref) * 100);
  const color = item.status === 'agotado' ? 'bg-brand-800' : item.status === 'bajo' ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-cream-200">
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Inventory() {
  const { can, bump } = useApp();
  const toast = useToast();
  const route = useHashRoute();
  const items = useApi<Item[]>('/items');
  const [tab, setTab] = useState<'stock' | 'movs'>('stock');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [loc, setLoc] = useState<Location | ''>('');
  const routeStatus = (route.params.get('estado') as StockStatus | null) ?? '';
  const [status, setStatus] = useState<StockStatus | ''>(routeStatus);
  const [prevRouteStatus, setPrevRouteStatus] = useState(routeStatus);
  if (routeStatus !== prevRouteStatus) {
    setPrevRouteStatus(routeStatus);
    if (routeStatus) setStatus(routeStatus);
  }

  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<Sort>('nombre');
  const [page, setPage] = useState(1);
  const filterKey = `${q}|${cat}|${loc}|${status}|${showInactive}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const [form, setForm] = useState<{ item?: Item } | null>(null);
  const [entry, setEntry] = useState<Item | null>(null);
  const [adjust, setAdjust] = useState<Item | null>(null);
  const [toggle, setToggle] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const detailId = Number(route.params.get('item')) || null;
  const detail = items.data?.find((i) => i.id === detailId) ?? null;

  const filtered = useMemo(() => {
    const list = (items.data ?? []).filter((i) => {
      if (!showInactive && !i.active) return false;
      if (cat && i.category !== cat) return false;
      if (loc && i.location !== loc) return false;
      if (status && (i.status !== status || !i.active)) return false;
      if (q && !i.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
    const by = {
      nombre: (a: Item, b: Item) => a.name.localeCompare(b.name, 'es'),
      'nombre-desc': (a: Item, b: Item) => b.name.localeCompare(a.name, 'es'),
      cantidad: (a: Item, b: Item) => a.qty_m - b.qty_m,
      'cantidad-desc': (a: Item, b: Item) => b.qty_m - a.qty_m,
    }[sort];
    return list.sort(by);
  }, [items.data, q, cat, loc, status, showInactive, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);
  const closeDetail = () => navigate('inventario');

  const doToggle = async () => {
    if (!toggle) return;
    setBusy(true);
    try {
      await api.post(`/items/${toggle.id}/active`, { active: !toggle.active });
      toast.success(toggle.active ? 'Artículo desactivado' : 'Artículo reactivado', toggle.name);
      setToggle(null);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const actions = (i: Item) => (
    <div className="flex items-center justify-end gap-1">
      {can('inventory.entry') && i.active && (
        <button className="btn-secondary btn-sm" onClick={() => setEntry(i)} title="Registrar entrada">
          <PackagePlus className="size-4" /> <span className="hidden xl:inline">Entrada</span>
        </button>
      )}
      <RowMenu
        options={[
          { label: 'Ver movimientos', icon: History, onClick: () => navigate('inventario', { item: i.id }) },
          ...(can('inventory.adjust') && i.active ? [{ label: 'Ajuste manual', icon: SlidersHorizontal, onClick: () => setAdjust(i) }] : []),
          ...(can('inventory.edit') ? [{ label: 'Editar', icon: Pencil, onClick: () => setForm({ item: i }) }] : []),
          ...(can('inventory.edit') ? [{ label: i.active ? 'Desactivar' : 'Reactivar', icon: Power, onClick: () => setToggle(i), danger: i.active }] : []),
        ]}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="Insumos y preparaciones por nevera. Cada cambio queda registrado como un movimiento."
        actions={
          can('inventory.edit') && (
            <button className="btn-primary" onClick={() => setForm({})}>
              <Plus className="size-4" /> Nuevo artículo
            </button>
          )
        }
      />

      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stock', label: 'Existencias' },
            { value: 'movs', label: 'Movimientos' },
          ]}
        />
      </div>

      {tab === 'movs' ? (
        <MovementsTable />
      ) : items.error ? (
        <ErrorBox message={items.error} onRetry={items.reload} />
      ) : !items.data ? (
        <Loading />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid gap-3 border-b border-cream-200 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
              <input className="input pl-10" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
            </div>
            <select className="input lg:w-44" value={loc} onChange={(e) => setLoc(e.target.value as Location | '')} aria-label="Ubicación">
              <option value="">Todas las ubicaciones</option>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <select className="input lg:w-48" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {ITEM_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="input lg:w-48" value={status} onChange={(e) => setStatus(e.target.value as StockStatus | '')} aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="disponible">Disponible</option>
              <option value="bajo">Bajo</option>
              <option value="agotado">Agotado</option>
            </select>
            <select className="input lg:w-44" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
              <option value="nombre">Nombre (A–Z)</option>
              <option value="nombre-desc">Nombre (Z–A)</option>
              <option value="cantidad">Cantidad (menor primero)</option>
              <option value="cantidad-desc">Cantidad (mayor primero)</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-ink-500">
            <span>
              {filtered.length} {filtered.length === 1 ? 'artículo' : 'artículos'}
            </span>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-brand-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Mostrar desactivados
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title={items.data.length ? 'No hay resultados' : 'El inventario está vacío'}
              text={items.data.length ? 'Prueba con otro nombre o quita los filtros.' : 'Agrega tus ingredientes, bebidas y empaques con su cantidad disponible y su mínimo de alerta.'}
              action={
                !items.data.length && can('inventory.edit') ? (
                  <button className="btn-primary" onClick={() => setForm({})}>
                    <Plus className="size-4" /> Agregar el primer artículo
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Tabla (pantallas medianas y grandes) */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="bg-cream-50">
                    <tr>
                      <th className="th-cell">Artículo</th>
                      <th className="th-cell">Ubicación</th>
                      <th className="th-cell">Disponible</th>
                      <th className="th-cell">Mínimo</th>
                      <th className="th-cell">Estado</th>
                      <th className="th-cell hidden xl:table-cell">Actualizado</th>
                      <th className="th-cell" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-200">
                    {visible.map((i) => (
                      <tr key={i.id} className={cx('transition-colors hover:bg-cream-50', !i.active && 'opacity-55')}>
                        <td className="td-cell">
                          <button className="text-left font-semibold text-ink-900 hover:text-brand-700" onClick={() => navigate('inventario', { item: i.id })}>
                            {i.name}
                          </button>
                          <div className="mt-0.5 flex gap-1">
                            {i.kind === 'preparacion' && <Badge tone="amber">Preparación</Badge>}
                            {i.is_demo && <DemoTag />}
                            {!i.active && <Badge>Desactivado</Badge>}
                          </div>
                        </td>
                        <td className="td-cell text-ink-500">
                          {i.location}
                          <span className="block text-xs text-ink-400">{i.category}</span>
                        </td>
                        <td className="td-cell">
                          <span className="font-semibold tabular-nums">{formatQty(i.qty_m, i.unit)}</span>
                          {i.pack_size_m > 0 && <span className="block text-xs text-ink-500">{formatPacks(i.qty_m, i.pack_size_m, i.pack_label, i.unit)}</span>}
                          <StockBar item={i} />
                        </td>
                        <td className="td-cell text-ink-500 tabular-nums">{formatQty(i.min_m, i.unit)}</td>
                        <td className="td-cell">{i.active ? <StockBadge status={i.status} /> : <Badge>—</Badge>}</td>
                        <td className="td-cell hidden whitespace-nowrap text-xs text-ink-500 xl:table-cell">{formatDateTime(i.updated_at)}</td>
                        <td className="td-cell">{actions(i)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Tarjetas (celular) */}
              <ul className="divide-y divide-cream-200 md:hidden">
                {visible.map((i) => (
                  <li key={i.id} className={cx('flex items-center gap-3 px-4 py-3.5', !i.active && 'opacity-55')}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => navigate('inventario', { item: i.id })}>
                      <p className="flex items-center gap-1.5 truncate font-semibold text-ink-900">
                        {i.name} {i.is_demo && <DemoTag />}
                      </p>
                      <p className="text-xs text-ink-500">
                        {i.location} · {i.kind === 'preparacion' ? 'preparación' : i.category}
                      </p>
                      <p className="mt-1 text-sm">
                        <b className="tabular-nums">{formatQty(i.qty_m, i.unit)}</b> <span className="text-xs text-ink-500">· mín. {formatQty(i.min_m, i.unit)}</span>
                      </p>
                    </button>
                    <div className="flex flex-col items-end gap-2">
                      {i.active ? <StockBadge status={i.status} /> : <Badge>Desactivado</Badge>}
                      {actions(i)}
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pages={pages} onChange={setPage} />
            </>
          )}
        </div>
      )}

      {form && <ItemForm item={form.item} onClose={() => setForm(null)} />}
      {entry && <EntryForm item={entry} onClose={() => setEntry(null)} />}
      {adjust && <AdjustForm item={adjust} onClose={() => setAdjust(null)} />}
      {detail && (
        <ItemDetail
          item={detail}
          onClose={closeDetail}
          onEntry={can('inventory.entry') && detail.active ? () => setEntry(detail) : undefined}
          onAdjust={can('inventory.adjust') && detail.active ? () => setAdjust(detail) : undefined}
          onEdit={can('inventory.edit') ? () => setForm({ item: detail }) : undefined}
        />
      )}
      <ConfirmModal
        open={!!toggle}
        onClose={() => setToggle(null)}
        onConfirm={doToggle}
        busy={busy}
        danger={toggle?.active}
        title={toggle?.active ? 'Desactivar artículo' : 'Reactivar artículo'}
        confirmText={toggle?.active ? 'Desactivar' : 'Reactivar'}
      >
        {toggle?.active ? (
          <>
            <b>{toggle?.name}</b> dejará de aparecer en el inventario activo y en las alertas. Su historial de movimientos se conserva.
          </>
        ) : (
          <>
            <b>{toggle?.name}</b> volverá a estar disponible en el inventario.
          </>
        )}
      </ConfirmModal>
    </>
  );
}

function RowMenu({ options }: { options: { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  if (!options.length) return null;
  return (
    <div className="relative">
      <button className="btn-ghost btn-sm px-2" onClick={() => setOpen((o) => !o)} aria-label="Más acciones" aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 animate-pop overflow-hidden rounded-xl border border-cream-300 bg-white py-1 shadow-pop">
            {options.map((o) => (
              <button
                key={o.label}
                onClick={() => {
                  setOpen(false);
                  o.onClick();
                }}
                className={cx('flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-cream-100', o.danger ? 'text-brand-700' : 'text-ink-700')}
              >
                <o.icon className="size-4" /> {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function numInput(v: string) {
  return v.replace(',', '.');
}

function ItemForm({ item, onClose }: { item?: Item; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? 'Ingredientes');
  const [unit, setUnit] = useState<Unit>(item?.unit ?? 'kg');
  const [qty, setQty] = useState('');
  const [min, setMin] = useState(item ? String(fromMilli(item.min_m, item.unit)) : '');
  const [location, setLocation] = useState<Location>(item?.location ?? 'Nevera Coca-Cola');
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'insumo');
  const packUnitOf = (u: Unit): Unit => (u === 'kg' ? 'g' : u === 'l' ? 'ml' : u);
  const [packSize, setPackSize] = useState(item && item.pack_size_m > 0 ? String(fromMilli(item.pack_size_m, packUnitOf(item.unit))) : '');
  const [packLabel, setPackLabel] = useState(item?.pack_label || 'paquete');
  const [busy, setBusy] = useState(false);

  // Al editar solo se puede cambiar a una unidad compatible (kg ↔ g, l ↔ ml).
  const unitOptions: Unit[] = item ? unitsFor(item.base_unit) : ['g', 'kg', 'ml', 'l', 'unidad'];
  const packUnit = packUnitOf(unit);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const kitchen = {
      location,
      kind,
      pack_size: packSize ? Number(numInput(packSize)) : null,
      pack_unit: packUnit,
      pack_label: packLabel,
    };
    try {
      if (item) {
        await api.put(`/items/${item.id}`, { name, category, unit, min: Number(numInput(min || '0')), ...kitchen });
        toast.success('Cambios guardados', name);
      } else {
        await api.post('/items', { name, category, unit, qty: Number(numInput(qty || '0')), min: Number(numInput(min || '0')), ...kitchen });
        toast.success('Artículo creado', name);
      }
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
      title={item ? 'Editar artículo' : 'Nuevo artículo de inventario'}
      subtitle={item ? 'Para cambiar la existencia usa “Entrada” o “Ajuste manual”.' : undefined}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="btn-primary" form="item-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nombre">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ej. Queso mozzarella" />
          </Field>
        </div>
        <Field label="Categoría">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Unidad de medida" hint={item ? 'Solo unidades compatibles.' : 'Los cálculos se hacen en g, ml o unidades.'}>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Field>
        {!item && (
          <Field label={`Cantidad inicial (${UNIT_SHORT[unit]})`} hint="Lo que hay hoy en bodega.">
            <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" pattern="[0-9]+([.,][0-9]+)?" />
          </Field>
        )}
        <Field label={`Mínimo de alerta (${UNIT_SHORT[unit]})`} hint="Avisa cuando la existencia llegue a este valor.">
          <input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" pattern="[0-9]+([.,][0-9]+)?" />
        </Field>
        <Field label="¿Dónde se guarda?" hint="Así se ordena la hoja de conteo.">
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value as Location)}>
            {LOCATIONS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Presentación para contar (opcional)</span>
          <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-sm">
            <span className="text-ink-500">1</span>
            <input className="input" value={packLabel} onChange={(e) => setPackLabel(e.target.value)} maxLength={30} placeholder="paquete" aria-label="Nombre de la presentación" />
            <span className="text-ink-500">=</span>
            <div className="flex items-center gap-2">
              <input className="input tabular-nums" inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="Ej. 500" pattern="[0-9]+([.,][0-9]+)?" aria-label="Tamaño" />
              <span className="font-semibold text-ink-500">{UNIT_SHORT[packUnit]}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Si viene en paquetes, la cocina cuenta «3 paquetes + 385 g» y el sistema hace la cuenta.
            {packSize && Number(numInput(packSize)) > 0 && item && (
              <> Hoy hay {formatPacks(item.qty_m, toMilli(Number(numInput(packSize)), packUnit), packLabel, unit)}.</>
            )}
          </p>
        </div>
      </form>
    </Modal>
  );
}

export function EntryForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>(item.unit);
  const [reason, setReason] = useState('Compra a proveedor');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.post<Item>(`/items/${item.id}/entry`, { qty: Number(numInput(qty)), unit, reason });
      toast.success('Entrada registrada', `${item.name}: ahora hay ${formatQty(updated.qty_m, updated.unit)}`);
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
      title="Registrar entrada de mercancía"
      subtitle={
        <>
          {item.name} · disponible ahora: <b>{formatQty(item.qty_m, item.unit)}</b>
        </>
      }
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="btn-primary" form="entry-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Registrar entrada
          </button>
        </>
      }
    >
      <form id="entry-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Cantidad que entra">
            <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required pattern="[0-9]*([.,][0-9]+)?" placeholder="0" />
          </Field>
          <Field label="Unidad">
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {unitsFor(item.base_unit).map((u) => (
                <option key={u} value={u}>
                  {UNIT_SHORT[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Motivo o referencia">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} />
        </Field>
      </form>
    </Modal>
  );
}

function AdjustForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState<'set' | 'delta'>('set');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<Unit>(item.unit);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.post<Item>(`/items/${item.id}/adjust`, { mode, value: Number(numInput(value)), unit, reason });
      toast.success('Ajuste registrado', `${item.name}: ahora hay ${formatQty(updated.qty_m, updated.unit)}`);
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
      title="Ajuste manual de inventario"
      subtitle={
        <>
          {item.name} · disponible ahora: <b>{formatQty(item.qty_m, item.unit)}</b>
        </>
      }
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="btn-primary" form="adjust-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar ajuste
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'set', label: 'Fijar conteo físico' },
            { value: 'delta', label: 'Sumar / restar' },
          ]}
        />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={mode === 'set' ? 'Cantidad contada' : 'Cantidad (usa “-” para restar)'}>
            <input
              className="input"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              pattern={mode === 'set' ? '[0-9]*([.,][0-9]+)?' : '-?[0-9]*([.,][0-9]+)?'}
              placeholder={mode === 'set' ? '0' : '-0,5'}
            />
          </Field>
          <Field label="Unidad">
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {unitsFor(item.base_unit).map((u) => (
                <option key={u} value={u}>
                  {UNIT_SHORT[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Motivo (obligatorio)" hint="Ej. merma, producto vencido, error de conteo.">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} />
        </Field>
      </form>
    </Modal>
  );
}

function MovementRow({ m, showItem }: { m: Movement; showItem?: boolean }) {
  const t = MOV_LABEL[m.type];
  const positive = m.delta_m > 0;
  return (
    <li className="flex items-start gap-3 py-3">
      {positive ? <ArrowUpCircle className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <ArrowDownCircle className="mt-0.5 size-5 shrink-0 text-brand-600" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {showItem && <span className="text-sm font-semibold text-ink-900">{m.item_name}</span>}
          <Badge tone={t.tone}>{t.label}</Badge>
          {m.is_demo ? <DemoTag /> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-700">{m.reason}</p>
        <p className="text-xs text-ink-500">
          {formatDateTime(m.created_at)} · {m.user_name}
        </p>
      </div>
      <div className="text-right">
        <p className={cx('text-sm font-bold tabular-nums', positive ? 'text-emerald-700' : 'text-brand-700')}>
          {positive ? '+' : '−'}
          {formatQty(Math.abs(m.delta_m), m.unit)}
        </p>
        <p className="text-xs text-ink-500 tabular-nums">queda {formatQty(m.after_m, m.unit)}</p>
      </div>
    </li>
  );
}

function ItemDetail({ item, onClose, onEntry, onAdjust, onEdit }: { item: Item; onClose: () => void; onEntry?: () => void; onAdjust?: () => void; onEdit?: () => void }) {
  const movs = useApi<Movement[]>(`/movements?itemId=${item.id}&limit=100`, [item.id]);
  return (
    <Modal open onClose={onClose} title={item.name} subtitle={`${item.category} · creado ${formatDateTime(item.created_at)}`} size="lg">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-cream-100 p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase">Disponible</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatQty(item.qty_m, item.unit)}</p>
        </div>
        <div className="rounded-2xl bg-cream-100 p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase">Mínimo de alerta</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatQty(item.min_m, item.unit)}</p>
        </div>
        <div className="rounded-2xl bg-cream-100 p-4">
          <p className="text-xs font-semibold text-ink-500 uppercase">Estado</p>
          <div className="mt-2">{item.active ? <StockBadge status={item.status} /> : <Badge>Desactivado</Badge>}</div>
          <p className="mt-2 text-xs text-ink-500">Actualizado {formatDateTime(item.updated_at)}</p>
        </div>
      </div>
      {(onEntry || onAdjust || onEdit) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onEntry && (
            <button className="btn-primary btn-sm" onClick={onEntry}>
              <PackagePlus className="size-4" /> Registrar entrada
            </button>
          )}
          {onAdjust && (
            <button className="btn-secondary btn-sm" onClick={onAdjust}>
              <SlidersHorizontal className="size-4" /> Ajuste manual
            </button>
          )}
          {onEdit && (
            <button className="btn-secondary btn-sm" onClick={onEdit}>
              <Pencil className="size-4" /> Editar
            </button>
          )}
        </div>
      )}
      <h3 className="mt-6 mb-1 font-display text-base font-semibold">Movimientos</h3>
      {!movs.data ? (
        <Loading />
      ) : movs.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">Sin movimientos.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {movs.data.map((m) => (
            <MovementRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function MovementsTable() {
  const [type, setType] = useState<MovementType | ''>('');
  const movs = useApi<Movement[]>(`/movements?limit=300${type ? `&type=${type}` : ''}`, [type]);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 p-4">
        <p className="text-sm text-ink-500">Últimos 300 movimientos de todos los artículos.</p>
        <select className="input sm:w-52" value={type} onChange={(e) => setType(e.target.value as MovementType | '')} aria-label="Tipo de movimiento">
          <option value="">Todos los tipos</option>
          {Object.entries(MOV_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div className="px-4">
        {movs.error ? (
          <ErrorBox message={movs.error} />
        ) : !movs.data ? (
          <Loading />
        ) : movs.data.length === 0 ? (
          <EmptyState icon={History} title="Sin movimientos" text="Las entradas, ajustes y ventas aparecerán aquí." />
        ) : (
          <ul className="divide-y divide-cream-200">
            {movs.data.map((m) => (
              <MovementRow key={m.id} m={m} showItem />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
