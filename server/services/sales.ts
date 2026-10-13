import { randomUUID } from 'node:crypto';
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { AppError, bad, conflict, forbidden, int, notFound, str } from '../errors.ts';
import { localDate, isYmd } from '../../shared/dates.ts';
import type { BaseUnit, Unit } from '../../shared/units.ts';
import { applyMovement } from './inventory.ts';
import { getProduct } from './products.ts';
import { can, type User } from './users.ts';

export interface SaleInputItem {
  productId: number;
  qty: number;
}

export interface Requirement {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  unit: Unit;
  needed_m: number;
  available_m: number;
  after_m: number;
  short_m: number; // cuánto falta (0 si alcanza)
}

interface Plan {
  items: { productId: number; name: string; qty: number }[];
  lines: { productId: number; itemId: number; itemName: string; baseUnit: BaseUnit; perUnit: number; total: number }[];
  requirements: Requirement[];
  totalUnits: number;
}

function parseItems(raw: unknown): SaleInputItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw bad('Agrega al menos un producto a la venta.');
  if (raw.length > 50) throw bad('Demasiados productos en una sola venta.');
  // Si el mismo producto viene dos veces se suman las cantidades.
  const merged = new Map<number, number>();
  for (const r of raw as Record<string, unknown>[]) {
    const productId = Number(r?.productId);
    if (!Number.isInteger(productId) || productId <= 0) throw bad('Producto no válido.');
    const qty = int(r?.qty, 'cantidad', 1, 1000);
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  return [...merged].map(([productId, qty]) => ({ productId, qty }));
}

/** Calcula el consumo total de cada ingrediente y compara con la existencia actual. */
function buildPlan(db: DB, items: SaleInputItem[]): Plan {
  const plan: Plan = { items: [], lines: [], requirements: [], totalUnits: 0 };
  const need = new Map<number, number>();
  for (const it of items) {
    const p = getProduct(db, it.productId);
    if (!p.active) throw conflict(`"${p.name}" está inactivo y no se puede vender.`);
    if (p.warnings.length) throw conflict(`"${p.name}" no se puede vender: ${p.warnings[0]}`);
    plan.items.push({ productId: p.id, name: p.name, qty: it.qty });
    plan.totalUnits += it.qty;
    for (const l of p.recipe) {
      const total = l.qty_m * it.qty;
      plan.lines.push({ productId: p.id, itemId: l.item_id, itemName: l.item_name, baseUnit: l.base_unit, perUnit: l.qty_m, total });
      need.set(l.item_id, (need.get(l.item_id) ?? 0) + total);
    }
  }
  for (const [itemId, needed] of need) {
    const i = db.prepare('SELECT id, name, base_unit, unit, qty_m FROM items WHERE id = ?').get(itemId) as {
      id: number;
      name: string;
      base_unit: BaseUnit;
      unit: Unit;
      qty_m: number;
    };
    plan.requirements.push({
      item_id: i.id,
      item_name: i.name,
      base_unit: i.base_unit,
      unit: i.unit,
      needed_m: needed,
      available_m: i.qty_m,
      after_m: i.qty_m - needed,
      short_m: Math.max(0, needed - i.qty_m),
    });
  }
  plan.requirements.sort((a, b) => a.item_name.localeCompare(b.item_name, 'es'));
  return plan;
}

/** Vista previa: qué se va a descontar y si alcanza. No modifica nada. */
export function previewSale(db: DB, body: Record<string, unknown>) {
  const plan = buildPlan(db, parseItems(body.items));
  const shortages = plan.requirements.filter((r) => r.short_m > 0);
  return { items: plan.items, requirements: plan.requirements, totalUnits: plan.totalUnits, ok: shortages.length === 0, shortages };
}

/**
 * Registra la venta y descuenta el inventario en UNA sola transacción.
 * requestId lo genera el cliente una vez por venta: si la misma petición llega
 * dos veces (doble clic, reintento de red) se devuelve la venta ya registrada
 * sin volver a descontar.
 */
export function registerSale(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}) {
  const requestId = str(body.requestId, 'identificador de la operación', { min: 8, max: 80 });
  const items = parseItems(body.items);

  return tx(db, () => {
    const prev = db.prepare('SELECT id, user_id FROM sales WHERE request_id = ?').get(requestId) as { id: string; user_id: number } | undefined;
    if (prev) {
      if (prev.user_id !== user.id) throw conflict('Identificador de operación repetido.');
      return { sale: getSale(db, user, prev.id), duplicate: true };
    }

    const plan = buildPlan(db, items);
    const shortages = plan.requirements.filter((r) => r.short_m > 0);
    if (shortages.length) {
      throw new AppError(409, 'No hay existencias suficientes para esta venta.', { shortages });
    }

    const id = randomUUID();
    const at = opts.at ?? nowIso();
    const demo = (opts.isDemo ?? isDemoMode(db)) ? 1 : 0;
    db.prepare('INSERT INTO sales(id, request_id, user_id, created_at, local_date, total_units, is_demo) VALUES (?,?,?,?,?,?,?)').run(
      id,
      requestId,
      user.id,
      at,
      localDate(at),
      plan.totalUnits,
      demo,
    );
    const insItem = db.prepare('INSERT INTO sale_items(sale_id, product_id, product_name, qty) VALUES (?,?,?,?)');
    for (const it of plan.items) insItem.run(id, it.productId, it.name, it.qty);
    const insLine = db.prepare(
      'INSERT INTO sale_consumption(sale_id, product_id, item_id, item_name, base_unit, per_unit_m, total_m) VALUES (?,?,?,?,?,?,?)',
    );
    for (const l of plan.lines) insLine.run(id, l.productId, l.itemId, l.itemName, l.baseUnit, l.perUnit, l.total);

    const ref = id.slice(0, 8).toUpperCase();
    for (const r of plan.requirements) {
      applyMovement(db, { itemId: r.item_id, delta: -r.needed_m, type: 'venta', reason: `Venta #${ref}`, userId: user.id, saleId: id, at, isDemo: !!demo });
    }
    return { sale: getSale(db, user, id), duplicate: false };
  });
}

