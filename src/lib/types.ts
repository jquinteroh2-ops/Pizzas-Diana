import type { BaseUnit, StockStatus, Unit } from '../../shared/units.ts';
import type { Role, ExtraPerm } from '../../shared/permissions.ts';
import type {
  CountKind,
  CountStatus,
  ItemKind,
  Location,
  PrepMode,
  ShortageLevel,
  ShortageStatus,
  WasteReason,
  WasteStatus,
} from '../../shared/kitchen.ts';

export type { Role, ExtraPerm };

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  perms: ExtraPerm[];
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  can_login?: boolean;
}

export interface Session {
  user: User | null;
  needsSetup: boolean;
  demoMode: boolean;
  today: string;
}

export const ITEM_CATEGORIES = [
  'Carnes y embutidos',
  'Lácteos',
  'Verduras y frutas',
  'Salsas y aderezos',
  'Masas y panes',
  'Abarrotes',
  'Ingredientes',
  'Productos preparados',
  'Bebidas',
  'Empaques',
  'Otros',
] as const;
export const PRODUCT_CATEGORIES = ['Pizzas', 'Hamburguesas', 'Perros', 'Salchipapas', 'Picadas', 'Pollo', 'Bebidas', 'Entradas', 'Postres', 'Otros'] as const;

export interface Item {
  id: number;
  name: string;
  category: string;
  base_unit: BaseUnit;
  unit: Unit;
  qty_m: number;
  min_m: number;
  status: StockStatus;
  kind: ItemKind;
  location: Location;
  pack_size_m: number;
  pack_label: string;
  sort_order: number;
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'inicial' | 'entrada' | 'ajuste' | 'venta' | 'anulacion' | 'produccion' | 'baja' | 'conteo';

export interface Movement {
  id: number;
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  unit: Unit;
  created_at: string;
  type: MovementType;
  delta_m: number;
  after_m: number;
  reason: string;
  user_name: string;
  sale_id: string | null;
  is_demo: number;
}

export interface RecipeLine {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  item_unit: Unit;
  item_active: boolean;
  unit: Unit;
  qty_m: number;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  description: string;
  type: 'preparado' | 'directo';
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  recipe: RecipeLine[];
  warnings: string[];
}

export interface Requirement {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  unit: Unit;
  needed_m: number;
  available_m: number;
  after_m: number;
  short_m: number;
}

export interface SalePreview {
  items: { productId: number; name: string; qty: number }[];
  requirements: Requirement[];
  totalUnits: number;
  ok: boolean;
  shortages: Requirement[];
}

export interface Sale {
  id: string;
  created_at: string;
  local_date: string;
  total_units: number;
  status: 'confirmada' | 'anulada';
  user_id: number;
  user_name: string;
  annulled_by_name: string | null;
  annulled_at: string | null;
  annul_reason: string | null;
  is_demo: number;
  items: { product_id: number; product_name: string; qty: number }[];
}

export interface SaleDetail extends Sale {
  consumption: {
    product_id: number;
    product_name: string;
    item_id: number;
    item_name: string;
    base_unit: BaseUnit;
    per_unit_m: number;
    total_m: number;
  }[];
}

export interface Range {
  from: string;
  to: string;
}

export interface Alert {
  id: number;
  name: string;
  category: string;
  base_unit: BaseUnit;
  unit: Unit;
  qty_m: number;
  min_m: number;
  status: StockStatus;
}

export interface Dashboard {
  today: string;
  ranges: { week: Range; month: Range };
  units: { today: number; week: number; month: number };
  stock: { total: number; low: number; out: number };
  recent: { id: string; created_at: string; total_units: number; status: string; is_demo: number; user_name: string; items: { product_name: string; qty: number }[] }[];
  alerts: Alert[];
  hasSales: boolean;
  kitchen: KitchenSummary;
}

export interface KitchenSummary {
  pendingWastes: number;
  openShortages: number;
  pendingCounts: number;
  tasksToday: { total: number; done: number };
  productionsWeek: number;
  lowYield: { id: number; preparation_name: string; efficiency_pct: number | null; local_date: string; user_name: string }[];
}

export interface ProductUnits {
  product_id: number;
  name: string;
  units: number;
}

export interface Charts {
  series: { range: Range; data: { date: string; units: number; sales: number }[] };
  top: { range: Range; data: ProductUnits[] };
}

export interface Consumption {
  item_id: number;
  name: string;
  base_unit: BaseUnit;
  unit: Unit;
  total_m: number;
}

export interface PeriodReport {
  period: 'dia' | 'semana' | 'mes';
  range: Range;
  prev: Range;
  total: number;
  prevTotal: number;
  salesCount: number;
  annulled: number;
  byProduct: ProductUnits[];
  prevByProduct: ProductUnits[];
  consumption: Consumption[];
  evolution: { label: string; from: string; to: string; units: number }[];
}

export interface DemoStatus {
  demoMode: boolean;
  real: { items: number; products: number; sales: number };
  demo: { items: number; products: number; sales: number };
}

// ---------- Cocina ----------

export interface PrepInput {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  item_unit: Unit;
  unit: Unit;
  qty_m: number;
  available_m: number;
}

export interface Preparation {
  id: number;
  name: string;
  mode: PrepMode;
  output_item_id: number;
  output_name: string;
  output_unit: Unit;
  output_base: BaseUnit;
  output_available_m: number;
  std_output_m: number;
  std_yield_pct: number | null;
  instructions: string;
  active: boolean;
  is_demo: boolean;
  inputs: PrepInput[];
  last_production_at: string | null;
}

export interface Production {
  id: number;
  preparation_id: number;
  preparation_name: string;
  mode: PrepMode;
  output_item_id: number;
  output_name: string;
  output_unit: Unit;
  output_m: number;
  expected_m: number;
  merma_util_m: number;
  merma_inutil_m: number;
  yield_pct: number | null;
  efficiency_pct: number | null;
  low: boolean;
  note: string;
  status: 'activa' | 'anulada';
  user_id: number;
  user_name: string;
  created_at: string;
  local_date: string;
  annul_reason: string | null;
  is_demo: number;
  inputs: { item_id: number; item_name: string; unit: Unit; base_unit: BaseUnit; qty_m: number }[];
}

export interface Waste {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: Unit;
  base_unit: BaseUnit;
  item_qty_m: number;
  qty_m: number;
  unit: Unit;
  reason: WasteReason;
  note: string;
  has_photo: boolean;
  status: WasteStatus;
  reported_by: number;
  reported_by_name: string;
  reported_at: string;
  local_date: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  is_demo: number;
}

export interface Shortage {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: Unit;
  base_unit: BaseUnit;
  location: Location;
  qty_m: number;
  min_m: number;
  level: ShortageLevel;
  note: string;
  status: ShortageStatus;
  reported_by_name: string;
  created_at: string;
  updated_at: string;
  is_demo: number;
}

export interface ShoppingLine {
  item_id: number;
  name: string;
  location: Location;
  category: string;
  unit: Unit;
  base_unit: BaseUnit;
  qty_m: number;
  min_m: number;
  status: StockStatus;
  suggested_m: number;
  shortage: { id: number; level: ShortageLevel; status: ShortageStatus; note: string; reported_by_name: string; created_at: string } | null;
}

export interface CountSheetLine {
  item_id: number;
  name: string;
  unit: Unit;
  base_unit: BaseUnit;
  qty_m: number;
  pack_size_m: number;
  pack_label: string;
  kind: ItemKind;
}

export interface CountSheet {
  location: Location;
  lines: CountSheetLine[];
}

export interface CountLine {
  item_id: number;
  item_name: string;
  unit: Unit;
  base_unit: BaseUnit;
  expected_m: number;
  counted_m: number;
  diff_m: number;
}

export interface Count {
  id: number;
  location: Location;
  kind: CountKind;
  status: CountStatus;
  note: string;
  counted_by: number;
  counted_by_name: string;
  counted_at: string;
  local_date: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  is_demo: number;
  lines_count: number;
  diff_count: number;
  lines?: CountLine[];
}

export interface PrepTask {
  id: number;
  local_date: string;
  preparation_id: number;
  preparation_name: string;
  output_unit: Unit;
  target_m: number | null;
  note: string;
  production_id: number | null;
  done_by_name: string | null;
  done_at: string | null;
  done_output_m: number | null;
  is_demo: number;
}

export interface WeekPlan {
  from: string;
  to: string;
  tasks: PrepTask[];
}

export interface KitchenToday {
  today: string;
  tasks: PrepTask[];
  productions: Production[];
  wastes: Waste[];
  shortages: Shortage[];
  counts: Count[];
  dayCounts: DayCountStatus[];
}

/** Si ya se contó cada ubicación al abrir y al cerrar. */
export interface DayCountStatus {
  location: Location;
  apertura: { id: number; counted_by_name: string; counted_at: string; status: CountStatus } | null;
  cierre: { id: number; counted_by_name: string; counted_at: string; status: CountStatus } | null;
}

export interface ReconciliationLine {
  item_id: number;
  name: string;
  location: Location;
  unit: Unit;
  base_unit: BaseUnit;
  open_m: number;
  entries_m: number;
  produced_m: number;
  used_m: number;
  waste_m: number;
  close_m: number;
  real_m: number;
  sales_m: number;
  diff_m: number;
}

/** Hoja de inventario diario (como la de papel): Inicio | Entrada | Fin | Consumo. */
export interface InventorySheetLine {
  item_id: number;
  name: string;
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
  open_m: number | null;
  entries_m: number;
  produced_m: number;
  close_m: number | null;
  consumption_m: number | null;
  sales_m: number | null;
  prev_close_m: number | null;
}

export interface InventorySheet {
  date: string;
  sections: (DayCountStatus & { lines: InventorySheetLine[] })[];
}

export interface Reconciliation {
  date: string;
  status: DayCountStatus[];
  lines: ReconciliationLine[];
}

export interface KitchenReport {
  period: 'dia' | 'semana' | 'mes';
  range: Range;
  productions: { preparation_id: number; name: string; unit: Unit; count: number; output_m: number; expected_m: number; merma_m: number; low: number }[];
  productionsCount: number;
  wastes: { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; reason: WasteReason; count: number; qty_m: number }[];
  wastesCount: number;
  entries: { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; count: number; total_m: number }[];
  countDiffs: { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; count: number; diff_m: number }[];
}
