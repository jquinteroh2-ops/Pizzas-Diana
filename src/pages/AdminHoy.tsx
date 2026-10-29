// «Hoy» del administrador: todo lo del día en una sola pantalla.
// Cuánto se vendió, cómo va la hoja de la cocina, qué días faltan por validar,
// qué hay que autorizar, qué hay que comprar y lo que más se vende.
import { ArrowRight, CheckCircle2, ClipboardList, ShieldAlert, ShieldCheck, ShoppingBag, Trophy, type LucideIcon } from 'lucide-react';
import { navigate, useApi } from '../lib/app';
import type { Charts, Count, Dashboard, ShoppingLine, Waste } from '../lib/types';
import type { DaySheet } from '../../shared/daySheet.ts';
import { PageHeader, cx } from '../components/ui';
import { PendingTab, ShoppingTab } from './KitchenAdmin';
import { addDays, localDate, longDate, shortDateDow } from '../../shared/dates.ts';
import { formatNumber } from '../../shared/units.ts';

interface SheetDay {
  date: string;
  status: 'abierta' | 'validada';
  validated_by_name: string | null;
  open_filled: number;
  close_filled: number;
}

function Tile({ icon: Icon, label, value, tone = 'neutral', onClick }: { icon: LucideIcon; label: string; value: string; tone?: 'neutral' | 'green' | 'amber' | 'red'; onClick: () => void }) {
  const tones = {
    neutral: 'bg-cream-100 text-ink-500',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-brand-50 text-brand-600',
  };
  return (
    <button type="button" onClick={onClick} className="card flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-pop">
      <span className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', tones[tone])}>
        <Icon className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink-500">{label}</span>
        <span className="block font-display text-xl font-semibold text-ink-900">{value}</span>
      </span>
    </button>
  );
}

export default function AdminHoy() {
  const today = localDate();
  const dash = useApi<Dashboard>('/dashboard');
  const sheet = useApi<DaySheet>(`/day-sheet?date=${today}`);
  const days = useApi<SheetDay[]>(`/day-sheet/days?from=${addDays(today, -13)}&to=${addDays(today, -1)}`);
  const charts = useApi<Charts>('/charts?series=7d&top=semana');
  const pw = useApi<Waste[]>('/wastes?status=pendiente');
  const pc = useApi<Count[]>('/counts?status=pendiente');
  const shop = useApi<ShoppingLine[]>('/shopping-list');

  const s = sheet.data?.summary;
  const sheetText = !s ? '…' : s.close_filled ? `Fin ${s.close_filled} de ${s.items}` : s.open_filled ? `Inicio ${s.open_filled} de ${s.items}` : 'Sin empezar';
  const validated = sheet.data?.status === 'validada';
  // Días que la cocina contó al cerrar pero no ha validado.
  const pendingDays = (days.data ?? []).filter((d) => d.status === 'abierta' && d.close_filled > 0);
  const top = (charts.data?.top.data ?? []).slice(0, 5);
  const topMax = top[0]?.units ?? 1;

  return (
    <>
      <PageHeader title="Hoy" subtitle={<span className="first-letter:uppercase">{longDate(today)}</span>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={ShoppingBag} label="Vendido hoy" value={dash.data ? `${formatNumber(dash.data.units.today)} platos` : '…'} onClick={() => navigate('hoja-ventas')} />
        <Tile icon={ClipboardList} label="Hoja de la cocina" value={sheetText} tone={s?.close_filled ? 'green' : s?.open_filled ? 'amber' : 'neutral'} onClick={() => navigate('hoja')} />
        <Tile
          icon={validated ? ShieldCheck : ShieldAlert}
          label="Validación de hoy"
          value={!sheet.data ? '…' : validated ? `Validada · ${sheet.data.validated_by_name}` : s?.to_review ? `${s.to_review} no cuadran` : 'Sin validar'}
          tone={validated ? 'green' : s?.to_review ? 'red' : 'neutral'}
          onClick={() => navigate('hoja', { tab: 'validar' })}
        />
        <Tile
          icon={CheckCircle2}
          label="Bajas por autorizar"
          value={pw.data ? String(pw.data.length) : '…'}
          tone={pw.data?.length ? 'amber' : 'green'}
          onClick={() => navigate('hoja', { tab: 'bajas' })}
        />
      </div>

      {pendingDays.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">Días contados que faltan por validar</p>
          <div className="flex flex-wrap gap-2">
            {pendingDays.map((d) => (
              <button key={d.date} className="btn-secondary btn-sm capitalize" onClick={() => navigate('hoja', { fecha: d.date, tab: 'validar' })}>
                {shortDateDow(d.date)} <ArrowRight className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold text-ink-900">Para revisar</h2>
      <div className="mb-8">
        <PendingTab wastes={pw} counts={pc} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <h2 className="mb-3 font-display text-xl font-semibold text-ink-900">Hay que comprar</h2>
          <ShoppingTab list={shop} />
        </div>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink-900">Lo más vendido (semana)</h2>
            <button className="btn-ghost btn-sm" onClick={() => navigate('mas-vendidos')}>
              Ver todo <ArrowRight className="size-3.5" />
            </button>
          </div>
          <div className="card p-4">
            {top.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Todavía no hay ventas esta semana.</p>
            ) : (
              <ol className="space-y-3">
                {top.map((p, i) => (
                  <li key={p.product_id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        {i === 0 ? <Trophy className="size-4 shrink-0 text-crust-500" /> : <span className="w-4 shrink-0 text-center text-xs font-bold text-ink-400">{i + 1}</span>}
                        <span className="truncate font-semibold text-ink-900">{p.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-700">{formatNumber(p.units)}</span>
                    </div>
                    <div className="mt-1 ml-6 h-1.5 rounded-full bg-cream-200">
                      <div className="h-1.5 rounded-full bg-ink-900" style={{ width: `${Math.max(4, (p.units / topMax) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
