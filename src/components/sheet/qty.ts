// Cantidades de la hoja del día, escritas como en el papel: «3 paq + 385 g» o «1,085 kg».
import { formatNumber, formatQty, fromMilli, toMilli, UNIT_SHORT, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { formatPacks } from '../../../shared/kitchen.ts';
import { parseQty, smallUnit } from '../kitchen/helpers';

export interface Measure {
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
}

/** «paq» para paquete (como se escribe en la hoja); los demás nombres tal cual. */
export function packWord(label: string): string {
  return !label || label === 'paquete' ? 'paq' : label;
}

/** Unidad de lo suelto: con paquetes, la pequeña (g, ml, und); sin paquetes, la que eligió la cocina. */
export function looseUnit(m: Measure): Unit {
  return m.pack_size_m > 0 ? smallUnit(m.base_unit) : m.unit;
}

export function qtyText(milli: number | null | undefined, m: Measure): string {
  if (milli === null || milli === undefined) return '';
  // En gramos y mililitros no se muestran centésimas: «414,96 g» → «415 g».
  if (m.base_unit !== 'unidad') milli = Math.round(milli / 1000) * 1000;
  if (m.pack_size_m > 0 && milli >= 0) return formatPacks(milli, m.pack_size_m, packWord(m.pack_label), m.unit) ?? '';
  return formatQty(milli, m.unit);
}

/** Con signo, para diferencias: «+120 g», «−2 und». */
export function signedText(milli: number, m: Measure): string {
  if (milli === 0) return '0';
  const abs = Math.abs(milli);
  // Las diferencias son pequeñas: se muestran en g, ml o unidades (sin centésimas de gramo).
  const text = m.base_unit === 'unidad' ? formatQty(abs, 'unidad') : formatQty(Math.round(abs / 1000) * 1000, smallUnit(m.base_unit));
  return (milli > 0 ? '+' : '−') + text;
}

/** «paquete de 1 kg», «bolsa de 10 und» (para mostrar junto al nombre). */
export function packDescription(m: Measure): string {
  if (m.pack_size_m <= 0) return '';
  const u = smallUnit(m.base_unit);
  const size = m.base_unit !== 'unidad' && m.pack_size_m >= 1_000_000 && m.pack_size_m % 1_000_000 === 0 ? formatQty(m.pack_size_m, m.base_unit === 'g' ? 'kg' : 'l') : formatQty(m.pack_size_m, u);
  return `${m.pack_label || 'paquete'} de ${size}`;
}

export interface Draft {
  packs: string;
  loose: string;
}

// Sin separador de miles; en g, ml y unidades con máximo 1 decimal (en kg y l se dejan 3).
const show = (n: number, u: Unit) => formatNumber(u === 'kg' || u === 'l' ? n : Math.round(n * 10) / 10).replace(/\./g, '');

export function toDraft(milli: number | null, m: Measure): Draft {
  if (milli === null) return { packs: '', loose: '' };
  if (m.pack_size_m > 0) {
    const packs = Math.floor(milli / m.pack_size_m);
    const rest = milli - packs * m.pack_size_m;
    return { packs: packs ? String(packs) : '', loose: rest || !packs ? show(fromMilli(rest, looseUnit(m)), looseUnit(m)) : '' };
  }
  return { packs: '', loose: show(fromMilli(milli, m.unit), m.unit) };
}

/** null = casilla vacía; NaN = lo escrito no es un número válido. */
export function draftToMilli(d: Draft, m: Measure): number | null {
  const p = d.packs.trim();
  const l = d.loose.trim();
  if (!p && !l) return null;
  const packs = p ? parseQty(p) : 0;
  const loose = l ? parseQty(l) : 0;
  if (!Number.isFinite(packs) || !Number.isFinite(loose) || packs < 0 || loose < 0) return NaN;
  return Math.round(packs * m.pack_size_m) + toMilli(loose, looseUnit(m));
}

export const unitShort = (u: Unit) => UNIT_SHORT[u];
