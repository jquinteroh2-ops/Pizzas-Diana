import type { BaseUnit, StockStatus, Unit } from '../../shared/units.ts';

export type Role = 'admin' | 'empleado';
export type ExtraPerm = 'entradas' | 'reportes' | 'historial_completo';

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

export const ITEM_CATEGORIES = ['Ingredientes', 'Bebidas', 'Empaques', 'Productos preparados', 'Otros'] as const;
export const PRODUCT_CATEGORIES = ['Pizzas', 'Bebidas', 'Entradas', 'Postres', 'Otros'] as const;

export interface Item {
  id: number;
  name: string;
  category: string;
  base_unit: BaseUnit;
  unit: Unit;
  qty_m: number;
  min_m: number;
  status: StockStatus;
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'inicial' | 'entrada' | 'ajuste' | 'venta' | 'anulacion';

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
