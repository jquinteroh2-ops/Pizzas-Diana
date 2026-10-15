// Pantalla «Cocina». El cocinero ve su día (qué toca preparar y 4 botones grandes);
// la caja solo avisa faltantes y bajas; el administrador ve el centro de control.
import { useState } from 'react';
import { ChefHat, Megaphone, Trash2, ClipboardList, CheckCircle2, Circle, Clock, ArrowRight } from 'lucide-react';
import { useApi, useApp } from '../lib/app';
import type { KitchenToday } from '../lib/types';
import { PageHeader, Loading, ErrorBox, Badge, DemoTag, cx } from '../components/ui';
import { ActionTile } from '../components/kitchen/common';
import { efficiencyTone } from '../components/kitchen/helpers';
import { FlowHost, type Flow } from '../components/kitchen/FlowHost';
import { formatQty, niceUnit, baseOf } from '../../shared/units.ts';
import { formatTime, longDate } from '../../shared/dates.ts';
import { SHORTAGE_LEVEL_LABELS, WASTE_REASON_LABELS } from '../../shared/kitchen.ts';
import KitchenAdmin from './KitchenAdmin';

export default function Kitchen() {
  const { can } = useApp();
  return can('kitchen.manage') ? <KitchenAdmin /> : <KitchenHome />;
}

