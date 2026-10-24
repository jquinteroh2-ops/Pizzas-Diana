// Faltantes que reporta el personal y lista de compras del administrador.
import { type DB, nowIso, isDemoMode, mapAsync } from '../db.ts';
import { bad, conflict, notFound, oneOf, optStr } from '../errors.ts';
import { stockStatus, type BaseUnit, type StockStatus, type Unit } from '../../shared/units.ts';
import { SHORTAGE_LEVELS, SHORTAGE_STATUSES, type Location, type ShortageLevel, type ShortageStatus } from '../../shared/kitchen.ts';
import type { User } from './users.ts';

export interface ShortageView {
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

const SELECT = `SELECT s.id, s.item_id, i.name item_name, i.unit item_unit, i.base_unit, i.location, i.qty_m, i.min_m, s.level, s.note, s.status,
  u.name reported_by_name, s.created_at, s.updated_at, s.is_demo
  FROM shortages s JOIN items i ON i.id = s.item_id JOIN users u ON u.id = s.reported_by`;

export async function getShortage(db: DB, id: number): Promise<ShortageView> {
  const r = await db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as ShortageView | undefined;
  if (!r) throw notFound('Faltante no encontrado.');
  return r;
}

/** open = por pedir o pedidos (lo que sigue pendiente). */
export async function listShortages(db: DB, q: { scope?: string; limit?: number }): Promise<ShortageView[]> {
  const open = (q.scope ?? 'open') === 'open';
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 500);
  return await db
    .prepare(`${SELECT} ${open ? "WHERE s.status IN ('abierto','pedido')" : ''} ORDER BY s.status = 'abierto' DESC, s.level = 'agotado' DESC, s.created_at DESC LIMIT ?`)
    .all(limit) as unknown as ShortageView[];
}

/**
 * Reportar que algo falta. Si ya hay un faltante pendiente de ese producto no se
 * duplica: se actualiza (y sube a «Se acabó» si es el caso).
 */
export async function reportShortage(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): Promise<ShortageView & { merged: boolean }> {
  const item = await db.prepare('SELECT id, name, active FROM items WHERE id = ?').get(Number(body.item_id)) as { id: number; name: string; active: number } | undefined;
  if (!item) throw bad('Elige el producto que falta.');
  if (!item.active) throw bad(`"${item.name}" está desactivado en inventario.`);
  const level = oneOf(body.level, 'qué tanto falta', SHORTAGE_LEVELS);
  const note = optStr(body.note, 'nota', 200);
  const at = opts.at ?? nowIso();

  const existing = await db.prepare("SELECT id, level, note FROM shortages WHERE item_id = ? AND status IN ('abierto','pedido') ORDER BY id DESC LIMIT 1").get(item.id) as
    | { id: number; level: ShortageLevel; note: string }
    | undefined;
  if (existing) {
    const newLevel: ShortageLevel = existing.level === 'agotado' || level === 'agotado' ? 'agotado' : 'poco';
    const newNote = note ? (existing.note ? `${existing.note} · ${note}` : note).slice(0, 400) : existing.note;
    await db.prepare('UPDATE shortages SET level=?, note=?, updated_at=? WHERE id=?').run(newLevel, newNote, at, existing.id);
    return { ...await getShortage(db, existing.id), merged: true };
  }
  const r = await db
    .prepare('INSERT INTO shortages(item_id, level, note, reported_by, created_at, updated_at, is_demo) VALUES (?,?,?,?,?,?,?)')
    .run(item.id, level, note, user.id, at, at, (opts.isDemo ?? await isDemoMode(db)) ? 1 : 0);
  return { ...await getShortage(db, Number(r.lastInsertRowid)), merged: false };
}

/** El administrador marca un faltante como pedido, lo descarta o lo vuelve a abrir. */
export async function setShortageStatus(db: DB, admin: User, id: number, body: Record<string, unknown>): Promise<ShortageView> {
  const s = await getShortage(db, id);
  const status = oneOf(body.status, 'estado', SHORTAGE_STATUSES);
  if (status === 'recibido') throw bad('Para marcarlo como recibido registra la entrada de mercancía: así suma al inventario.');
  if (s.status === 'recibido') throw conflict('Este faltante ya se recibió.');
  await db.prepare('UPDATE shortages SET status=?, closed_by=?, updated_at=? WHERE id=?').run(status, status === 'descartado' ? admin.id : null, nowIso(), id);
  return await getShortage(db, id);
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
  /** Para volver a tener el doble del mínimo (solo si hay mínimo configurado). */
  suggested_m: number;
  shortage: { id: number; level: ShortageLevel; status: ShortageStatus; note: string; reported_by_name: string; created_at: string } | null;
}

/** Lista de compras: lo que la gente reportó como faltante + lo que está bajo el mínimo. */
export async function shoppingList(db: DB): Promise<ShoppingLine[]> {
  const items = await db
    .prepare(
      `SELECT id item_id, name, location, category, unit, base_unit, qty_m, min_m FROM items
       WHERE active = 1 AND kind = 'insumo' AND (qty_m <= min_m AND min_m > 0
         OR id IN (SELECT item_id FROM shortages WHERE status IN ('abierto','pedido')))`,
    )
    .all() as Omit<ShoppingLine, 'status' | 'suggested_m' | 'shortage'>[];
  // Las preparaciones no se compran: si faltan, se avisa por el plan de preparación.
  const prepShort = await db
    .prepare(
      `SELECT i.id item_id, i.name, i.location, i.category, i.unit, i.base_unit, i.qty_m, i.min_m FROM items i
       WHERE i.active = 1 AND i.kind = 'preparacion' AND i.id IN (SELECT item_id FROM shortages WHERE status IN ('abierto','pedido'))`,
    )
    .all() as typeof items;
  const shortageOf = db.prepare(
    `SELECT s.id, s.level, s.status, s.note, u.name reported_by_name, s.created_at FROM shortages s JOIN users u ON u.id = s.reported_by
     WHERE s.item_id = ? AND s.status IN ('abierto','pedido') ORDER BY s.id DESC LIMIT 1`,
  );
  const lines = await mapAsync([...items, ...prepShort], async (i) => {
    const status = stockStatus(i.qty_m, i.min_m);
    return {
      ...i,
      status,
      suggested_m: i.min_m > 0 ? Math.max(0, i.min_m * 2 - i.qty_m) : 0,
      shortage: (await shortageOf.get(i.item_id) as ShoppingLine['shortage']) ?? null,
    };
  });
  const rank = (l: ShoppingLine) => (l.shortage?.level === 'agotado' || l.status === 'agotado' ? 0 : 1);
  return lines.sort((a, b) => rank(a) - rank(b) || a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'es'));
}
