// Reglas de cocina compartidas por el servidor, el simulador del navegador y la interfaz.
import { fromMilli, formatNumber, UNIT_SHORT, type Unit } from './units.ts';

/** Dónde se guarda cada cosa. El orden es el de la hoja de conteo de Pizza Diana. */
export const LOCATIONS = ['Congelador', 'Nevera negra', 'Nevera Coca-Cola', 'Bodega seca', 'Otro'] as const;
export type Location = (typeof LOCATIONS)[number];

export const ITEM_KINDS = ['insumo', 'preparacion'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const KIND_LABELS: Record<ItemKind, string> = { insumo: 'Insumo (se compra)', preparacion: 'Preparación (la hace la cocina)' };

export const PREP_MODES = ['transformacion', 'lote'] as const;
export type PrepMode = (typeof PREP_MODES)[number];
export const PREP_MODE_LABELS: Record<PrepMode, string> = {
  transformacion: 'Transformación (un insumo con merma)',
  lote: 'Receta por lote (varios ingredientes)',
};

export const WASTE_REASONS = ['vencido', 'danado', 'mal_preparado', 'accidente', 'devolucion', 'otro'] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];
export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  vencido: 'Vencido',
  danado: 'Dañado o con moho',
  mal_preparado: 'Quemado o mal preparado',
  accidente: 'Se cayó o se regó',
  devolucion: 'Devolución de cliente',
  otro: 'Otro motivo',
};

export const WASTE_STATUSES = ['pendiente', 'aprobada', 'rechazada'] as const;
export type WasteStatus = (typeof WASTE_STATUSES)[number];

export const SHORTAGE_LEVELS = ['poco', 'agotado'] as const;
export type ShortageLevel = (typeof SHORTAGE_LEVELS)[number];
export const SHORTAGE_LEVEL_LABELS: Record<ShortageLevel, string> = { poco: 'Queda poco', agotado: 'Se acabó' };

export const SHORTAGE_STATUSES = ['abierto', 'pedido', 'recibido', 'descartado'] as const;
export type ShortageStatus = (typeof SHORTAGE_STATUSES)[number];
export const SHORTAGE_STATUS_LABELS: Record<ShortageStatus, string> = {
  abierto: 'Por pedir',
  pedido: 'Pedido',
  recibido: 'Recibido',
  descartado: 'Descartado',
};

