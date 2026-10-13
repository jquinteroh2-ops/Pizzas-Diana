import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, str } from '../errors.ts';
import { baseOf, compatible, isUnit, stockStatus, toMilli, type BaseUnit, type Unit, type StockStatus } from '../../shared/units.ts';
import type { User } from './users.ts';

export const CATEGORIES = ['Ingredientes', 'Bebidas', 'Empaques', 'Productos preparados', 'Otros'] as const;
export type Category = (typeof CATEGORIES)[number];

export type MovementType = 'inicial' | 'entrada' | 'ajuste' | 'venta' | 'anulacion';

export interface Item {
  id: number;
  name: string;
  category: Category;
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

interface ItemRow extends Omit<Item, 'status' | 'active' | 'is_demo'> {
  active: number;
  is_demo: number;
}

function toItem(r: ItemRow): Item {
  return { ...r, active: !!r.active, is_demo: !!r.is_demo, status: stockStatus(r.qty_m, r.min_m) };
}

function unitOf(v: unknown): Unit {
  if (!isUnit(v)) throw bad('Unidad de medida no válida.');
  return v;
}

export function listItems(db: DB): Item[] {
  return (db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all() as unknown as ItemRow[]).map(toItem);
}

export function getItem(db: DB, id: number): Item {
  const r = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  if (!r) throw notFound('Artículo de inventario no encontrado.');
  return toItem(r);
}

/**
 * Cambia la existencia de un artículo y deja SIEMPRE un movimiento rastreable.
 * Debe llamarse dentro de una transacción. Impide inventario negativo.
 */
export function applyMovement(
  db: DB,
  p: { itemId: number; delta: number; type: MovementType; reason: string; userId: number; saleId?: string; at?: string; isDemo?: boolean },
): number {
  const row = db.prepare('SELECT qty_m, name FROM items WHERE id = ?').get(p.itemId) as { qty_m: number; name: string } | undefined;
  if (!row) throw notFound('Artículo de inventario no encontrado.');
  const after = row.qty_m + p.delta;
  if (after < 0) throw conflict(`La operación dejaría "${row.name}" con existencia negativa.`);
  const at = p.at ?? nowIso();
  db.prepare('UPDATE items SET qty_m = ?, updated_at = ? WHERE id = ?').run(after, at, p.itemId);
  db.prepare(
    'INSERT INTO movements(item_id, created_at, type, delta_m, after_m, reason, user_id, sale_id, is_demo) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(p.itemId, at, p.type, p.delta, after, p.reason, p.userId, p.saleId ?? null, (p.isDemo ?? isDemoMode(db)) ? 1 : 0);
  return after;
}

export function createItem(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}): Item {
  const name = str(body.name, 'nombre', { max: 80 });
  const category = oneOf(body.category, 'categoría', CATEGORIES);
  const unit = unitOf(body.unit);
  const qty = num(body.qty ?? 0, 'cantidad inicial');
  const min = num(body.min ?? 0, 'cantidad mínima');
  const exists = db.prepare('SELECT 1 FROM items WHERE name = ? COLLATE NOCASE AND active = 1').get(name);
  if (exists) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
  const demo = isDemoMode(db) ? 1 : 0;
  const at = opts.at ?? nowIso();

  return tx(db, () => {
    const r = db
      .prepare('INSERT INTO items(name, category, base_unit, unit, qty_m, min_m, is_demo, created_at, updated_at) VALUES (?,?,?,?,0,?,?,?,?)')
      .run(name, category, baseOf(unit), unit, toMilli(min, unit), demo, at, at);
    const id = Number(r.lastInsertRowid);
    const qm = toMilli(qty, unit);
    if (qm > 0) applyMovement(db, { itemId: id, delta: qm, type: 'inicial', reason: 'Existencia inicial', userId: user.id, at });
    return getItem(db, id);
  });
}

export function updateItem(db: DB, id: number, body: Record<string, unknown>): Item {
  const item = getItem(db, id);
  const name = body.name === undefined ? item.name : str(body.name, 'nombre', { max: 80 });
  const category = body.category === undefined ? item.category : oneOf(body.category, 'categoría', CATEGORIES);
  const unit = body.unit === undefined ? item.unit : unitOf(body.unit);
  if (!compatible(unit, item.unit)) {
    throw bad(`No se puede cambiar de ${item.unit} a ${unit}: son unidades incompatibles.`);
  }
  const min = body.min === undefined ? item.min_m : toMilli(num(body.min, 'cantidad mínima'), unit);
  const dup = db.prepare('SELECT 1 FROM items WHERE name = ? COLLATE NOCASE AND active = 1 AND id <> ?').get(name, id);
  if (dup) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
  db.prepare('UPDATE items SET name=?, category=?, unit=?, min_m=?, updated_at=? WHERE id=?').run(name, category, unit, min, nowIso(), id);
  return getItem(db, id);
}

export function setItemActive(db: DB, id: number, active: boolean): Item {
  getItem(db, id);
  if (!active) {
    const used = db
      .prepare('SELECT p.name FROM recipe_lines r JOIN products p ON p.id = r.product_id WHERE r.item_id = ? AND p.active = 1')
      .all(id) as { name: string }[];
    if (used.length) {
      throw conflict(`No se puede desactivar: se usa en la receta de ${used.map((u) => u.name).join(', ')}. Quítalo de esas recetas primero.`);
    }
  }
  db.prepare('UPDATE items SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), id);
  return getItem(db, id);
}

/** Entrada de mercancía (compra, donación, producción...). */
export function registerEntry(db: DB, user: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): Item {
  const item = getItem(db, id);
  if (!item.active) throw conflict('El artículo está desactivado.');
  const unit = body.unit === undefined ? item.unit : unitOf(body.unit);
  if (!compatible(unit, item.unit)) throw bad('La unidad no es compatible con la del artículo.');
  const qty = num(body.qty, 'cantidad', { allowZero: false });
  const reason = str(body.reason ?? 'Entrada de mercancía', 'motivo', { max: 200 });
  return tx(db, () => {
    applyMovement(db, { itemId: id, delta: toMilli(qty, unit), type: 'entrada', reason, userId: user.id, at: opts.at });
    return getItem(db, id);
  });
}

/**
 * Ajuste manual autorizado. mode "set" fija la existencia contada físicamente;
 * mode "delta" suma o resta. El motivo es obligatorio.
 */
export function registerAdjustment(db: DB, user: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): Item {
  const item = getItem(db, id);
  const unit = body.unit === undefined ? item.unit : unitOf(body.unit);
  if (!compatible(unit, item.unit)) throw bad('La unidad no es compatible con la del artículo.');
  const mode = oneOf(body.mode, 'tipo de ajuste', ['set', 'delta'] as const);
  const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
  const raw = typeof body.value === 'string' ? Number(body.value.replace(',', '.')) : body.value;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw bad('La cantidad del ajuste no es válida.');
  if (mode === 'set' && raw < 0) throw bad('La existencia no puede ser negativa.');
  const delta = mode === 'set' ? toMilli(raw, unit) - item.qty_m : toMilli(raw, unit);
  if (delta === 0) throw bad('El ajuste no cambia la existencia.');
  return tx(db, () => {
    applyMovement(db, { itemId: id, delta, type: 'ajuste', reason, userId: user.id, at: opts.at });
    return getItem(db, id);
  });
}

export interface MovementView {
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

export function listMovements(db: DB, q: { itemId?: number; type?: string; limit?: number }): MovementView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.itemId) {
    where.push('m.item_id = ?');
    params.push(q.itemId);
  }
  if (q.type) {
    where.push('m.type = ?');
    params.push(oneOf(q.type, 'tipo', ['inicial', 'entrada', 'ajuste', 'venta', 'anulacion'] as const));
  }
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 1000);
  params.push(limit);
  return db
    .prepare(
      `SELECT m.*, i.name item_name, i.base_unit, i.unit, u.name user_name
       FROM movements m JOIN items i ON i.id = m.item_id JOIN users u ON u.id = m.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    )
    .all(...params) as unknown as MovementView[];
}
