// Agregar un ingrediente a la hoja o cambiar cómo se cuenta: dónde está, en qué unidad
// (gramos, kilos, ml, litros o unidades) y si viene en paquete («paquete de 1 kg»).
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi, useApp } from '../../lib/app';
import type { Item } from '../../lib/types';
import { useToast } from '../toast';
import { ConfirmModal, Field, Modal, cx } from '../ui';
import { LOCATIONS, type ItemKind, type Location } from '../../../shared/kitchen.ts';
import { baseOf, fromMilli, UNIT_SHORT, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { parseQty, smallUnit, validQty } from '../kitchen/helpers';

const UNIT_CHOICES: { unit: Unit; label: string; hint: string }[] = [
  { unit: 'g', label: 'Gramos', hint: 'g' },
  { unit: 'kg', label: 'Kilos', hint: 'kg' },
  { unit: 'unidad', label: 'Unidades', hint: 'und' },
  { unit: 'ml', label: 'Mililitros', hint: 'ml' },
  { unit: 'l', label: 'Litros', hint: 'l' },
];
const PACK_LABELS = ['paquete', 'bolsa', 'bolsón', 'bloque', 'caja', 'tarro'];

export interface IngredientBase {
  item_id: number;
  name: string;
  location: Location;
  kind: ItemKind;
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
}

const show = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

export function IngredientModal({
  ingredient,
  defaultLocation,
  onClose,
  onSaved,
}: {
  /** Sin ingrediente: se agrega uno nuevo. */
  ingredient?: IngredientBase;
  defaultLocation?: Location;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const toast = useToast();
  const { bump } = useApp();
  const editing = !!ingredient;
  // El mínimo solo está en el artículo completo.
  const full = useApi<Item>(ingredient ? `/items/${ingredient.item_id}` : null, [ingredient?.item_id]);
  const [name, setName] = useState(ingredient?.name ?? '');
  const [location, setLocation] = useState<Location>(ingredient?.location ?? defaultLocation ?? 'Congelador');
  const [kind, setKind] = useState<ItemKind>(ingredient?.kind ?? 'insumo');
  const [unit, setUnit] = useState<Unit>(ingredient?.unit ?? 'g');
  const [perUnit, setPerUnit] = useState('');
  const [hasPack, setHasPack] = useState((ingredient?.pack_size_m ?? 0) > 0);
  const [packSize, setPackSize] = useState(ingredient && ingredient.pack_size_m > 0 ? show(fromMilli(ingredient.pack_size_m, smallUnit(ingredient.base_unit))) : '');
  const [packLabel, setPackLabel] = useState(ingredient?.pack_label || 'paquete');
  const [packTouched, setPackTouched] = useState(!editing);
  const [min, setMin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const newBase = baseOf(unit);
  const baseChanges = editing && newBase !== ingredient.base_unit;
  const needsPerUnit = baseChanges && (newBase === 'unidad' || ingredient.base_unit === 'unidad');
  const weightUnit = (baseChanges ? (newBase === 'unidad' ? ingredient.base_unit : newBase) : 'g') === 'ml' ? 'ml' : 'g';
  const packUnit = smallUnit(newBase);
  // Si cambia la unidad y no se toca el mínimo, se convierte solo.
  const minShown = min ?? (full.data && full.data.unit === unit ? show(fromMilli(full.data.min_m, full.data.unit)) : '');

  const submit = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Escribe el nombre.';
    if (needsPerUnit && !validQty(perUnit)) e.perUnit = `Escribe cuánto ${weightUnit === 'ml' ? 'mide' : 'pesa'} una unidad.`;
    if (hasPack && packTouched && !validQty(packSize)) e.pack = 'Escribe cuánto trae el paquete.';
    if (min !== null && min.trim() !== '' && !validQty(min, true)) e.min = 'Escribe un número.';
    setErr(e);
    if (Object.keys(e).length) return;
    const body: Record<string, unknown> = { name: name.trim(), location, kind, unit };
    if (needsPerUnit) body.per_unit = parseQty(perUnit);
    if (!hasPack) body.pack_size = null;
    else if (packTouched) {
      body.pack_size = parseQty(packSize);
      body.pack_unit = packUnit;
    }
    if (hasPack) body.pack_label = packLabel;
    // Si cambia la unidad base, el paquete ya guardado se convierte solo en el servidor.
    if (min !== null) body.min = min.trim() === '' ? 0 : parseQty(min);
    setBusy(true);
    try {
      const item = editing ? await api.put<Item>(`/day-sheet/items/${ingredient.item_id}`, body) : await api.post<Item>('/day-sheet/items', body);
      toast.success(editing ? 'Ingrediente actualizado' : 'Ingrediente agregado', editing ? item.name : `${item.name} ya está en la hoja (${location}).`);
      bump();
      onSaved(item);
    } catch (ex) {
      toast.fail(ex);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!ingredient) return;
    setBusy(true);
    try {
      const item = await api.put<Item>(`/day-sheet/items/${ingredient.item_id}`, { active: false });
      toast.success('Se quitó de la hoja', `${ingredient.name} ya no aparece en la hoja del día.`);
      bump();
      onSaved(item);
    } catch (ex) {
      toast.fail(ex);
    } finally {
      setBusy(false);
      setConfirmOff(false);
    }
  };

  const choice = (active: boolean) =>
    cx(
      'rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors',
      active ? 'border-ink-900 bg-ink-900 text-white' : 'border-cream-300 bg-white text-ink-700 hover:border-ink-400',
    );

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={editing ? `Editar: ${ingredient.name}` : 'Agregar ingrediente'}
      subtitle={editing ? 'Cómo se cuenta este ingrediente en la hoja.' : 'Queda en la hoja del día desde ya, al final de su nevera.'}
      footer={
        <>
          {editing && (
            <button className="btn-ghost mr-auto text-brand-700" onClick={() => setConfirmOff(true)} disabled={busy}>
              <Trash2 className="size-4" /> Quitar de la hoja
            </button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn bg-ink-900 text-white hover:bg-ink-700" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} {editing ? 'Guardar' : 'Agregar'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nombre" error={err.name}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Butifarra" maxLength={80} />
        </Field>

        <Field label="¿Dónde se guarda?">
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value as Location)}>
            {LOCATIONS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>

        <div>
          <span className="label">¿Qué es?</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={choice(kind === 'insumo')} onClick={() => setKind('insumo')}>
              Se compra
              <span className="block text-xs font-normal opacity-70">Queso, chorizo, tomate…</span>
            </button>
            <button type="button" className={choice(kind === 'preparacion')} onClick={() => setKind('preparacion')}>
              Lo prepara la cocina
              <span className="block text-xs font-normal opacity-70">Cebolla caramelizada, salsas…</span>
            </button>
          </div>
        </div>

        <div>
          <span className="label">¿En qué se cuenta?</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {UNIT_CHOICES.map((u) => (
              <button key={u.unit} type="button" className={choice(unit === u.unit)} onClick={() => setUnit(u.unit)}>
                {u.label}
                <span className="block text-xs font-normal opacity-70">{u.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            Los embutidos (chorizo, butifarra, salchicha) se cuentan mejor por unidades; los quesos y las carnes, por gramos.
          </p>
        </div>

        {needsPerUnit && (
          <Field
            label={`¿Cuánto ${weightUnit === 'ml' ? 'mide' : 'pesa'} una unidad?`}
            error={err.perUnit}
            hint="Con este dato se pasan a la nueva unidad la existencia, las recetas y la historia."
          >
            <div className="flex items-center gap-2">
              <input className="input max-w-36" inputMode="decimal" value={perUnit} onChange={(e) => setPerUnit(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="120" />
              <span className="text-sm text-ink-500">{weightUnit}</span>
            </div>
          </Field>
        )}
        {baseChanges && !needsPerUnit && <p className="rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-700">Entre gramos y mililitros se toma 1 ml = 1 g.</p>}

        <div className="rounded-2xl border border-cream-300 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-ink-900">
            <input type="checkbox" className="size-5 accent-ink-900" checked={hasPack}
              onChange={(e) => {
                setHasPack(e.target.checked);
                // Un paquete nuevo hay que describirlo.
                if (e.target.checked && !ingredient?.pack_size_m) setPackTouched(true);
              }}
            />
            Viene en paquete
          </label>
          <p className="mt-1 text-xs text-ink-500">Así se cuenta como en la hoja de papel: «3 paq + 385 g» (paquetes cerrados + lo que queda del abierto).</p>
          {hasPack && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Cada uno trae" error={err.pack} hint={baseChanges && !packTouched ? 'Se convierte solo a la nueva unidad.' : undefined}>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    inputMode="decimal"
                    value={baseChanges && !packTouched ? '' : packSize}
                    placeholder={baseChanges && !packTouched ? 'Igual que antes' : '1000'}
                    onChange={(e) => {
                      setPackTouched(true);
                      setPackSize(e.target.value.replace(/[^0-9.,]/g, ''));
                    }}
                  />
                  <span className="text-sm text-ink-500">{UNIT_SHORT[packUnit]}</span>
                </div>
              </Field>
              <Field label="Se llama">
                <select className="input" value={packLabel} onChange={(e) => setPackLabel(e.target.value)}>
                  {PACK_LABELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <Field label="Avisar cuando quede menos de (opcional)" error={err.min}>
          <div className="flex items-center gap-2">
            <input className="input max-w-36" inputMode="decimal" value={minShown} onChange={(e) => setMin(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" />
            <span className="text-sm text-ink-500">{UNIT_SHORT[unit]}</span>
          </div>
        </Field>
      </div>

      <ConfirmModal open={confirmOff} onClose={() => setConfirmOff(false)} onConfirm={() => void deactivate()} title="¿Quitar de la hoja?" confirmText="Quitar" danger busy={busy}>
        <b>{ingredient?.name}</b> ya no aparecerá en la hoja del día. Lo que ya se anotó se conserva. Si se usa en una receta, primero hay que quitarlo de esa receta.
      </ConfirmModal>
    </Modal>
  );
}