/** Tipos de movimiento del inventario. «porcionado» = la merma que se bota al porcionar. */
export const MOVEMENT_TYPES = ['inicial', 'entrada', 'ajuste', 'venta', 'anulacion', 'produccion', 'baja', 'conteo', 'porcionado'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const COUNT_STATUSES = ['pendiente', 'aplicado', 'descartado'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

/** Apertura (al abrir), cierre (al cerrar) o un conteo suelto en cualquier momento. */
export const COUNT_KINDS = ['apertura', 'cierre', 'libre'] as const;
export type CountKind = (typeof COUNT_KINDS)[number];
export const COUNT_KIND_LABELS: Record<CountKind, string> = { apertura: 'Apertura', cierre: 'Cierre', libre: 'Conteo suelto' };

/**
 * Consumo real de un producto entre la apertura y el cierre, como en la hoja de papel:
 * lo que había al abrir + lo que entró + lo que se preparó − lo que se usó para preparar
 * − las bajas − la merma al porcionar − lo que quedó al cerrar. Las ventas NO entran aquí: son el otro dato a comparar.
 */
export function realConsumption(p: { openM: number; closeM: number; entriesM: number; producedM: number; usedForPrepM: number; wasteM: number; trimM?: number }) {
  return p.openM + p.entriesM + p.producedM - p.usedForPrepM - p.wasteM - (p.trimM ?? 0) - p.closeM;
}

/**
 * Porcionar: la cocina parte un insumo en porciones estándar. Las porciones siguen siendo
 * el mismo artículo (no se duplica el inventario); solo sale lo que se botó (merma).
 * Rendimiento = lo porcionado / (lo porcionado + la merma).
 */
export function portioningYield(outputM: number, mermaM: number): number | null {
  const total = outputM + mermaM;
  return total > 0 ? Math.round((outputM / total) * 1000) / 10 : null;
}

/** Por debajo de este % del rendimiento estándar, la preparación se marca para revisar. */
export const LOW_EFFICIENCY_PCT = 90;

/**
 * Rendimiento de una preparación.
 * - yieldPct: cuánto salió frente a lo que entró del ingrediente base (solo si comparten unidad base).
 * - efficiencyPct: cuánto salió frente a lo que debía salir según la receta estándar.
 */
export function productionYield(p: { baseInputM: number; outputM: number; expectedM: number; sameBase: boolean }) {
  const yieldPct = p.sameBase && p.baseInputM > 0 ? round1((p.outputM / p.baseInputM) * 100) : null;
  const efficiencyPct = p.expectedM > 0 ? round1((p.outputM / p.expectedM) * 100) : null;
  return { yieldPct, efficiencyPct, low: efficiencyPct !== null && efficiencyPct < LOW_EFFICIENCY_PCT };
}

/** Cantidades de un lote escaladas según lo que se use del ingrediente base (el primero de la receta). */
export function scaleBatch<T extends { qty_m: number }>(inputs: T[], stdOutputM: number, baseQtyM: number) {
  const base = inputs[0]?.qty_m ?? 0;
  const factor = base > 0 ? baseQtyM / base : 0;
  return {
    factor,
    inputs: inputs.map((i, idx) => ({ ...i, qty_m: idx === 0 ? baseQtyM : Math.round(i.qty_m * factor) })),
    expectedM: Math.round(stdOutputM * factor),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Paquetes + sueltos → milésimas de la unidad base. */
export function packsToMilli(packs: number, loose: number, packSizeM: number, looseMilliFactor: number) {
  return Math.round(packs * packSizeM + loose * looseMilliFactor);
}

/** "3 paquetes + 385 g" a partir de una existencia y el tamaño del paquete. */
export function formatPacks(milli: number, packSizeM: number, packLabel: string, unit: Unit): string | null {
  if (packSizeM <= 0) return null;
  const packs = Math.floor(milli / packSizeM);
  const rest = milli - packs * packSizeM;
  const label = packLabel || 'paquete';
  // Las abreviaturas («paq», «und») no llevan plural.
  const plural = packs === 1 || label.length <= 4 ? label : /[aeo]$/.test(label) ? label + 's' : label + 'es';
  // Lo suelto se muestra en la unidad pequeña: "3 paquetes + 385 g", no "+ 0,385 kg".
  const looseUnit: Unit = unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit;
  const parts: string[] = [];
  if (packs > 0) parts.push(`${packs} ${plural}`);
  if (rest > 0 || packs === 0) parts.push(`${formatNumber(fromMilli(rest, looseUnit))} ${UNIT_SHORT[looseUnit]}`);
  return parts.join(' + ');
}

// ---------- Presentaciones: cómo viene y en qué se porciona ----------
//
// Un insumo es UN solo artículo, aunque se guarde de varias formas: el paquete cerrado
// como llegó, porciones que hizo la cocina y lo suelto (o el bloque de queso abierto).
// Porcionar no crea otro artículo: así no hay que contar dos veces lo mismo.

/** Porción estándar en que la cocina parte un insumo (porción picada 80 g, bolsa de papas 250 g…). */
export interface Portion {
  label: string;
  /** En milésimas de la unidad base del artículo. */
  size_m: number;
}

export const MAX_PORTIONS = 6;

/** Lo que se escribió al contar un producto: paquetes cerrados + porciones + suelto. */
export interface CountDetail {
  packs: number;
  pack_size_m: number;
  pack_label: string;
  portions: { label: string; size_m: number; n: number }[];
  loose_m: number;
}

export function detailMilli(d: CountDetail): number {
  return Math.round(d.packs * d.pack_size_m) + d.portions.reduce((s, p) => s + p.n * p.size_m, 0) + d.loose_m;
}

/** Unidad pequeña para pesar: g en lugar de kg, ml en lugar de l. */
export function smallUnitOf(base: 'g' | 'ml' | 'unidad'): Unit {
  return base === 'g' ? 'g' : base === 'ml' ? 'ml' : 'unidad';
}

const qtySmall = (m: number, base: 'g' | 'ml' | 'unidad') => `${formatNumber(fromMilli(m, smallUnitOf(base)))} ${UNIT_SHORT[smallUnitOf(base)]}`;
const short = (label: string) => (label === 'paquete' ? 'paq' : label);

/** «paquete × 10 und» o «bloque × 2.500 g»: lo que va al lado del nombre. */
export function presentationText(i: { base_unit: 'g' | 'ml' | 'unidad'; pack_size_m: number; pack_label: string }): string {
  return i.pack_size_m > 0 ? `${i.pack_label || 'paquete'} × ${qtySmall(i.pack_size_m, i.base_unit)}` : '';
}

/** «2 paq + 12 porción picada + 350 g», como se escribió al contar. */
export function detailText(d: CountDetail, base: 'g' | 'ml' | 'unidad'): string {
  const parts: string[] = [];
  if (d.packs > 0) parts.push(`${formatNumber(d.packs)} ${short(d.pack_label)}`);
  for (const p of d.portions) if (p.n > 0) parts.push(`${formatNumber(p.n)} ${p.label}`);
  if (d.loose_m > 0 || parts.length === 0) parts.push(qtySmall(d.loose_m, base));
  return parts.join(' + ');
}

/**
 * Paquetes cerrados y lo que queda del abierto. Sirve para el queso: «3 bloques y el
 * abierto lleva 380 g consumidos», sin porcionarlo.
 */
export function openPack(milli: number, packSizeM: number) {
  if (packSizeM <= 0 || milli <= 0) return null;
  const closed = Math.floor(milli / packSizeM);
  const openM = milli - closed * packSizeM;
  return { closed, openM, consumedM: openM > 0 ? packSizeM - openM : 0 };
}

type Bad = (msg: string) => Error;

/** Valida la lista de porciones de un artículo: [{ label, size, unit }]. */
export function parsePortions(raw: unknown, itemUnit: Unit, toMilliFn: (v: number, u: Unit) => number, isCompatible: (u: Unit) => boolean, bad: Bad): Portion[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw bad('Las porciones no son válidas.');
  if (raw.length > MAX_PORTIONS) throw bad(`Máximo ${MAX_PORTIONS} tamaños de porción por artículo.`);
  const seen = new Set<string>();
  return (raw as Record<string, unknown>[]).map((p) => {
    const label = typeof p?.label === 'string' ? p.label.trim() : '';
    if (!label || label.length > 30) throw bad('Cada porción necesita un nombre corto (máximo 30 letras).');
    if (seen.has(label.toLowerCase())) throw bad(`La porción «${label}» está repetida.`);
    seen.add(label.toLowerCase());
    const unit = (p.unit ?? itemUnit) as Unit;
    if (!isCompatible(unit)) throw bad(`La unidad de la porción «${label}» no es compatible con el artículo.`);
    const n = typeof p.size === 'string' ? Number(p.size.replace(',', '.')) : p.size;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw bad(`El tamaño de la porción «${label}» debe ser mayor que cero.`);
    return { label, size_m: toMilliFn(n, unit) };
  });
}

/**
 * Convierte lo que se escribió en una línea de conteo a una cantidad y su desglose.
 * Acepta { packs, portions: [n por cada porción del artículo], loose (en la unidad pequeña) }
 * o la forma anterior { qty, unit }.
 */
export function countInput(
  item: { name: string; base_unit: 'g' | 'ml' | 'unidad'; pack_size_m: number; pack_label: string; portions: Portion[] },
  l: Record<string, unknown>,
  parseQty: (v: unknown, unit: unknown) => number,
  bad: Bad,
): { countedM: number; detail: CountDetail | null } {
  const has = (v: unknown) => v !== undefined && v !== null && v !== '';
  if (!has(l.packs) && !has(l.portions) && !has(l.loose)) return { countedM: parseQty(l.qty, l.unit), detail: null };
  const n = (v: unknown, field: string) => {
    if (!has(v)) return 0;
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1e7) throw bad(`${field} de «${item.name}» no es válido.`);
    return x;
  };
  const packs = item.pack_size_m > 0 ? n(l.packs, 'El número de paquetes') : 0;
  const counts = Array.isArray(l.portions) ? l.portions : [];
  if (counts.length > item.portions.length) throw bad(`«${item.name}» no tiene tantas porciones configuradas.`);
  const portions = item.portions.map((p, i) => ({ label: p.label, size_m: p.size_m, n: Math.round(n(counts[i], `Las porciones «${p.label}»`)) }));
  const loose_m = has(l.loose) ? parseQty(l.loose, smallUnitOf(item.base_unit)) : 0;
  const detail: CountDetail = { packs, pack_size_m: item.pack_size_m, pack_label: item.pack_label || 'paquete', portions: portions.filter((p) => p.n > 0), loose_m };
  return { countedM: detailMilli(detail), detail };
}

/** Lo que entra en una recepción: paquetes × lo que trae cada uno + lo suelto. */
export function entryMilli(item: { pack_size_m: number }, packs: number, looseM: number): number {
  return Math.round(packs * item.pack_size_m) + looseM;
}