/**
 * Anula una venta: devuelve al inventario lo que se descontó (con movimientos
 * compensatorios) y conserva el registro original marcado como anulado.
 */
export function annulSale(db: DB, user: User, id: string, body: Record<string, unknown>, opts: { at?: string } = {}) {
  const reason = str(body.reason, 'motivo de la anulación', { min: 3, max: 200 });
  return tx(db, () => {
    const s = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as { status: string; is_demo: number } | undefined;
    if (!s) throw notFound('Venta no encontrada.');
    if (s.status === 'anulada') throw conflict('Esta venta ya fue anulada.');
    const at = opts.at ?? nowIso();
    const totals = db
      .prepare('SELECT item_id, SUM(total_m) total FROM sale_consumption WHERE sale_id = ? GROUP BY item_id')
      .all(id) as { item_id: number; total: number }[];
    const ref = id.slice(0, 8).toUpperCase();
    for (const t of totals) {
      applyMovement(db, {
        itemId: t.item_id,
        delta: t.total,
        type: 'anulacion',
        reason: `Anulación venta #${ref}: ${reason}`,
        userId: user.id,
        saleId: id,
        at,
        isDemo: !!s.is_demo,
      });
    }
    db.prepare("UPDATE sales SET status='anulada', annulled_by=?, annulled_at=?, annul_reason=? WHERE id=?").run(user.id, at, reason, id);
    return getSale(db, user, id);
  });
}

export interface SaleConsumption {
  product_id: number;
  product_name: string;
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  per_unit_m: number;
  total_m: number;
}

export interface SaleView {
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

const SALE_SELECT = `SELECT s.id, s.created_at, s.local_date, s.total_units, s.status, s.user_id, u.name user_name,
  a.name annulled_by_name, s.annulled_at, s.annul_reason, s.is_demo
  FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN users a ON a.id = s.annulled_by`;

function attachItems(db: DB, sales: Omit<SaleView, 'items'>[]): SaleView[] {
  const stmt = db.prepare('SELECT product_id, product_name, qty FROM sale_items WHERE sale_id = ? ORDER BY qty DESC, product_name');
  return sales.map((s) => ({ ...s, items: stmt.all(s.id) as SaleView['items'] }));
}

export function getSale(db: DB, user: User, id: string) {
  const s = db.prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id) as Omit<SaleView, 'items'> | undefined;
  if (!s) throw notFound('Venta no encontrada.');
  if (s.user_id !== user.id && !can(user, 'sales.viewAll')) throw forbidden('Solo puedes ver tus propias ventas.');
  const [sale] = attachItems(db, [s]);
  const consumption = db
    .prepare(
      `SELECT c.product_id, si.product_name, c.item_id, c.item_name, c.base_unit, c.per_unit_m, c.total_m
       FROM sale_consumption c JOIN sale_items si ON si.sale_id = c.sale_id AND si.product_id = c.product_id
       WHERE c.sale_id = ? ORDER BY si.product_name, c.item_name`,
    )
    .all(id) as unknown as SaleConsumption[];
  return { ...sale, consumption };
}

export function listSales(
  db: DB,
  user: User,
  q: { from?: string; to?: string; productId?: number; userId?: number; status?: string; limit?: number },
): SaleView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.from) {
    if (!isYmd(q.from)) throw bad('Fecha inicial no válida.');
    where.push('s.local_date >= ?');
    params.push(q.from);
  }
  if (q.to) {
    if (!isYmd(q.to)) throw bad('Fecha final no válida.');
    where.push('s.local_date <= ?');
    params.push(q.to);
  }
  if (q.productId) {
    where.push('EXISTS (SELECT 1 FROM sale_items x WHERE x.sale_id = s.id AND x.product_id = ?)');
    params.push(q.productId);
  }
  // Un empleado sin permiso de historial completo solo ve lo que registró él.
  const userId = can(user, 'sales.viewAll') ? q.userId : user.id;
  if (userId) {
    where.push('s.user_id = ?');
    params.push(userId);
  }
  if (q.status === 'confirmada' || q.status === 'anulada') {
    where.push('s.status = ?');
    params.push(q.status);
  }
  params.push(Math.min(Math.max(q.limit ?? 500, 1), 2000));
  const rows = db
    .prepare(`${SALE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT ?`)
    .all(...params) as unknown as Omit<SaleView, 'items'>[];
  return attachItems(db, rows);
}
