// Centro de control de cocina del administrador: lo que hay que autorizar, la lista de
// compras, las preparaciones (recetas de cocina) y el registro de lo que se preparó.
import { useMemo, useState, type FormEvent } from 'react';
import {
  ChefHat,
  Megaphone,
  Trash2,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Loader2,
  ShoppingCart,
  Copy,
  Send,
  PackagePlus,
  Plus,
  Pencil,
  Power,
  ChevronLeft,
  ChevronRight,
  Inbox,
  BookOpen,
  History as HistoryIcon,
  Undo2,
} from 'lucide-react';
import { api } from '../lib/api';
import { navigate, useApi, useApp, useHashRoute } from '../lib/app';
import type { Count, Item, Preparation, Production, ShoppingLine, Waste } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, EmptyState, Badge, DemoTag, Modal, ConfirmModal, Field, StockBadge, cx } from '../components/ui';
import { WastePhoto } from '../components/kitchen/ReportFlows';
import { efficiencyTone, LOCATION_ICONS } from '../components/kitchen/helpers';
import { FlowHost, type Flow } from '../components/kitchen/FlowHost';
import { EntryForm } from './Inventory';
import { baseOf, formatNumber, formatQty, fromMilli, niceUnit, toMilli, unitsFor, UNIT_SHORT, type Unit } from '../../shared/units.ts';
import { addDays, formatDateTime, formatTime, localDate, shortDate, shortDateDow, weekEnd, weekStart } from '../../shared/dates.ts';
import { SHORTAGE_LEVEL_LABELS, WASTE_REASON_LABELS, type PrepMode } from '../../shared/kitchen.ts';

type Tab = 'pendientes' | 'compras' | 'preparaciones' | 'registro';

export default function KitchenAdmin() {
  const route = useHashRoute();
  const tab = (route.params.get('tab') as Tab | null) ?? 'pendientes';
  const [flow, setFlow] = useState<Flow | null>(null);
  const pw = useApi<Waste[]>('/wastes?status=pendiente');
  const pc = useApi<Count[]>('/counts?status=pendiente');
  const shop = useApi<ShoppingLine[]>('/shopping-list');
  const pendingCount = (pw.data?.length ?? 0) + (pc.data?.length ?? 0);

  const tabs: { value: Tab; label: string; icon: typeof Inbox; badge?: number }[] = [
    { value: 'pendientes', label: 'Por autorizar', icon: Inbox, badge: pendingCount },
    { value: 'compras', label: 'Lista de compras', icon: ShoppingCart, badge: shop.data?.length },
    { value: 'preparaciones', label: 'Preparaciones', icon: BookOpen },
    { value: 'registro', label: 'Lo que se preparó', icon: HistoryIcon },
  ];

  return (
    <>
      <PageHeader
        title="Cocina"
        subtitle="Bajas y conteos por autorizar, faltantes, preparaciones y rendimiento."
        actions={
          <>
            <button className="btn-primary" onClick={() => setFlow({ kind: 'preparar' })}>
              <ChefHat className="size-4" /> Preparar
            </button>
            <button className="btn-secondary" onClick={() => setFlow({ kind: 'conteo' })}>
              <ClipboardList className="size-4" /> Contar
            </button>
            <button className="btn-secondary" onClick={() => setFlow({ kind: 'baja' })}>
              <Trash2 className="size-4" /> Baja
            </button>
            <button className="btn-secondary" onClick={() => setFlow({ kind: 'faltante' })}>
              <Megaphone className="size-4" /> Faltante
            </button>
          </>
        }
      />

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => navigate('cocina', { tab: t.value })}
              className={cx(
                'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all',
                active ? 'border-ink-900 bg-ink-900 text-white shadow-sm' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400/50',
              )}
            >
              <Icon className="size-4" /> {t.label}
              {!!t.badge && (
                <span className={cx('grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold', active ? 'bg-white text-ink-900' : 'bg-brand-600 text-white')}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'pendientes' && <PendingTab wastes={pw} counts={pc} />}
      {tab === 'compras' && <ShoppingTab list={shop} />}
      {tab === 'preparaciones' && <PreparationsTab />}
      {tab === 'registro' && <LogTab />}

      <FlowHost flow={flow} onClose={() => setFlow(null)} />
    </>
  );
}

