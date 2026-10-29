// La hoja del día: una por fecha, como la de papel. Por cada ingrediente:
//   Inicio (se cuenta al abrir) | Llegó (compras) | Preparado / Usado en preparaciones | Bajas | Fin (se cuenta al cerrar)
// y el sistema calcula solo el CONSUMO = inicio + llegó + preparado − usado en preparaciones − bajas − fin.
// La jefa de cocina compara ese consumo con lo que vendió la caja (según las recetas) y valida el día.
// Lo usan el servidor, el simulador del navegador y la interfaz.
import type { BaseUnit, Unit } from './units.ts';
import type { ItemKind, Location } from './kitchen.ts';

export const SHEET_STATUSES = ['abierta', 'validada'] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export const SHEET_FIELDS = ['open', 'entry', 'close'] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];
export const SHEET_FIELD_LABELS: Record<SheetField, string> = { open: 'Inicio', entry: 'Llegó', close: 'Fin' };

/** Lo que pasó con un ingrediente en el día según los movimientos del sistema. */
export interface DayMoves {
  /** Compras y entradas (neto: una corrección hacia abajo resta). */
  entries_m: number;
  /** Lo que salió de una preparación (cebolla caramelizada, masa, pechuga porcionada…). */
  produced_m: number;
  /** Lo que se usó como ingrediente de una preparación (la cebolla de la caramelizada). */
  used_m: number;
  /** Bajas reportadas ese día (autorizadas o por autorizar; las rechazadas no cuentan). */
  waste_m: number;
}

export interface DaySheetLine extends DayMoves {
  item_id: number;
  name: string;
  location: Location;
  kind: ItemKind;
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
  sort_order: number;
  /** Lo contado al abrir (null = no se ha escrito). */
  open_m: number | null;
  /** Lo contado al cerrar. */
  close_m: number | null;
  /** Lo que se gastó de verdad: inicio + llegó + preparado − usado − bajas − fin. */
  consumption_m: number | null;
  /** Lo que debió gastarse según las ventas de la caja y las recetas. */
  sales_m: number;
  /** Lo que debería quedar al cerrar si todo cuadra con la caja. */
  expected_close_m: number | null;
  /** consumo − ventas. Positivo: se gastó más de lo vendido (falta). Negativo: sobra. */
  diff_m: number | null;
  diff_level: DiffLevel;
  /** Lo contado al cerrar el día anterior (para copiarlo como inicio). */
  prev_close_m: number | null;
  /** Existencia que lleva el sistema ahora mismo. */
  stock_m: number;
}

export type DiffLevel = 'ok' | 'falta' | 'sobra' | 'sin_dato';

/**
 * ¿La diferencia entre lo gastado y lo vendido es para revisar? Se tolera un 5 % (las porciones
 * nunca son exactas) y un mínimo según la unidad: 20 g / 20 ml o media unidad.
 */
export function diffLevel(consumptionM: number | null, salesM: number, base: BaseUnit): DiffLevel {
  if (consumptionM === null) return 'sin_dato';
  const diff = consumptionM - salesM;
  const floor = base === 'unidad' ? 500 : 20_000;
  const tolerance = Math.max(floor, Math.round(Math.max(Math.abs(consumptionM), Math.abs(salesM)) * 0.05));
  if (Math.abs(diff) <= tolerance) return 'ok';
  return diff > 0 ? 'falta' : 'sobra';
}

export function sheetLine(
  item: Pick<DaySheetLine, 'item_id' | 'name' | 'location' | 'kind' | 'unit' | 'base_unit' | 'pack_size_m' | 'pack_label' | 'sort_order' | 'stock_m'>,
  stored: { open_m: number | null; close_m: number | null } | undefined,
  moves: DayMoves,
  salesM: number,
  prevCloseM: number | null,
): DaySheetLine {
  const open = stored?.open_m ?? null;
  const close = stored?.close_m ?? null;
  const flow = moves.entries_m + moves.produced_m - moves.used_m - moves.waste_m;
  const consumption = open !== null && close !== null ? open + flow - close : null;
  return {
    ...item,
    ...moves,
    open_m: open,
    close_m: close,
    consumption_m: consumption,
    sales_m: salesM,
    expected_close_m: open !== null ? open + flow - salesM : null,
    diff_m: consumption === null ? null : consumption - salesM,
    diff_level: diffLevel(consumption, salesM, item.base_unit),
    prev_close_m: prevCloseM,
  };
}

export interface SoldProduct {
  product_id: number;
  product_name: string;
  qty: number;
}

export interface DaySheet {
  date: string;
  status: SheetStatus;
  validated_by_name: string | null;
  validated_at: string | null;
  note: string;
  /** Se puede escribir (no está validada y no es una fecha futura). */
  editable: boolean;
  /** «Llegó» solo se escribe el mismo día: es mercancía que entra al inventario en ese momento. */
  entries_editable: boolean;
  lines: DaySheetLine[];
  /** Lo que vendió la caja ese día. */
  sold: SoldProduct[];
  sold_units: number;
  summary: DaySummary;
}

export interface DaySummary {
  items: number;
  open_filled: number;
  close_filled: number;
  to_review: number;
}

export function summarize(lines: DaySheetLine[]): DaySummary {
  return {
    items: lines.length,
    open_filled: lines.filter((l) => l.open_m !== null).length,
    close_filled: lines.filter((l) => l.close_m !== null).length,
    to_review: lines.filter((l) => l.diff_level === 'falta' || l.diff_level === 'sobra').length,
  };
}

/** Orden de la hoja: por nevera (como en el papel) y dentro de cada una, el orden de la hoja. */
export function sortSheet<T extends { location: string; sort_order: number; name: string }>(lines: T[], locations: readonly string[]): T[] {
  return [...lines].sort(
    (a, b) => locations.indexOf(a.location) - locations.indexOf(b.location) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'),
  );
}

/** Instante en que empieza un día de Colombia (UTC−5 todo el año). */
export function dayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00-05:00`).toISOString();
}

/**
 * Factor para cambiar un ingrediente de una unidad base a otra.
 * - g/ml → unidad: hay que decir cuánto pesa (o mide) UNA unidad.
 * - unidad → g/ml: igual, cuánto pesa una unidad.
 * - g ↔ ml: se toma 1 ml = 1 g (salsas y líquidos de cocina).
 * Devuelve el multiplicador para las cantidades guardadas (milésimas de la base).
 */
export function baseChangeFactor(from: BaseUnit, to: BaseUnit, perUnit: number | null): number {
  if (from === to) return 1;
  if (from !== 'unidad' && to !== 'unidad') return 1;
  if (!perUnit || !Number.isFinite(perUnit) || perUnit <= 0) throw new Error('per_unit');
  return from === 'unidad' ? perUnit : 1 / perUnit;
}
