// Crear o cambiar una preparación (receta de cocina): transformación con merma o receta por lote.
// Se abre desde las hojas de merma y masa, y desde «Preparaciones y bajas».
import { useState, type FormEvent } from 'react';
import { Loader2, Plus, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item, Preparation } from '../../lib/types';
import { useToast } from '../toast';
import { Field, Loading, Modal, cx } from '../ui';
import { formatNumber, fromMilli, niceUnit, toMilli, unitsFor, UNIT_SHORT, type Unit } from '../../../shared/units.ts';
import type { PrepMode } from '../../../shared/kitchen.ts';

const NEW = 'nuevo';

interface Line {
  item_id: string;
  qty: string;
  unit: Unit;
}

export function PreparationForm({ prep, defaultMode, onClose }: { prep?: Preparation; defaultMode?: PrepMode; onClose: () => void }) {
  const { bump } = useApp();
  const toast = useToast();
  const items = useApi<Item[]>('/items');
  const [name, setName] = useState(prep?.name ?? '');
  const [mode, setMode] = useState<PrepMode>(prep?.mode ?? defaultMode ?? 'transformacion');
  const [outputId, setOutputId] = useState(prep ? String(prep.output_item_id) : '');
  const [lines, setLines] = useState<Line[]>(
    prep?.inputs.map((i) => ({ item_id: String(i.item_id), qty: String(fromMilli(i.qty_m, i.unit)), unit: i.unit })) ?? [{ item_id: '', qty: '1000', unit: 'g' }],
  );
  const [std, setStd] = useState(prep ? String(fromMilli(prep.std_output_m, niceUnit(prep.std_output_m, prep.output_base))) : '');
  const [stdUnit, setStdUnit] = useState<Unit>(prep ? niceUnit(prep.std_output_m, prep.output_base) : 'g');
  const [instructions, setInstructions] = useState(prep?.instructions ?? '');
  const [busy, setBusy] = useState(false);
  // El resultado puede ser nuevo: se crea solo en la nevera negra como preparación.
  const [newOutput, setNewOutput] = useState('');

  const active = (items.data ?? []).filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const output = active.find((i) => String(i.id) === outputId);
  const itemOf = (id: string) => active.find((i) => String(i.id) === id);
  const visibleLines = mode === 'transformacion' ? lines.slice(0, 1) : lines;

  const setLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let outId = Number(outputId);
      if (outputId === NEW) {
        const created = await api.post<Item>('/day-sheet/items', {
          name: newOutput.trim() || name.trim(),
          location: 'Nevera negra',
          kind: 'preparacion',
          unit: stdUnit === 'unidad' ? 'unidad' : stdUnit === 'ml' || stdUnit === 'l' ? 'ml' : 'g',
        });
        outId = created.id;
      }
      const body = {
        name,
        mode,
        output_item_id: outId,
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
            <Field label="Resultado (lo que se guarda en la nevera)" hint={outputId === NEW ? 'Se crea en la nevera negra como preparación.' : 'Si no está en la lista, elige «Nuevo».'}>
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
                <option value={NEW}>+ Nuevo (escribir el nombre)</option>
                {active
                  .filter((i) => !visibleLines.some((l) => l.item_id === String(i.id)))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
              {outputId === NEW && (
                <input className="input mt-2" value={newOutput} onChange={(e) => setNewOutput(e.target.value)} placeholder={name || 'Ej. Salsa de la casa'} maxLength={80} aria-label="Nombre del resultado" />
              )}
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

