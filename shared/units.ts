// Unidades de medida y conversiones.
// Internamente todas las cantidades se guardan como ENTEROS en milésimas de la
// unidad base (g, ml o unidad). Así 1,5 kg de queso = 1.500.000 (milésimas de g)
// y nunca se acumulan errores de coma flotante al sumar o restar.

export type BaseUnit = 'g' | 'ml' | 'unidad';
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'unidad';

export const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'unidad'];

export const UNIT_LABELS: Record<Unit, string> = {
  g: 'Gramos (g)',
  kg: 'Kilogramos (kg)',
  ml: 'Mililitros (ml)',
  l: 'Litros (l)',
  unidad: 'Unidades',
};

export const UNIT_SHORT: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  unidad: 'und',
};

const BASE_OF: Record<Unit, BaseUnit> = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', unidad: 'unidad' };
// Cuántas milésimas de la unidad base hay en 1 de la unidad indicada.
const MILLI_FACTOR: Record<Unit, number> = { g: 1_000, kg: 1_000_000, ml: 1_000, l: 1_000_000, unidad: 1_000 };

export function isUnit(u: unknown): u is Unit {
  return typeof u === 'string' && (UNITS as string[]).includes(u);
}

export function baseOf(unit: Unit): BaseUnit {
  return BASE_OF[unit];
}

export function compatible(a: Unit, b: Unit): boolean {
  return BASE_OF[a] === BASE_OF[b];
}

/** Unidades en las que se puede expresar algo guardado en la unidad base dada. */
export function unitsFor(base: BaseUnit): Unit[] {
  return UNITS.filter((u) => BASE_OF[u] === base);
}

/** Convierte una cantidad escrita por el usuario a milésimas de la unidad base. */
export function toMilli(value: number, unit: Unit): number {
  return Math.round(value * MILLI_FACTOR[unit]);
}

/** Convierte milésimas de la unidad base a la unidad indicada (para mostrar). */
export function fromMilli(milli: number, unit: Unit): number {
  return milli / MILLI_FACTOR[unit];
}

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export function formatNumber(n: number): string {
  return nf.format(n);
}

/** "1,5 kg" a partir de milésimas de base y la unidad de presentación. */
export function formatQty(milli: number, unit: Unit): string {
  return `${nf.format(fromMilli(milli, unit))} ${UNIT_SHORT[unit]}`;
}

/** Elige una unidad cómoda para mostrar consumos (g → kg si es grande, etc.). */
export function niceUnit(milli: number, base: BaseUnit): Unit {
  if (base === 'g') return Math.abs(milli) >= 1_000_000 ? 'kg' : 'g';
  if (base === 'ml') return Math.abs(milli) >= 1_000_000 ? 'l' : 'ml';
  return 'unidad';
}

export type StockStatus = 'disponible' | 'bajo' | 'agotado';

export function stockStatus(qtyMilli: number, minMilli: number): StockStatus {
  if (qtyMilli <= 0) return 'agotado';
  if (qtyMilli <= minMilli) return 'bajo';
  return 'disponible';
}