function KitchenHome() {
  const { user, can } = useApp();
  const today = useApi<KitchenToday>('/kitchen/today');
  const [flow, setFlow] = useState<Flow | null>(null);
  const cook = can('kitchen.use');
  const firstName = user.name.split(' ')[0];

  if (today.error) return <ErrorBox message={today.error} onRetry={today.reload} />;
  if (!today.data) return <Loading />;
  const d = today.data;
  const pending = d.tasks.filter((t) => !t.production_id);

  return (
    <>
      <PageHeader title={cook ? `¡Buen día, ${firstName}!` : 'Faltantes y bajas'} subtitle={cook ? longDate(d.today) : 'Avísale al administrador lo que falta o lo que hay que botar.'} />

      {cook && (
        <section className="card mb-5 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-cream-200 bg-gradient-to-r from-crust-300/30 to-transparent px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Hoy toca preparar</h2>
              <p className="text-xs text-ink-500">
                {d.tasks.length === 0
                  ? 'El administrador no programó preparaciones para hoy.'
                  : pending.length === 0
                    ? '¡Todo listo por hoy!'
                    : `${d.tasks.length - pending.length} de ${d.tasks.length} hechas`}
              </p>
            </div>
            {d.tasks.length > 0 && (
              <div className="h-2 w-24 overflow-hidden rounded-full bg-cream-200">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${((d.tasks.length - pending.length) / d.tasks.length) * 100}%` }} />
              </div>
            )}
          </div>
          {d.tasks.length > 0 && (
            <ul className="divide-y divide-cream-200">
              {d.tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={!!t.production_id}
                    onClick={() => setFlow({ kind: 'preparar', prepId: t.preparation_id })}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors enabled:hover:bg-cream-50"
                  >
                    {t.production_id ? <CheckCircle2 className="size-6 shrink-0 text-emerald-600" /> : <Circle className="size-6 shrink-0 text-ink-400" />}
                    <span className="min-w-0 flex-1">
                      <span className={cx('block font-semibold', t.production_id ? 'text-ink-500 line-through decoration-ink-400/50' : 'text-ink-900')}>{t.preparation_name}</span>
                      <span className="block text-xs text-ink-500">
                        {t.production_id
                          ? `Hecho por ${t.done_by_name} a las ${formatTime(t.done_at!)} · ${formatQty(t.done_output_m!, niceUnit(t.done_output_m!, baseOf(t.output_unit)))}`
                          : [t.target_m ? `Meta: ${formatQty(t.target_m, niceUnit(t.target_m, baseOf(t.output_unit)))}` : '', t.note].filter(Boolean).join(' · ') || 'Toca para registrarla'}
                      </span>
                    </span>
                    {!t.production_id && (
                      <span className="btn-primary btn-sm">
                        Preparar <ArrowRight className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className={cx('grid gap-3', cook ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
        {cook && <ActionTile icon={ChefHat} title="Preparar" text="Cebolla, masa, pechuga…" tone="brand" onClick={() => setFlow({ kind: 'preparar' })} />}
        <ActionTile icon={Megaphone} title="Falta algo" text="Avisa lo que se acaba" tone="amber" onClick={() => setFlow({ kind: 'faltante' })} />
        <ActionTile icon={Trash2} title="Dar de baja" text="Dañado, vencido, se cayó" tone="ink" onClick={() => setFlow({ kind: 'baja' })} />
        {cook && <ActionTile icon={ClipboardList} title="Contar nevera" text="Congelador, neveras, bodega" tone="green" onClick={() => setFlow({ kind: 'conteo' })} />}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Clock className="size-5 text-brand-600" /> Lo que registré hoy
          </h2>
          {d.productions.length + d.wastes.length + d.counts.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">Todavía nada. Lo que registres aparece aquí.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {d.productions.map((p) => (
                <li key={`p${p.id}`} className="flex items-center gap-3 py-2.5">
                  <ChefHat className="size-5 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{p.preparation_name}</b>: {formatQty(p.output_m, niceUnit(p.output_m, baseOf(p.output_unit)))}
                    <span className="block text-xs text-ink-500">{formatTime(p.created_at)}</span>
                  </span>
                  {p.status === 'anulada' ? (
                    <Badge tone="dark">Anulada</Badge>
                  ) : (
                    <Badge tone={efficiencyTone(p.efficiency_pct) === 'red' ? 'red' : efficiencyTone(p.efficiency_pct) === 'amber' ? 'amber' : 'green'}>
                      {p.efficiency_pct ?? '—'} %
                    </Badge>
                  )}
                </li>
              ))}
              {d.wastes.map((w) => (
                <li key={`w${w.id}`} className="flex items-center gap-3 py-2.5">
                  <Trash2 className="size-5 shrink-0 text-ink-700" />
                  <span className="min-w-0 flex-1 text-sm">
                    Baja: <b>{w.item_name}</b> {formatQty(w.qty_m, w.unit)}
                    <span className="block text-xs text-ink-500">
                      {WASTE_REASON_LABELS[w.reason]} · {formatTime(w.reported_at)}
                    </span>
                  </span>
                  <Badge tone={w.status === 'aprobada' ? 'green' : w.status === 'rechazada' ? 'red' : 'amber'}>
                    {w.status === 'pendiente' ? 'Por autorizar' : w.status === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                  </Badge>
                </li>
              ))}
              {d.counts.map((c) => (
                <li key={`c${c.id}`} className="flex items-center gap-3 py-2.5">
                  <ClipboardList className="size-5 shrink-0 text-emerald-700" />
                  <span className="min-w-0 flex-1 text-sm">
                    Conteo de <b>{c.location}</b>: {c.lines_count} productos
                    <span className="block text-xs text-ink-500">{formatTime(c.counted_at)}</span>
                  </span>
                  <Badge tone={c.status === 'aplicado' ? 'green' : c.status === 'descartado' ? 'red' : 'amber'}>
                    {c.status === 'pendiente' ? 'Por revisar' : c.status === 'aplicado' ? 'Aplicado' : 'Descartado'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Megaphone className="size-5 text-crust-500" /> Faltantes avisados
          </h2>
          <p className="mb-3 text-xs text-ink-500">Lo que ya se le avisó al administrador. No hace falta avisarlo otra vez.</p>
          {d.shortages.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">No hay faltantes pendientes.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {d.shortages.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className={cx('size-2.5 shrink-0 rounded-full', s.level === 'agotado' ? 'bg-brand-700' : 'bg-amber-500')} />
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{s.item_name}</b> · {SHORTAGE_LEVEL_LABELS[s.level].toLowerCase()}
                    <span className="block text-xs text-ink-500">
                      {s.reported_by_name}
                      {s.note ? ` · ${s.note}` : ''}
                    </span>
                  </span>
                  {s.is_demo ? <DemoTag /> : null}
                  <Badge tone={s.status === 'pedido' ? 'green' : 'neutral'}>{s.status === 'pedido' ? 'Ya se pidió' : 'Por pedir'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FlowHost flow={flow} onClose={() => setFlow(null)} />
    </>
  );
}
