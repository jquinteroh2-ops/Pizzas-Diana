import { useState, type ReactNode } from 'react';
import {
  ShoppingBag,
  CalendarDays,
  CalendarRange,
  Package,
  AlertTriangle,
  XCircle,
  Plus,
  ChevronRight,
  ReceiptText,
  TrendingUp,
  PieChart as PieIcon,
  ChefHat,
  Inbox,
  Megaphone,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react';
import { navigate, useApi, useApp } from '../lib/app';
import type { Charts, Dashboard as DashboardData, KitchenSummary } from '../lib/types';
import { PageHeader, Loading, ErrorBox, EmptyState, Segmented, StockBadge, DemoTag, Badge, cx } from '../components/ui';
import { UnitsLine, TopProductsBars, ShareDonut } from '../components/charts';
import { formatQty, formatNumber } from '../../shared/units.ts';
import { formatTime, formatDateTime, localDate, longDate, shortDate } from '../../shared/dates.ts';

type SeriesKey = '7d' | '30d' | 'mes';
type TopKey = 'dia' | 'semana' | 'mes';

function Kpi({ icon: Icon, label, value, hint, tone = 'brand', onClick }: { icon: LucideIcon; label: string; value: number; hint?: string; tone?: 'brand' | 'ink' | 'amber' | 'danger' | 'green'; onClick?: () => void }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    ink: 'bg-cream-200 text-ink-700',
    amber: 'bg-amber-50 text-amber-600',
    danger: 'bg-brand-100 text-brand-800',
    green: 'bg-emerald-50 text-emerald-700',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('card flex flex-col gap-4 p-5 text-left transition-all', onClick && 'hover:-translate-y-0.5 hover:shadow-pop')}>
      <div className="flex items-center justify-between">
        <span className={cx('grid size-10 place-items-center rounded-xl', tones[tone])}>
          <Icon className="size-5" />
        </span>
        {onClick && <ChevronRight className="size-4 text-ink-400" />}
      </div>
      <div>
        <p className="font-display text-[2rem] leading-none font-semibold text-ink-900 tabular-nums">{formatNumber(value)}</p>
        <p className="mt-2 text-sm font-medium text-ink-700">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      </div>
    </Tag>
  );
}

