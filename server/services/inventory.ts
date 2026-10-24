import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr, str } from '../errors.ts';
import { baseOf, compatible, isUnit, stockStatus, toMilli, type BaseUnit, type Unit, type StockStatus } from '../../shared/units.ts';
import { ITEM_KINDS, LOCATIONS, MOVEMENT_TYPES, entryMilli, parsePortions, type ItemKind, type Location, type MovementType, type Portion } from '../../shared/kitchen.ts';
import type { User } from './users.ts';

export const CATEGORIES = [
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
export type Category = (typeof CATEGORIES)[number];

export { MOVEMENT_TYPES, type MovementType };

export interface Item {
  id: number;
  name: string;
  category: Category;
  base_unit: BaseUnit;
  unit: Unit;
  qty_m: number;
  min_m: number;
  status: StockStatus;
  kind: ItemKind;
  location: Location;
  pack_size_m: number;
  pack_label: string;
  /** Porciones en que la cocina lo parte. Siguen siendo este mismo artículo. */
  portions: Portion[];
  sort_order: number;
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

interface ItemRow extends Omit<Item, 'status' | 'active' | 'is_demo' | 'portions'> {
  active: number;
  is_demo: number;
  portions: string;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toItem(r: ItemRow): Item {
  return { ...r, portions: parseJson<Portion[]>(r.portions, []), active: !!r.active, is_demo: !!r.is_demo, status: stockStatus(r.qty_m, r.min_m) };
}

function unitOf(v: unknown): Unit {
  if (!isUnit(v)) throw bad('Unidad de medida no válida.');
  return v;
}

export function listItems(db: DB): Item[] {
  return (db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all() as unknown as ItemRow[]).map(toItem);
}

/** Campos de cocina de un artículo: ubicación, tipo y presentación en paquetes. */
function kitchenFields(body: Record<string, unknown>, unit: Unit, current?: Item) {
  const location = body.location === undefined ? (current?.location ?? 'Otro') : oneOf(body.location, 'ubicación', LOCATIONS);
  const kind = body.kind === undefined ? (current?.kind ?? 'insumo') : oneOf(body.kind, 'tipo', ITEM_KINDS);
  let packSize = current?.pack_size_m ?? 0;
  if (body.pack_size !== undefined && body.pack_size !== null && body.pack_size !== '') {
    const packUnit = body.pack_unit === undefined ? unit : unitOf(body.pack_unit);
    if (!compatible(packUnit, unit)) throw bad('La unidad del paquete no es compatible con la del artículo.');
    packSize = toMilli(num(body.pack_size, 'tamaño del paquete'), packUnit);
  } else if (body.pack_size === null || body.pack_size === '') {
    packSize = 0;
  }
  const packLabel = body.pack_label === undefined ? (current?.pack_label ?? '') : optStr(body.pack_label, 'nombre del paquete', 30);
  const sortOrder = body.sort_order === undefined ? (current?.sort_order ?? 0) : Math.round(num(body.sort_order, 'orden', { max: 100_000 }));
  const portions =
    body.portions === undefined ? (current?.portions ?? []) : parsePortions(body.portions, unit, toMilli, (u) => isUnit(u) && compatible(u, unit), (m) => bad(m));
  return { location, kind, packSize, packLabel: packSize > 0 ? packLabel || 'paquete' : '', sortOrder, portions: JSON.stringify(portions) };
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
  const k = kitchenFields(body, unit);
  const exists = db.prepare('SELECT 1 FROM items WHERE name = ? COLLATE NOCASE AND active = 1').get(name);
  if (exists) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
  const demo = isDemoMode(db) ? 1 : 0;
  const at = opts.at ?? nowIso();

  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO items(name, category, base_unit, unit, qty_m, min_m, kind, location, pack_size_m, pack_label, portions, sort_order, is_demo, created_at, updated_at)
         VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(name, category, baseOf(unit), unit, toMilli(min, unit), k.kind, k.location, k.packSize, k.packLabel, k.portions, k.sortOrder, demo, at, at);
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
  const k = kitchenFields(body, unit, item);
  const dup = db.prepare('SELECT 1 FROM items WHERE name = ? COLLATE NOCASE AND active = 1 AND id <> ?').get(name, id);
  if (dup) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
  db.prepare(
    'UPDATE items SET name=?, category=?, unit=?, min_m=?, kind=?, location=?, pack_size_m=?, pack_label=?, portions=?, sort_order=?, updated_at=? WHERE id=?',
  ).run(name, category, unit, min, k.kind, k.location, k.packSize, k.packLabel, k.portions, k.sortOrder, nowIso(), id);
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
    const preps = db
      .prepare(
        `SELECT DISTINCT p.name FROM preparations p LEFT JOIN preparation_inputs pi ON pi.preparation_id = p.id
         WHERE p.active = 1 AND (pi.item_id = ? OR p.output_item_id = ?)`,
      )
      .all(id, id) as { name: string }[];
    if (preps.length) {
      throw conflict(`No se puede desactivar: se usa en la preparación ${preps.map((u) => u.name).join(', ')}. Desactiva esa preparación primero.`);
    }
  }
  db.prepare('UPDATE items SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), id);
  return getItem(db, id);
}

const smallUnit = (b: BaseUnit): Unit => (b === 'g' ? 'g' : b === 'ml' ? 'ml' : 'unidad');

/**
 * Cuánto entra según lo que se escribió: paquetes (× lo que trae cada uno) + suelto.
 * { packs?, qty?, unit? }. Así se cuenta lo que llegó tal como viene: «3 paquetes».
 */
function entryQty(item: Item, body: Record<string, unknown>): number {
  const has = (v: unknown) => v !== undefined && v !== null && v !== '';
  const packs = has(body.packs) ? num(body.packs, `paquetes de ${item.name}`, { max: 100_000 }) : 0;
  if (packs > 0 && item.pack_size_m <= 0) throw bad(`"${item.name}" no tiene configurado cómo viene (tamaño del paquete).`);
  const unit = body.unit === undefined ? item.unit : unitOf(body.unit);
  if (!compatible(unit, item.unit)) throw bad(`La unidad no es compatible con "${item.name}".`);
  const loose = has(body.qty) ? toMilli(num(body.qty, `cantidad de ${item.name}`), unit) : 0;
  const total = entryMilli(item, packs, loose);
  if (total <= 0) throw bad(`Escribe cuánto llegó de "${item.name}".`);
  return total;
}

/** Entrada de mercancía (compra, donación, producción...). */
export function registerEntry(db: DB, user: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): Item {
  const item = getItem(db, id);
  if (!item.active) throw conflict('El artículo está desactivado.');
  const delta = entryQty(item, body);
  const reason = str(body.reason ?? 'Entrada de mercancía', 'motivo', { max: 200 });
  return tx(db, () => {
    const at = opts.at ?? nowIso();
    applyMovement(db, { itemId: id, delta, type: 'entrada', reason, userId: user.id, at });
    // Lo que llegó cierra los faltantes reportados de ese artículo.
    db.prepare("UPDATE shortages SET status='recibido', closed_by=?, updated_at=? WHERE item_id=? AND status IN ('abierto','pedido')").run(user.id, at, id);
    return getItem(db, id);
  });
}

/**
 * Recibir un pedido: varias entradas a la vez, todo o nada.
 * { lines: [{ item_id, packs?, qty?, unit? }], reason? }. Cierra los faltantes de lo que llegó.
 */
export function registerEntries(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}) {
  const raw = body.lines;
  if (!Array.isArray(raw) || raw.length === 0) throw bad('Escribe lo que llegó de al menos un producto.');
  if (raw.length > 300) throw bad('Son demasiados productos en una sola recepción.');
  const reason = str(body.reason ?? 'Recepción de pedido', 'motivo', { max: 200 });
  const seen = new Set<number>();
  const lines = (raw as Record<string, unknown>[]).map((l) => {
    const item = getItem(db, Number(l?.item_id));
    if (!item.active) throw conflict(`"${item.name}" está desactivado.`);
    if (seen.has(item.id)) throw bad(`"${item.name}" está repetido en la recepción.`);
    seen.add(item.id);
    return { item, delta: entryQty(item, l) };
  });
  const at = opts.at ?? nowIso();
  return tx(db, () => {
    const items = lines.map((l) => registerEntry(db, user, l.item.id, { qty: l.delta / 1000, unit: smallUnit(l.item.base_unit), reason }, { at }));
    return { count: items.length, items };
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
    params.push(oneOf(q.type, 'tipo', MOVEMENT_TYPES));
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
