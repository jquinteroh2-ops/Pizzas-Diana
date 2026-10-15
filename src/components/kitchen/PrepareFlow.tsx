// «Preparar»: reemplaza la hoja de merma y la hoja de masa de pizza.
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, AlertTriangle, Loader2, ChefHat, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Preparation, Production } from '../../lib/types';
import { useToast } from '../toast';
import { Modal, Loading, ErrorBox, EmptyState, Field, cx } from '../ui';
import { baseOf, formatNumber, formatQty, fromMilli, niceUnit, toMilli, type Unit } from '../../../shared/units.ts';
import { LOW_EFFICIENCY_PCT, scaleBatch } from '../../../shared/kitchen.ts';
import { QtyInput } from './common';
import { parseQty, validQty, smallUnit, efficiencyTone } from './helpers';

export function PrepareFlow({ onClose, preparationId }: { onClose: () => void; preparationId?: number }) {
  const preps = useApi<Preparation[]>('/preparations');
  // undefined = aún no se ha elegido: si se abrió desde una tarea del plan, ya viene elegida.
  const [picked, setPrep] = useState<Preparation | null | undefined>(undefined);
  const [done, setDone] = useState<Production | null>(null);
  const prep = picked === undefined ? (preps.data?.find((p) => p.id === preparationId) ?? null) : picked;

  const title = done ? '¡Listo!' : prep ? prep.name : '¿Qué vas a preparar?';
  return (
    <Modal open onClose={onClose} title={title} subtitle={!done && prep ? prep.instructions || undefined : undefined} size="lg">
      {done ? (
        <Done
          p={done}
          onAnother={() => {
            setDone(null);
            setPrep(null);
          }}
          onClose={onClose}
        />
      ) : preps.error ? (
        <ErrorBox message={preps.error} onRetry={preps.reload} />
      ) : !preps.data ? (
        <Loading />
      ) : !prep ? (
        <Chooser preps={preps.data.filter((p) => p.active)} onPick={setPrep} />
      ) : prep.mode === 'transformacion' ? (
        <TransformForm prep={prep} onBack={() => setPrep(null)} onDone={setDone} />
      ) : (
        <BatchForm prep={prep} onBack={() => setPrep(null)} onDone={setDone} />
      )}
    </Modal>
  );
}