function Panel({ title, icon: Icon, actions, children, className }: { title: string; icon: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card p-5 sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon className="size-5 text-brand-600" /> {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const rangeText = (r: { from: string; to: string }) => (r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} – ${shortDate(r.to)}`);

/** Lo que el administrador tiene que atender de la cocina, de un vistazo. */
function KitchenPanel({ k }: { k: KitchenSummary }) {
  const tiles: { icon: LucideIcon; label: string; value: string; hint: string; alert: boolean; go: () => void }[] = [
    {
      icon: Inbox,
      label: 'Por autorizar',
      value: String(k.pendingWastes + k.pendingCounts),
      hint: `${k.pendingWastes} bajas · ${k.pendingCounts} conteos`,
      alert: k.pendingWastes + k.pendingCounts > 0,
      go: () => navigate('cocina', { tab: 'pendientes' }),
    },
    {
      icon: Megaphone,
      label: 'Faltantes avisados',
      value: String(k.openShortages),
      hint: 'en la lista de compras',
      alert: k.openShortages > 0,
      go: () => navigate('cocina', { tab: 'compras' }),
    },
    {
      icon: CalendarCheck,
      label: 'Plan de hoy',
      value: k.tasksToday.total ? `${k.tasksToday.done}/${k.tasksToday.total}` : '—',
      hint: k.tasksToday.total ? 'preparaciones hechas' : 'sin plan para hoy',
      alert: false,
      go: () => navigate('plan'),
    },
    {
      icon: ChefHat,
      label: 'Preparado esta semana',
      value: String(k.productionsWeek),
      hint: k.lowYield.length ? `${k.lowYield.length} con rendimiento bajo` : 'todo con buen rendimiento',
      alert: k.lowYield.length > 0,
      go: () => navigate('cocina', { tab: 'registro' }),
    },
  ];
  return (
    <section className="card mt-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-cream-200 px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <ChefHat className="size-5 text-brand-600" /> Cocina
        </h2>
        <button className="btn-ghost btn-sm" onClick={() => navigate('cocina')}>
          Abrir cocina <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 divide-cream-200 lg:grid-cols-4 lg:divide-x">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.label} onClick={t.go} className="flex items-start gap-3 p-4 text-left transition-colors hover:bg-cream-50 sm:p-5">
              <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', t.alert ? 'bg-brand-600 text-white' : 'bg-cream-200 text-ink-700')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-2xl leading-none font-semibold text-ink-900 tabular-nums">{t.value}</span>
                <span className="mt-1 block text-sm font-medium text-ink-700">{t.label}</span>
                <span className="block text-xs text-ink-500">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {k.lowYield.length > 0 && (
        <div className="border-t border-cream-200 bg-brand-50/50 px-5 py-3 sm:px-6">
          <p className="mb-1.5 text-xs font-bold tracking-wide text-brand-800 uppercase">Rendimiento bajo (últimos 7 días)</p>
          <ul className="flex flex-wrap gap-2">
            {k.lowYield.map((p) => (
              <li key={p.id}>
                <Badge tone="red">
                  {p.preparation_name} · {formatNumber(p.efficiency_pct ?? 0)} % · {shortDate(p.local_date)} · {p.user_name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user, can } = useApp();
  const [seriesKey, setSeriesKey] = useState<SeriesKey>('7d');
  const [topKey, setTopKey] = useState<TopKey>('semana');
  const dash = useApi<DashboardData>('/dashboard');
  const charts = useApi<Charts>(`/charts?series=${seriesKey}&top=${topKey}`, [seriesKey, topKey]);

  if (dash.error) return <ErrorBox message={dash.error} onRetry={dash.reload} />;
  if (!dash.data) return <Loading />;
  const d = dash.data;
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        subtitle={`Así va Pizza Diana hoy, ${longDate(d.today)}.`}
        actions={
          can('sales.create') && (
            <button className="btn-primary" onClick={() => navigate('vender')}>
              <Plus className="size-4" /> Registrar venta
            </button>
          )
        }
      />

      {!d.hasSales && (
        <div className="card mb-6 flex flex-col items-start gap-4 border-brand-200 bg-gradient-to-r from-brand-50 to-white p-6 sm:flex-row sm:items-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-white">
            <ShoppingBag className="size-6" />
          </span>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">Aún no hay ventas registradas</p>
            <p className="text-sm text-ink-500">Cuando registres la primera venta, aquí verás las unidades vendidas, los productos estrella y el consumo de ingredientes.</p>
          </div>
          {can('sales.create') && (
            <button className="btn-primary" onClick={() => navigate('vender')}>
              Registrar la primera venta
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={ShoppingBag} label="Vendidas hoy" value={d.units.today} hint="unidades" />
        <Kpi icon={CalendarDays} label="Esta semana" value={d.units.week} hint={rangeText(d.ranges.week)} tone="ink" />
        <Kpi icon={CalendarRange} label="Este mes" value={d.units.month} hint={rangeText(d.ranges.month)} tone="ink" />
        <Kpi icon={Package} label="Artículos en inventario" value={d.stock.total} hint="activos" tone="green" onClick={can('inventory.view') ? () => navigate('inventario') : undefined} />
        <Kpi icon={AlertTriangle} label="Inventario bajo" value={d.stock.low} hint="bajo el mínimo" tone="amber" onClick={can('inventory.view') ? () => navigate('inventario', { estado: 'bajo' }) : undefined} />
        <Kpi icon={XCircle} label="Agotados" value={d.stock.out} hint="sin existencias" tone="danger" onClick={can('inventory.view') ? () => navigate('inventario', { estado: 'agotado' }) : undefined} />
      </div>

      {can('kitchen.manage') && <KitchenPanel k={d.kitchen} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel
          title="Evolución de ventas"
          icon={TrendingUp}
          className="lg:col-span-2"
          actions={
            <Segmented<SeriesKey>
              size="sm"
              value={seriesKey}
              onChange={setSeriesKey}
              options={[
                { value: '7d', label: '7 días' },
                { value: '30d', label: '30 días' },
                { value: 'mes', label: 'Mes actual' },
              ]}
            />
          }
        >
          {charts.data ? (
            <>
              <p className="-mt-3 mb-3 text-xs text-ink-500">
                Unidades vendidas por día · {rangeText(charts.data.series.range)} ·{' '}
                <b className="text-ink-700">{formatNumber(charts.data.series.data.reduce((s, x) => s + x.units, 0))} en total</b>
              </p>
              <UnitsLine data={charts.data.series.data} />
            </>
          ) : (
            <Loading />
          )}
        </Panel>

        <Panel title="Alertas de inventario" icon={AlertTriangle}>
          {d.alerts.length === 0 ? (
            <EmptyState icon={Package} title="Todo en orden" text="Ningún artículo está por debajo de su cantidad mínima." />
          ) : (
            <ul className="-mx-2 max-h-[300px] space-y-1 overflow-y-auto">
              {d.alerts.map((a) => (
                <li key={a.id}>
                  <button
                    disabled={!can('inventory.view')}
                    onClick={() => navigate('inventario', { item: a.id })}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-cream-100 disabled:hover:bg-transparent"
                  >
                    <span className={cx('size-2.5 shrink-0 rounded-full', a.status === 'agotado' ? 'bg-brand-800' : 'bg-amber-500')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{a.name}</span>
                      <span className="block text-xs text-ink-500">
                        Quedan <b className="text-ink-700">{formatQty(a.qty_m, a.unit)}</b> · mínimo {formatQty(a.min_m, a.unit)}
                      </span>
                    </span>
                    <StockBadge status={a.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel
          title="Productos más vendidos"
          icon={ShoppingBag}
          className="lg:col-span-3"
          actions={
            <Segmented<TopKey>
              size="sm"
              value={topKey}
              onChange={setTopKey}
              options={[
                { value: 'dia', label: 'Hoy' },
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: 'Mes' },
              ]}
            />
          }
        >
          {!charts.data ? (
            <Loading />
          ) : charts.data.top.data.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Sin ventas en este período" text={`No hay ventas confirmadas entre ${rangeText(charts.data.top.range)}.`} />
          ) : (
            <>
              <p className="-mt-3 mb-3 text-xs text-ink-500">Unidades vendidas · {rangeText(charts.data.top.range)}</p>
              <TopProductsBars data={charts.data.top.data} />
              <button className="btn-ghost btn-sm mt-2" onClick={() => navigate('mas-vendidos')}>
                Ver la lista completa <ChevronRight className="size-4" />
              </button>
            </>
          )}
        </Panel>

        <Panel title="Distribución" icon={PieIcon} className="lg:col-span-2">
          {!charts.data ? (
            <Loading />
          ) : charts.data.top.data.length === 0 ? (
            <EmptyState icon={PieIcon} title="Sin datos" text="Registra ventas para ver la participación de cada producto." />
          ) : (
            <>
              <p className="-mt-3 mb-4 text-xs text-ink-500">Participación en unidades · {rangeText(charts.data.top.range)}</p>
              <ShareDonut data={charts.data.top.data} />
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Actividad reciente"
        icon={ReceiptText}
        className="mt-6"
        actions={
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => navigate('historial')}>
              Ver historial <ChevronRight className="size-4" />
            </button>
            {can('sales.create') && (
              <button className="btn-primary btn-sm" onClick={() => navigate('vender')}>
                <Plus className="size-4" /> Nueva venta
              </button>
            )}
          </div>
        }
      >
        {d.recent.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Sin movimientos todavía" text="Las últimas ventas registradas aparecerán aquí." />
        ) : (
          <ul className="-mx-2 divide-y divide-cream-200">
            {d.recent.map((s) => (
              <li key={s.id}>
                <button onClick={() => navigate('historial', { venta: s.id })} className="flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left transition-colors hover:bg-cream-100">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cream-200 font-display text-lg font-semibold text-ink-900 tabular-nums">{s.total_units}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {s.items.map((i) => `${i.qty} × ${i.product_name}`).join(', ')}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                      {s.created_at.slice(0, 10) && localDate(s.created_at) === d.today ? `Hoy, ${formatTime(s.created_at)}` : formatDateTime(s.created_at)}
                      <span>·</span> {s.user_name}
                      {s.is_demo ? <DemoTag /> : null}
                    </span>
                  </span>
                  {s.status === 'anulada' ? <Badge tone="red">Anulada</Badge> : <ChevronRight className="size-4 text-ink-400" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
