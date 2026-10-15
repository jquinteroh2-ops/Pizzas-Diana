// Plan de preparación semanal: qué se prepara cada día. Lo arma el administrador y
// la cocina lo ve en su pantalla («Hoy toca preparar»).
import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Copy, Loader2, Trash2, CalendarCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useApp } from '../lib/app';
import type { Preparation, PrepTask, WeekPlan } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, Modal, Field, DemoTag, cx } from '../components/ui';
import { addDays, daysBetween, localDate, shortDateDow, weekStart } from '../../shared/dates.ts';
import { baseOf, formatQty, niceUnit, unitsFor, UNIT_SHORT, type Unit } from '../../shared/units.ts';

export default function PrepPlan() {
  const { can, bump } = useApp();
  const toast = useToast();
  const manage = can('kitchen.manage');
  const today = localDate();
  const [date, setDate] = useState(today);
  const plan = useApi<WeekPlan>(`/prep-plan?date=${date}`, [date]);
  const [adding, setAdding] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const copyPrev = async () => {
    setCopying(true);
    try {
      const r = await api.post<{ added: number }>('/prep-plan/copy-previous', { date });
      toast.success(r.added ? `Se copiaron ${r.added} tareas` : 'Ya estaba todo copiado', 'Puedes ajustar lo que cambie esta semana.');
      bump();
    } catch (e) {
      toast.fail(e);
    } finally {
      setCopying(false);
    }
  };

  const remove = async (t: PrepTask) => {
    try {
      await api.post(`/prep-plan/${t.id}/delete`);
      bump();
    } catch (e) {
      toast.fail(e);
    }
  };

  const from = plan.data?.from ?? weekStart(date);
  const days = plan.data ? daysBetween(plan.data.from, plan.data.to) : [];
  const done = plan.data?.tasks.filter((t) => t.production_id).length ?? 0;

  return (
    <>
      <PageHeader
        title="Plan de preparación"
        subtitle={manage ? 'Qué prepara la cocina cada día. Cada semana puede ser distinta.' : 'Lo que el administrador programó para esta semana.'}
        actions={
          manage && (
            <button className="btn-secondary" onClick={() => void copyPrev()} disabled={copying}>
              {copying ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} Copiar semana anterior
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, -7))} aria-label="Semana anterior">
            <ChevronLeft className="size-4" />
          </button>
          <p className="font-display text-lg font-semibold">Semana del {shortDateDow(from)}</p>
          <button className="btn-secondary btn-sm px-2" onClick={() => setDate(addDays(from, 7))} aria-label="Semana siguiente">
            <ChevronRight className="size-4" />
          </button>
          {weekStart(today) !== from && (
            <button className="btn-ghost btn-sm" onClick={() => setDate(today)}>
              Esta semana
            </button>
          )}
        </div>
        {plan.data && plan.data.tasks.length > 0 && (
          <p className="text-sm text-ink-500">
            <b className="text-ink-900">{done}</b> de {plan.data.tasks.length} hechas
          </p>
        )}
      </div>

      {plan.error ? (
        <ErrorBox message={plan.error} onRetry={plan.reload} />
      ) : !plan.data ? (
        <Loading />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map((d) => {
            const tasks = plan.data!.tasks.filter((t) => t.local_date === d);
            const isToday = d === today;
            const past = d < today;
            return (
              <section key={d} className={cx('card flex flex-col p-3', isToday && 'ring-2 ring-brand-500')}>
                <header className="mb-2 flex items-center justify-between px-1">
                  <p className={cx('text-sm font-bold capitalize', isToday ? 'text-brand-700' : 'text-ink-900')}>{isToday ? `Hoy · ${shortDateDow(d)}` : shortDateDow(d)}</p>
                  {manage && !past && (
                    <button className="btn-ghost btn-sm px-1.5" onClick={() => setAdding(d)} aria-label={`Agregar para ${shortDateDow(d)}`}>
                      <Plus className="size-4" />
                    </button>
                  )}
                </header>
                {tasks.length === 0 ? (
                  <p className="px-1 py-3 text-xs text-ink-400">Nada programado</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasks.map((t) => (
                      <li key={t.id} className={cx('group flex items-start gap-2 rounded-xl px-2 py-2', t.production_id ? 'bg-emerald-50' : past ? 'bg-brand-50' : 'bg-cream-100')}>
                        {t.production_id ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-ink-400" />}
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block leading-tight font-semibold text-ink-900">
                            {t.preparation_name} {t.is_demo ? <DemoTag /> : null}
                          </span>
                          <span className="block text-[11px] text-ink-500">
                            {t.production_id
                              ? `${t.done_by_name} · ${formatQty(t.done_output_m!, niceUnit(t.done_output_m!, baseOf(t.output_unit)))}`
                              : past
                                ? 'No se hizo'
                                : [t.target_m ? `Meta ${formatQty(t.target_m, niceUnit(t.target_m, baseOf(t.output_unit)))}` : '', t.note].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {manage && !t.production_id && (
                          <button className="rounded-lg p-1 text-ink-400 hover:bg-white hover:text-brand-700" onClick={() => void remove(t)} aria-label="Quitar del plan">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {plan.data && plan.data.tasks.length === 0 && manage && (
        <div className="card mt-4 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <CalendarCheck className="size-8 shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-ink-700">
            Esta semana no tiene plan. Toca <b>+</b> en cada día para agregar lo que se va a preparar, o copia el plan de la semana anterior y ajústalo.
          </p>
        </div>
      )}
      {adding && <AddTask date={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function AddTask({ date, onClose }: { date: string; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const preps = useApi<Preparation[]>('/preparations');
  const [prepId, setPrepId] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const prep = preps.data?.find((p) => String(p.id) === prepId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/prep-plan', { date, preparation_id: Number(prepId), target_qty: target ? Number(target.replace(',', '.')) : undefined, target_unit: unit, note });
      toast.success('Agregado al plan', `${prep?.name} · ${shortDateDow(date)}`);
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
      title="Agregar al plan"
      subtitle={shortDateDow(date)}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="task-form" disabled={busy || !prepId}>
            {busy && <Loader2 className="size-4 animate-spin" />} Agregar
          </button>
        </>
      }
    >
      {!preps.data ? (
        <Loading />
      ) : (
        <form id="task-form" onSubmit={submit} className="space-y-4">
          <Field label="¿Qué se prepara?">
            <select
              className="input"
              value={prepId}
              required
              onChange={(e) => {
                setPrepId(e.target.value);
                const p = preps.data!.find((x) => String(x.id) === e.target.value);
                if (p) setUnit(p.output_unit);
              }}
            >
              <option value="">Elegir…</option>
              {preps.data
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          {prep && (
            <Field label="Cantidad a preparar (opcional)" hint={`Hay ${formatQty(prep.output_available_m, prep.output_unit)} ahora.`}>
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <input className="input tabular-nums" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ej. 2" />
                <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  {unitsFor(prep.output_base).map((u) => (
                    <option key={u} value={u}>
                      {UNIT_SHORT[u]}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          )}
          <Field label="Nota (opcional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej. cortar en juliana" />
          </Field>
        </form>
      )}
    </Modal>
  );
}