/** Agrupa por el insumo de partida: «Cebolla → caramelizada / picada». */
function Chooser({ preps, onPick }: { preps: Preparation[]; onPick: (p: Preparation) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Preparation[]>();
    for (const p of preps) {
      const key = p.mode === 'lote' ? 'Recetas por lote' : (p.inputs[0]?.item_name ?? 'Otros');
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return [...m].sort((a, b) => (a[0] === 'Recetas por lote' ? -1 : b[0] === 'Recetas por lote' ? 1 : a[0].localeCompare(b[0], 'es')));
  }, [preps]);

  if (preps.length === 0) {
    return <EmptyState icon={ChefHat} title="No hay preparaciones" text="El administrador debe crear las preparaciones (por ejemplo, cebolla caramelizada) en Cocina → Preparaciones." />;
  }
  return (
    <div className="space-y-5">
      {groups.map(([group, list]) => (
        <section key={group}>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-ink-500 uppercase">{group === 'Recetas por lote' ? group : `Con ${group.toLowerCase()}`}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="flex items-center gap-3 rounded-2xl border border-cream-300 bg-white p-4 text-left transition-all hover:border-brand-300 hover:shadow-card active:scale-[0.98]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <ChefHat className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink-900">{p.name}</span>
                  <span className="block text-xs text-ink-500">
                    {p.mode === 'lote'
                      ? `Lote estándar: ${p.inputs.map((i) => i.item_name).slice(0, 3).join(', ')}…`
                      : `Rinde ${formatNumber(p.std_yield_pct ?? 0)} % · hay ${formatQty(p.output_available_m, p.output_unit)}`}
                  </span>
                </span>
                <ArrowRight className="size-4 text-ink-400" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function useSubmit(onDone: (p: Production) => void) {
  const { bump } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const p = await api.post<Production>('/productions', body);
      bump();
      onDone(p);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, send };
}

function TransformForm({ prep, onBack, onDone }: { prep: Preparation; onBack: () => void; onDone: (p: Production) => void }) {
  const base = prep.inputs[0];
  const [inQty, setInQty] = useState('');
  const [inUnit, setInUnit] = useState<Unit>(smallUnit(base.base_unit));
  const [outQty, setOutQty] = useState('');
  const [outUnit, setOutUnit] = useState<Unit>(smallUnit(prep.output_base));
  const [util, setUtil] = useState('');
  const [note, setNote] = useState('');
  const { busy, send } = useSubmit(onDone);

  const inM = validQty(inQty) ? toMilli(parseQty(inQty), inUnit) : 0;
  const outM = validQty(outQty) ? toMilli(parseQty(outQty), outUnit) : 0;
  const utilM = validQty(util, true) ? toMilli(parseQty(util), inUnit) : 0;
  const expectedM = inM > 0 ? Math.round((prep.std_output_m * inM) / base.qty_m) : 0;
  const yieldPct = inM > 0 && outM > 0 ? (outM / inM) * 100 : null;
  const effPct = expectedM > 0 && outM > 0 ? (outM / expectedM) * 100 : null;
  const mermaM = Math.max(0, inM - outM - utilM);
  const tooMuch = inM > base.available_m;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send({
      preparation_id: prep.id,
      input_qty: parseQty(inQty),
      input_unit: inUnit,
      output_qty: parseQty(outQty),
      output_unit: outUnit,
      merma_util_qty: util ? parseQty(util) : undefined,
      merma_util_unit: inUnit,
      note,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Step n={1} label={`¿Cuánta ${base.item_name.toLowerCase()} usaste?`} hint="Pésala antes de pelar o cortar.">
        <QtyInput value={inQty} onChange={setInQty} unit={inUnit} onUnit={setInUnit} base={base.base_unit} autoFocus big />
        <p className={cx('mt-1.5 text-xs', tooMuch ? 'font-semibold text-brand-700' : 'text-ink-500')}>
          {tooMuch ? 'Ojo: ' : ''}el sistema dice que hay {formatQty(base.available_m, base.item_unit)}.
        </p>
      </Step>
      <Step n={2} label={`¿Cuánto salió de ${prep.output_name.toLowerCase()}?`} hint="Pésalo ya listo.">
        <QtyInput value={outQty} onChange={setOutQty} unit={outUnit} onUnit={setOutUnit} base={prep.output_base} big />
      </Step>
      <Step n={3} label="Merma que se aprovecha (opcional)" hint="Lo que no se bota: cáscaras para caldo, recortes para salsa…">
        <QtyInput value={util} onChange={setUtil} unit={inUnit} base={base.base_unit} />
      </Step>

      <YieldCard
        effPct={effPct}
        lines={[
          ['Rendimiento', yieldPct === null ? '—' : `${formatNumber(Math.round(yieldPct * 10) / 10)} %`, `estándar ${formatNumber(prep.std_yield_pct ?? 0)} %`],
          ['Debía salir', expectedM ? formatQty(expectedM, niceUnit(expectedM, prep.output_base)) : '—', 'según la receta'],
          ['Merma que se bota', inM && outM ? formatQty(mermaM, niceUnit(mermaM, base.base_unit)) : '—', 'peso inicial − final − aprovechada'],
        ]}
      />

      <Field label="Nota (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. la cebolla venía muy pequeña" />
      </Field>
      <Actions onBack={onBack} busy={busy} disabled={!inM || !outM} />
    </form>
  );
}

function BatchForm({ prep, onBack, onDone }: { prep: Preparation; onBack: () => void; onDone: (p: Production) => void }) {
  const base = prep.inputs[0];
  const baseDefaultUnit: Unit = base.base_unit === 'g' && base.qty_m >= 1_000_000 ? 'kg' : base.base_unit === 'ml' && base.qty_m >= 1_000_000 ? 'l' : smallUnit(base.base_unit);
  const [baseQty, setBaseQty] = useState(formatNumber(fromMilli(base.qty_m, baseDefaultUnit)).replace(/\./g, ''));
  const [baseUnit, setBaseUnit] = useState<Unit>(baseDefaultUnit);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [outQty, setOutQty] = useState('');
  const [outUnit, setOutUnit] = useState<Unit>(prep.output_unit);
  const [note, setNote] = useState('');
  const { busy, send } = useSubmit(onDone);

  const baseM = validQty(baseQty) ? toMilli(parseQty(baseQty), baseUnit) : 0;
  const scaled = scaleBatch(prep.inputs, prep.std_output_m, baseM);
  const outM = validQty(outQty) ? toMilli(parseQty(outQty), outUnit) : 0;
  const effPct = scaled.expectedM > 0 && outM > 0 ? (outM / scaled.expectedM) * 100 : null;

  // Las cantidades de los demás ingredientes se escriben en g o ml, para no confundir (en papel ponían «30 kg» de levadura).
  const lineValue = (idx: number) => {
    const l = scaled.inputs[idx];
    const u = smallUnit(l.base_unit);
    return overrides[l.item_id] ?? (baseM ? formatNumber(Math.round(fromMilli(l.qty_m, u) * 10) / 10).replace(/\./g, '') : '');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send({
      preparation_id: prep.id,
      inputs: scaled.inputs.map((l, idx) =>
        idx === 0 ? { item_id: l.item_id, qty: parseQty(baseQty), unit: baseUnit } : { item_id: l.item_id, qty: parseQty(lineValue(idx) || '0'), unit: smallUnit(l.base_unit) },
      ),
      output_qty: parseQty(outQty),
      output_unit: outUnit,
      note,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Step n={1} label={`¿Cuánta ${base.item_name.toLowerCase()} usaste?`} hint={`La receta estándar es con ${formatQty(base.qty_m, baseDefaultUnit)}. El resto se calcula solo.`}>
        <QtyInput value={baseQty} onChange={setBaseQty} unit={baseUnit} onUnit={setBaseUnit} base={base.base_unit} big />
      </Step>
      <Step n={2} label="Los demás ingredientes" hint="Ya están calculados. Cámbialos solo si usaste otra cantidad.">
        <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-300 bg-white">
          {scaled.inputs.slice(1).map((l, i) => {
            const idx = i + 1;
            // En g, ml o unidades: milésimas = valor × 1000.
            const over = parseQty(lineValue(idx) || '0') * 1000 > prep.inputs[idx].available_m;
            return (
              <li key={l.item_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{l.item_name}</span>
                  <span className={cx('block text-xs', over ? 'font-semibold text-brand-700' : 'text-ink-500')}>
                    hay {formatQty(prep.inputs[idx].available_m, prep.inputs[idx].item_unit)}
                  </span>
                </span>
                <div className="w-40">
                  <QtyInput
                    value={lineValue(idx)}
                    onChange={(v) => setOverrides((o) => ({ ...o, [l.item_id]: v }))}
                    unit={smallUnit(l.base_unit)}
                    base={l.base_unit}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Step>
      <Step n={3} label={`¿Cuánta ${prep.output_name.toLowerCase()} salió?`} hint="El peso total del lote ya listo.">
        <QtyInput value={outQty} onChange={setOutQty} unit={outUnit} onUnit={setOutUnit} base={prep.output_base} big />
      </Step>

      <YieldCard
        effPct={effPct}
        lines={[
          ['Debía salir', scaled.expectedM ? formatQty(scaled.expectedM, niceUnit(scaled.expectedM, prep.output_base)) : '—', `${formatNumber(Math.round(scaled.factor * 100) / 100)} veces la receta`],
          ['Salió', outM ? formatQty(outM, niceUnit(outM, prep.output_base)) : '—', ''],
          ['Rendimiento', effPct === null ? '—' : `${formatNumber(Math.round(effPct * 10) / 10)} %`, 'frente al estándar'],
        ]}
      />
      <Field label="Nota (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. se usó más sal por pedido del chef" />
      </Field>
      <Actions onBack={onBack} busy={busy} disabled={!baseM || !outM} />
    </form>
  );
}

function Step({ n, label, hint, children }: { n: number; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-start gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{n}</span>
        <div>
          <p className="text-sm font-semibold text-ink-900">{label}</p>
          {hint && <p className="text-xs text-ink-500">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function YieldCard({ effPct, lines }: { effPct: number | null; lines: [string, string, string][] }) {
  const tone = efficiencyTone(effPct === null ? null : Math.round(effPct * 10) / 10);
  const cls = {
    green: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-brand-200 bg-brand-50',
    neutral: 'border-cream-300 bg-cream-50',
  }[tone];
  return (
    <div className={cx('rounded-2xl border p-4 transition-colors', cls)}>
      <div className="grid grid-cols-3 gap-3">
        {lines.map(([label, value, hint]) => (
          <div key={label}>
            <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
            <p className="mt-0.5 font-display text-xl font-semibold text-ink-900 tabular-nums">{value}</p>
            {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
          </div>
        ))}
      </div>
      {effPct !== null && effPct < LOW_EFFICIENCY_PCT && (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-brand-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Rindió menos de lo normal. Si pasó algo (se quemó, venía dañado), escríbelo en la nota.
        </p>
      )}
    </div>
  );
}

function Actions({ onBack, busy, disabled }: { onBack: () => void; busy: boolean; disabled: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-cream-200 pt-4 sm:flex-row sm:justify-between">
      <button type="button" className="btn-ghost" onClick={onBack}>
        Elegir otra preparación
      </button>
      <button className="btn-primary py-3 sm:px-6" disabled={busy || disabled}>
        {busy && <Loader2 className="size-4 animate-spin" />} Guardar preparación
      </button>
    </div>
  );
}

function Done({ p, onAnother, onClose }: { p: Production; onAnother: () => void; onClose: () => void }) {
  const ok = !p.low;
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className={cx('grid size-16 place-items-center rounded-full', ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
        {ok ? <CheckCircle2 className="size-9" /> : <AlertTriangle className="size-9" />}
      </span>
      <p className="mt-4 font-display text-2xl font-semibold text-ink-900">
        {formatQty(p.output_m, niceUnit(p.output_m, baseOf(p.output_unit)))} de {p.output_name.toLowerCase()}
      </p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">
        {ok
          ? `Rindió ${formatNumber(p.efficiency_pct ?? 0)} % de lo esperado. Ya se sumó al inventario y se descontó lo que usaste.`
          : `Rindió ${formatNumber(p.efficiency_pct ?? 0)} % de lo esperado: el administrador lo verá para revisar.`}
      </p>
      <ul className="mt-4 w-full max-w-sm space-y-1 rounded-2xl bg-cream-100 p-3 text-left text-sm">
        {p.inputs.map((i) => (
          <li key={i.item_id} className="flex justify-between gap-3">
            <span className="text-ink-700">{i.item_name}</span>
            <span className="font-semibold tabular-nums">−{formatQty(i.qty_m, niceUnit(i.qty_m, i.base_unit))}</span>
          </li>
        ))}
        {p.merma_inutil_m > 0 && (
          <li className="flex justify-between gap-3 border-t border-cream-300 pt-1 text-ink-500">
            <span>Merma que se botó</span>
            <span className="tabular-nums">{formatQty(p.merma_inutil_m, niceUnit(p.merma_inutil_m, p.inputs[0]?.base_unit ?? 'g'))}</span>
          </li>
        )}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Info className="size-3.5" /> Si te equivocaste, avísale al administrador: él puede anularla.
      </p>
      <div className="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
        <button className="btn-secondary flex-1" onClick={onAnother}>
          Preparar otra cosa
        </button>
        <button className="btn-primary flex-1" onClick={onClose}>
          Terminar
        </button>
      </div>
    </div>
  );
}