type Loaded<T> = ReturnType<typeof useApi<T>>;

// ---------- Por autorizar ----------

function PendingTab({ wastes, counts }: { wastes: Loaded<Waste[]>; counts: Loaded<Count[]> }) {
  const recent = useApi<Waste[]>('/wastes?limit=20');
  const [reject, setReject] = useState<Waste | null>(null);
  const [review, setReview] = useState<Count | null>(null);
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const approve = async (w: Waste) => {
    setBusy(w.id);
    try {
      await api.post(`/wastes/${w.id}/review`, { decision: 'aprobar' });
      toast.success('Baja aprobada', `${w.item_name}: se descontaron ${formatQty(w.qty_m, w.unit)}`);
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  if (wastes.error) return <ErrorBox message={wastes.error} onRetry={wastes.reload} />;
  if (!wastes.data || !counts.data) return <Loading />;
  const none = wastes.data.length === 0 && counts.data.length === 0;

  return (
    <div className="space-y-6">
      {none && (
        <div className="card">
          <EmptyState icon={CheckCircle2} title="Nada por autorizar" text="Cuando la cocina reporte una baja o envíe un conteo, aparecerá aquí para que lo revises." />
        </div>
      )}

      {counts.data.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Conteos por revisar</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {counts.data.map((c) => {
              const Icon = LOCATION_ICONS[c.location];
              return (
                <article key={c.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-900">
                        {c.location} {c.is_demo ? <DemoTag /> : null}
                      </p>
                      <p className="text-xs text-ink-500">
                        {c.counted_by_name} · {formatDateTime(c.counted_at)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-700">
                    {c.lines_count} productos contados ·{' '}
                    {c.diff_count ? <b className="text-brand-700">{c.diff_count} no coinciden</b> : <b className="text-emerald-700">todo coincide</b>}
                  </p>
                  <button className="btn-primary btn-sm mt-auto" onClick={() => setReview(c)}>
                    Revisar diferencias
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {wastes.data.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Bajas por autorizar</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {wastes.data.map((w) => (
              <article key={w.id} className="card overflow-hidden">
                <WastePhoto id={w.id} className="h-44 w-full" />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink-900">
                      {w.item_name} {w.is_demo ? <DemoTag /> : null}
                    </p>
                    <span className="font-display text-lg font-semibold whitespace-nowrap text-brand-700 tabular-nums">−{formatQty(w.qty_m, w.unit)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="amber">{WASTE_REASON_LABELS[w.reason]}</Badge>
                  </div>
                  {w.note && <p className="text-sm text-ink-700">«{w.note}»</p>}
                  <p className="text-xs text-ink-500">
                    {w.reported_by_name} · {formatDateTime(w.reported_at)} · hay {formatQty(w.item_qty_m, w.item_unit)}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button className="btn-primary btn-sm flex-1" disabled={busy === w.id} onClick={() => void approve(w)}>
                      {busy === w.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Aprobar
                    </button>
                    <button className="btn-secondary btn-sm flex-1" onClick={() => setReject(w)}>
                      <XCircle className="size-4" /> Rechazar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {recent.data && recent.data.some((w) => w.status !== 'pendiente') && (
        <section className="card p-5">
          <h2 className="mb-2 font-display text-lg font-semibold">Últimas bajas revisadas</h2>
          <ul className="divide-y divide-cream-200">
            {recent.data
              .filter((w) => w.status !== 'pendiente')
              .slice(0, 10)
              .map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{w.item_name}</b> · {formatQty(w.qty_m, w.unit)} · {WASTE_REASON_LABELS[w.reason]}
                    <span className="block text-xs text-ink-500">
                      {w.reported_by_name} · {formatDateTime(w.reported_at)}
                      {w.review_note ? ` · ${w.review_note}` : ''}
                    </span>
                  </span>
                  <Badge tone={w.status === 'aprobada' ? 'green' : 'red'}>{w.status === 'aprobada' ? 'Aprobada' : 'Rechazada'}</Badge>
                </li>
              ))}
          </ul>
        </section>
      )}

      {reject && <RejectWaste w={reject} onClose={() => setReject(null)} />}
      {review && <CountReview id={review.id} onClose={() => setReview(null)} />}
    </div>
  );
}

function RejectWaste({ w, onClose }: { w: Waste; onClose: () => void }) {
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

function CountReview({ id, onClose }: { id: number; onClose: () => void }) {
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
      title={c.data ? `Conteo de ${c.data.location}` : 'Conteo'}
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

// ---------- Lista de compras ----------

function ShoppingTab({ list }: { list: Loaded<ShoppingLine[]> }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/items');
  const [entry, setEntry] = useState<Item | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const setStatus = async (shortageId: number, status: 'pedido' | 'descartado' | 'abierto') => {
    setBusy(shortageId);
    try {
      await api.post(`/shortages/${shortageId}/status`, { status });
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(null);
    }
  };

  // Las preparaciones no se le piden al proveedor: se programan en el plan.
  const purchasable = useMemo(() => (list.data ?? []).filter((l) => !isPrep(items.data, l.item_id)), [list.data, items.data]);
  const text = useMemo(() => orderText(purchasable), [purchasable]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Lista copiada', 'Pégala en WhatsApp o en un mensaje al proveedor.');
    } catch {
      toast.error('No se pudo copiar', 'Selecciona el texto manualmente.');
    }
  };

  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;

  return (
    <>
      <div className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <ShoppingCart className="size-5" />
        </span>
        <p className="flex-1 text-sm text-ink-700">
          <b>{list.data.length} productos</b> para reponer: lo que avisó el personal y lo que está bajo el mínimo. Al registrar la entrada de lo que llega, sale de la lista solo.
        </p>
        {purchasable.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => void copy()}>
              <Copy className="size-4" /> Copiar pedido
            </button>
            <a className="btn-primary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              <Send className="size-4" /> WhatsApp
            </a>
          </div>
        )}
      </div>

      {list.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ShoppingCart} title="No falta nada" text="Nadie ha reportado faltantes y ningún producto está bajo su mínimo." />
        </div>
      ) : (
        <div className="card divide-y divide-cream-200">
          {list.data.map((l) => {
            const item = items.data?.find((i) => i.id === l.item_id);
            const prep = item?.kind === 'preparacion';
            return (
              <div key={l.item_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-900">{l.name}</p>
                    <StockBadge status={l.status} />
                    {l.shortage && <Badge tone={l.shortage.level === 'agotado' ? 'red' : 'amber'}>Avisado: {SHORTAGE_LEVEL_LABELS[l.shortage.level].toLowerCase()}</Badge>}
                    {l.shortage?.status === 'pedido' && <Badge tone="green">Pedido</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {l.location} · hay <b className="text-ink-700">{formatQty(l.qty_m, l.unit)}</b>
                    {l.min_m > 0 && <> · mínimo {formatQty(l.min_m, l.unit)}</>}
                    {l.suggested_m > 0 && !prep && <> · sugerido comprar <b className="text-ink-700">{formatQty(l.suggested_m, niceUnit(l.suggested_m, l.base_unit))}</b></>}
                  </p>
                  {l.shortage && (
                    <p className="mt-0.5 text-xs text-ink-500">
                      {l.shortage.reported_by_name} · {formatDateTime(l.shortage.created_at)}
                      {l.shortage.note && <> · «{l.shortage.note}»</>}
                    </p>
                  )}
                  {prep && <p className="mt-0.5 text-xs font-medium text-amber-800">Se prepara en la cocina: agrégala al plan de preparación.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.shortage && l.shortage.status === 'abierto' && !prep && (
                    <button className="btn-secondary btn-sm" disabled={busy === l.shortage.id} onClick={() => void setStatus(l.shortage!.id, 'pedido')}>
                      Marcar pedido
                    </button>
                  )}
                  {!prep && item && (
                    <button className="btn-primary btn-sm" onClick={() => setEntry(item)}>
                      <PackagePlus className="size-4" /> Llegó
                    </button>
                  )}
                  {prep && (
                    <button className="btn-secondary btn-sm" onClick={() => navigate('plan')}>
                      Ir al plan
                    </button>
                  )}
                  {l.shortage && (
                    <button className="btn-ghost btn-sm" disabled={busy === l.shortage.id} onClick={() => void setStatus(l.shortage!.id, 'descartado')} title="Quitar el aviso">
                      Descartar aviso
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {entry && <EntryForm item={entry} onClose={() => setEntry(null)} />}
    </>
  );
}

function isPrep(items: Item[] | null, id: number) {
  return items?.find((i) => i.id === id)?.kind === 'preparacion';
}

/** Texto del pedido para mandarle al proveedor. */
function orderText(lines: ShoppingLine[]) {
  const byLoc = new Map<string, ShoppingLine[]>();
  for (const l of lines) byLoc.set(l.location, [...(byLoc.get(l.location) ?? []), l]);
  const out = [`Pedido Pizza Diana · ${shortDate(localDate())}`, ''];
  for (const [loc, ls] of byLoc) {
    out.push(`*${loc}*`);
    for (const l of ls) {
      const qty = l.suggested_m > 0 ? `: ${formatQty(l.suggested_m, niceUnit(l.suggested_m, l.base_unit))}` : '';
      out.push(`- ${l.name}${qty}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// ---------- Preparaciones ----------

function PreparationsTab() {
  const preps = useApi<Preparation[]>('/preparations');
  const [form, setForm] = useState<{ prep?: Preparation } | null>(null);
  const [toggle, setToggle] = useState<Preparation | null>(null);
  const [busy, setBusy] = useState(false);
  const { bump } = useApp();
  const toast = useToast();

  const doToggle = async () => {
    if (!toggle) return;
    setBusy(true);
    try {
      await api.post(`/preparations/${toggle.id}/active`, { active: !toggle.active });
      bump();
      setToggle(null);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (preps.error) return <ErrorBox message={preps.error} onRetry={preps.reload} />;
  if (!preps.data) return <Loading />;
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-ink-500">
          Una preparación dice con qué se hace algo y cuánto debe rendir. Un mismo insumo puede tener varias: la cebolla sirve para cebolla picada y para cebolla caramelizada.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setForm({})}>
          <Plus className="size-4" /> Nueva preparación
        </button>
      </div>
      {preps.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={BookOpen} title="Aún no hay preparaciones" text="Crea la primera, por ejemplo «Cebolla caramelizada» a partir de «Cebolla», o carga el catálogo de Pizza Diana en Configuración." />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {preps.data.map((p) => (
            <article key={p.id} className={cx('card flex flex-col p-5', !p.active && 'opacity-55')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-900">{p.name}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={p.mode === 'lote' ? 'dark' : 'neutral'}>{p.mode === 'lote' ? 'Receta por lote' : 'Transformación'}</Badge>
                    {p.is_demo && <DemoTag />}
                    {!p.active && <Badge>Desactivada</Badge>}
                  </div>
                </div>
                {p.std_yield_pct !== null && (
                  <span className="text-right">
                    <span className="block font-display text-2xl font-semibold text-brand-700 tabular-nums">{formatNumber(p.std_yield_pct)} %</span>
                    <span className="text-[11px] text-ink-500">rendimiento</span>
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {p.inputs.map((i, idx) => (
                  <li key={i.item_id} className="flex justify-between gap-2">
                    <span className={cx(idx === 0 ? 'font-semibold text-ink-900' : 'text-ink-700')}>{i.item_name}</span>
                    <span className="text-ink-500 tabular-nums">{formatQty(i.qty_m, niceUnit(i.qty_m, i.base_unit))}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-cream-200 pt-1 font-semibold text-emerald-800">
                  <span>→ {p.output_name}</span>
                  <span className="tabular-nums">{formatQty(p.std_output_m, niceUnit(p.std_output_m, p.output_base))}</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Hay {formatQty(p.output_available_m, p.output_unit)} · {p.last_production_at ? `última vez ${formatDateTime(p.last_production_at)}` : 'aún no se ha preparado'}
              </p>
              <div className="mt-4 flex gap-2">
                <button className="btn-secondary btn-sm flex-1" onClick={() => setForm({ prep: p })}>
                  <Pencil className="size-4" /> Editar
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setToggle(p)}>
                  <Power className="size-4" /> {p.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {form && <PreparationForm prep={form.prep} onClose={() => setForm(null)} />}
      <ConfirmModal
        open={!!toggle}
        onClose={() => setToggle(null)}
        onConfirm={() => void doToggle()}
        busy={busy}
        danger={toggle?.active}
        title={toggle?.active ? 'Desactivar preparación' : 'Activar preparación'}
        confirmText={toggle?.active ? 'Desactivar' : 'Activar'}
      >
        {toggle?.active ? 'La cocina dejará de verla al preparar. Lo que ya se preparó se conserva.' : 'La cocina podrá volver a registrarla.'}
      </ConfirmModal>
    </>
  );
}

interface Line {
  item_id: string;
  qty: string;
  unit: Unit;
}

function PreparationForm({ prep, onClose }: { prep?: Preparation; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/items');
  const [name, setName] = useState(prep?.name ?? '');
  const [mode, setMode] = useState<PrepMode>(prep?.mode ?? 'transformacion');
  const [outputId, setOutputId] = useState(prep ? String(prep.output_item_id) : '');
  const [lines, setLines] = useState<Line[]>(
    prep?.inputs.map((i) => ({ item_id: String(i.item_id), qty: String(fromMilli(i.qty_m, i.unit)), unit: i.unit })) ?? [{ item_id: '', qty: '1000', unit: 'g' }],
  );
  const [std, setStd] = useState(prep ? String(fromMilli(prep.std_output_m, niceUnit(prep.std_output_m, prep.output_base))) : '');
  const [stdUnit, setStdUnit] = useState<Unit>(prep ? niceUnit(prep.std_output_m, prep.output_base) : 'g');
  const [instructions, setInstructions] = useState(prep?.instructions ?? '');
  const [busy, setBusy] = useState(false);

  const active = (items.data ?? []).filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const output = active.find((i) => String(i.id) === outputId);
  const itemOf = (id: string) => active.find((i) => String(i.id) === id);
  const visibleLines = mode === 'transformacion' ? lines.slice(0, 1) : lines;

  const setLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name,
        mode,
        output_item_id: Number(outputId),
        std_output: Number(std.replace(',', '.')),
        std_output_unit: stdUnit,
        instructions,
        inputs: visibleLines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty.replace(',', '.')), unit: l.unit })),
      };
      if (prep) await api.put(`/preparations/${prep.id}`, body);
      else await api.post('/preparations', body);
      toast.success(prep ? 'Preparación actualizada' : 'Preparación creada', name);
      bump();
      onClose();
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  // Vista previa del % de rendimiento de una transformación (1 kg de cebolla → 450 g = 45 %).
  const baseLine = visibleLines[0];
  const baseItem = baseLine ? itemOf(baseLine.item_id) : undefined;
  const inM = baseLine ? toMilli(Number(baseLine.qty.replace(',', '.')) || 0, baseLine.unit) : 0;
  const stdM = toMilli(Number(std.replace(',', '.')) || 0, stdUnit);
  const yieldPreview = mode === 'transformacion' && baseItem && output && baseItem.base_unit === output.base_unit && inM > 0 && stdM > 0 ? (stdM / inM) * 100 : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={prep ? 'Editar preparación' : 'Nueva preparación'}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="prep-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      {!items.data ? (
        <Loading />
      ) : (
        <form id="prep-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {(['transformacion', 'lote'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cx('rounded-2xl border p-3 text-left text-sm transition-all', mode === m ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700')}
              >
                <span className="block font-semibold">{m === 'transformacion' ? 'Transformación' : 'Receta por lote'}</span>
                <span className={cx('block text-xs', mode === m ? 'text-white/70' : 'text-ink-500')}>
                  {m === 'transformacion' ? 'Un insumo que se pela, corta o cocina, con merma. Ej. cebolla → caramelizada.' : 'Varios ingredientes en proporción. Ej. masa de pizza.'}
                </span>
              </button>
            ))}
          </div>
          <Field label="Nombre">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder={mode === 'lote' ? 'Ej. Masa de pizza' : 'Ej. Cebolla caramelizada'} />
          </Field>

          <div>
            <span className="label">{mode === 'transformacion' ? 'Insumo de partida (lote estándar)' : 'Ingredientes del lote estándar'}</span>
            {mode === 'lote' && <p className="-mt-1 mb-2 text-xs text-ink-500">El primero es el ingrediente base: con él se calcula el resto (ej. la harina).</p>}
            <div className="space-y-2">
              {visibleLines.map((l, idx) => {
                const it = itemOf(l.item_id);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_6rem_5rem_auto] gap-2">
                    <select
                      className="input"
                      value={l.item_id}
                      required={idx === 0}
                      onChange={(e) => {
                        const next = itemOf(e.target.value);
                        setLine(idx, { item_id: e.target.value, unit: next ? (next.base_unit === 'g' ? 'g' : next.base_unit === 'ml' ? 'ml' : 'unidad') : l.unit });
                      }}
                      aria-label="Ingrediente"
                    >
                      <option value="">Elegir…</option>
                      {active
                        .filter((i) => String(i.id) !== outputId)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                    </select>
                    <input className="input tabular-nums" inputMode="decimal" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} required={!!l.item_id} aria-label="Cantidad" />
                    <select className="input" value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value as Unit })} aria-label="Unidad">
                      {(it ? unitsFor(it.base_unit) : (['g', 'kg', 'ml', 'l', 'unidad'] as Unit[])).map((u) => (
                        <option key={u} value={u}>
                          {UNIT_SHORT[u]}
                        </option>
                      ))}
                    </select>
                    {mode === 'lote' && lines.length > 1 ? (
                      <button type="button" className="btn-ghost px-2" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} aria-label="Quitar">
                        <XCircle className="size-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
            {mode === 'lote' && (
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setLines((ls) => [...ls, { item_id: '', qty: '', unit: 'g' }])}>
                <Plus className="size-4" /> Agregar ingrediente
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Resultado (lo que se guarda en la nevera)" hint="Si no existe, créalo primero en Inventario.">
              <select
                className="input"
                value={outputId}
                required
                onChange={(e) => {
                  setOutputId(e.target.value);
                  const it = itemOf(e.target.value);
                  if (it) setStdUnit(it.base_unit === 'g' ? 'g' : it.base_unit === 'ml' ? 'ml' : 'unidad');
                }}
              >
                <option value="">Elegir…</option>
                {active
                  .filter((i) => !visibleLines.some((l) => l.item_id === String(i.id)))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="¿Cuánto rinde ese lote?"
              hint={yieldPreview !== null ? `Rendimiento estándar: ${formatNumber(Math.round(yieldPreview * 10) / 10)} %` : 'Lo que normalmente sale, ya listo.'}
            >
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <input className="input tabular-nums" inputMode="decimal" value={std} onChange={(e) => setStd(e.target.value)} required />
                <select className="input" value={stdUnit} onChange={(e) => setStdUnit(e.target.value as Unit)}>
                  {(output ? unitsFor(output.base_unit) : (['g', 'kg', 'ml', 'l', 'unidad'] as Unit[])).map((u) => (
                    <option key={u} value={u}>
                      {UNIT_SHORT[u]}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>
          <Field label="Instrucciones para la cocina (opcional)">
            <textarea className="input min-h-20" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={600} placeholder="Ej. pelar, cortar en pluma y cocinar a fuego lento" />
          </Field>
        </form>
      )}
    </Modal>
  );
}

// ---------- Lo que se preparó ----------

function LogTab() {
  const [date, setDate] = useState(localDate());
  const from = weekStart(date);
  const to = weekEnd(date);
  const prods = useApi<Production[]>(`/productions?from=${from}&to=${to}&limit=500`, [from, to]);
  const [annul, setAnnul] = useState<Production | null>(null);

  const active = (prods.data ?? []).filter((p) => p.status === 'activa');
  const withEff = active.filter((p) => p.efficiency_pct !== null);
  const avg = withEff.length ? withEff.reduce((s, p) => s + (p.efficiency_pct ?? 0), 0) / withEff.length : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, -7))} aria-label="Semana anterior">
            <ChevronLeft className="size-4" />
          </button>
          <p className="font-display text-lg font-semibold">
            {shortDateDow(from)} – {shortDateDow(to)}
          </p>
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, 7))} aria-label="Semana siguiente" disabled={to >= localDate()}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge tone="neutral">{active.length} preparaciones</Badge>
          {avg !== null && <Badge tone={efficiencyTone(avg) === 'red' ? 'red' : efficiencyTone(avg) === 'amber' ? 'amber' : 'green'}>Rendimiento promedio {formatNumber(Math.round(avg))} %</Badge>}
          {active.some((p) => p.low) && <Badge tone="red">{active.filter((p) => p.low).length} rindieron bajo</Badge>}
        </div>
      </div>
      {prods.error ? (
        <ErrorBox message={prods.error} onRetry={prods.reload} />
      ) : !prods.data ? (
        <Loading />
      ) : prods.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ChefHat} title="Nada preparado esta semana" text="Lo que registre la cocina aparecerá aquí con su rendimiento." />
        </div>
      ) : (
        <div className="card divide-y divide-cream-200">
          {prods.data.map((p) => {
            const tone = efficiencyTone(p.efficiency_pct);
            return (
              <div key={p.id} className={cx('flex flex-col gap-2 p-4 sm:flex-row sm:items-center', p.status === 'anulada' && 'opacity-55')}>
                <div className="w-24 shrink-0 text-xs text-ink-500">
                  {shortDateDow(p.local_date)}
                  <br />
                  {formatTime(p.created_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">
                    {p.preparation_name} {p.is_demo ? <DemoTag /> : null} {p.status === 'anulada' && <Badge tone="dark">Anulada</Badge>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {p.inputs.map((i) => `${i.item_name} ${formatQty(i.qty_m, niceUnit(i.qty_m, i.base_unit))}`).join(' + ')} →{' '}
                    <b className="text-ink-700">{formatQty(p.output_m, niceUnit(p.output_m, baseOf(p.output_unit)))}</b> · {p.user_name}
                    {p.merma_inutil_m > 0 && <> · merma {formatQty(p.merma_inutil_m, niceUnit(p.merma_inutil_m, p.inputs[0]?.base_unit ?? 'g'))}</>}
                  </p>
                  {(p.note || p.annul_reason) && <p className="text-xs text-ink-700">«{p.annul_reason ?? p.note}»</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : tone === 'green' ? 'green' : 'neutral'}>
                    {p.efficiency_pct === null ? '—' : `${formatNumber(p.efficiency_pct)} %`}
                  </Badge>
                  {p.status === 'activa' && (
                    <button className="btn-ghost btn-sm px-2" onClick={() => setAnnul(p)} title="Anular">
                      <Undo2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {annul && <AnnulProduction p={annul} onClose={() => setAnnul(null)} />}
    </>
  );
}

function AnnulProduction({ p, onClose }: { p: Production; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/productions/${p.id}/annul`, { reason });
      toast.success('Preparación anulada', 'Se devolvieron los insumos y se retiró lo que había salido.');
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
      title="Anular preparación"
      subtitle={`${p.preparation_name} · ${formatDateTime(p.created_at)} · ${p.user_name}`}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-danger" form="annul-prod" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Anular
          </button>
        </>
      }
    >
      <form id="annul-prod" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink-700">
          Se devuelven al inventario los insumos usados y se retira {formatQty(p.output_m, niceUnit(p.output_m, baseOf(p.output_unit)))} de {p.output_name.toLowerCase()}.
        </p>
        <Field label="Motivo">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={200} placeholder="Ej. se registró dos veces" />
        </Field>
      </form>
    </Modal>
  );
}
