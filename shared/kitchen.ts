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

export const COUNT_STATUSES = ['pendiente', 'aplicado', 'descartado'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

/** Apertura (al abrir), cierre (al cerrar) o un conteo suelto en cualquier momento. */
export const COUNT_KINDS = ['apertura', 'cierre', 'libre'] as const;
export type CountKind = (typeof COUNT_KINDS)[number];
export const COUNT_KIND_LABELS: Record<CountKind, string> = { apertura: 'Apertura', cierre: 'Cierre', libre: 'Conteo suelto' };

/**
 * Consumo real de un producto entre la apertura y el cierre, como en la hoja de papel:
 * lo que había al abrir + lo que entró + lo que se preparó − lo que se usó para preparar
 * − las bajas − lo que quedó al cerrar. Las ventas NO entran aquí: son el otro dato a comparar.
 */
export function realConsumption(p: { openM: number; closeM: number; entriesM: number; producedM: number; usedForPrepM: number; wasteM: number }) {
  return p.openM + p.entriesM + p.producedM - p.usedForPrepM - p.wasteM - p.closeM;
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
