// Cantidades de la hoja del día, escritas como en el papel: «3 paq + 385 g» o «1,085 kg».
import { formatQty, UNIT_SHORT, type BaseUnit, type Unit } from '../../../shared/units.ts';
import { formatPacks } from '../../../shared/kitchen.ts';
import { smallUnit } from '../kitchen/helpers';

export interface Measure {
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
  unit_size_m?: number;
}

/** «paq» para paquete (como se escribe en la hoja); los demás nombres tal cual. */
export function packWord(label: string): string {
  return !label || label === 'paquete' ? 'paq' : label;
}

/** Unidad de lo suelto: con paquetes, la pequeña (g, ml, und); sin paquetes, la que eligió la cocina. */
export function looseUnit(m: Measure): Unit {
  return m.pack_size_m > 0 || (m.unit_size_m ?? 0) > 0 ? smallUnit(m.base_unit) : m.unit;
}

export function qtyText(milli: number | null | undefined, m: Measure): string {
  if (milli === null || milli === undefined) return '';
  // En gramos y mililitros no se muestran centésimas: «414,96 g» → «415 g».
  if (m.base_unit !== 'unidad') milli = Math.round(milli / 1000) * 1000;
  if ((m.pack_size_m > 0 || (m.unit_size_m ?? 0) > 0) && milli >= 0) return formatPacks(milli, m.pack_size_m, packWord(m.pack_label), m.unit, m.unit_size_m ?? 0) ?? '';
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
  const us = m.unit_size_m ?? 0;
  const each = us > 0 ? `1 und = ${formatQty(us, smallUnit(m.base_unit))}` : '';
  if (m.pack_size_m <= 0) return each;
  const u = smallUnit(m.base_unit);
  // Paquete contado en unidades: «paquete de 6 und (192 g)».
  if (us > 0 && m.pack_size_m % us === 0) return `${m.pack_label || 'paquete'} de ${m.pack_size_m / us} und (${formatQty(m.pack_size_m, u)})`;
  const size = m.base_unit !== 'unidad' && m.pack_size_m >= 1_000_000 && m.pack_size_m % 1_000_000 === 0 ? formatQty(m.pack_size_m, m.base_unit === 'g' ? 'kg' : 'l') : formatQty(m.pack_size_m, u);
  return `${m.pack_label || 'paquete'} de ${size}`;
}

export const unitShort = (u: Unit) => UNIT_SHORT[u];

export { parseSheetText } from '../../../shared/sheetText.ts';
