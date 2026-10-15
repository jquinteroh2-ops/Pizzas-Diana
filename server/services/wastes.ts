// Bajas de cocina (reemplaza el «Formato de bajas»). Toda baja debe autorizarla el
// administrador: solo descuenta del inventario cuando se aprueba.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr } from '../errors.ts';
import { compatible, formatQty, isUnit, toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';
import { WASTE_REASONS, WASTE_STATUSES, type WasteReason, type WasteStatus } from '../../shared/kitchen.ts';
import { localDate } from '../../shared/dates.ts';
import { applyMovement } from './inventory.ts';
import { can, type User } from './users.ts';

const MAX_PHOTO_CHARS = 1_500_000; // ~1 MB de imagen; la interfaz la comprime antes de enviarla.

export interface WasteView {
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

const SELECT = `SELECT w.id, w.item_id, i.name item_name, i.unit item_unit, i.base_unit, i.qty_m item_qty_m, w.qty_m, w.unit, w.reason, w.note,
  w.photo IS NOT NULL has_photo, w.status, w.reported_by, ru.name reported_by_name, w.reported_at, w.local_date,
  vu.name reviewed_by_name, w.reviewed_at, w.review_note, w.is_demo
  FROM wastes w JOIN items i ON i.id = w.item_id JOIN users ru ON ru.id = w.reported_by LEFT JOIN users vu ON vu.id = w.reviewed_by`;

function toView(r: Record<string, unknown>): WasteView {
  return { ...(r as unknown as WasteView), has_photo: !!r.has_photo };
}

export function getWaste(db: DB, id: number): WasteView {
  const r = db.prepare(`${SELECT} WHERE w.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!r) throw notFound('Baja no encontrada.');
  return toView(r);
}

export function listWastes(db: DB, user: User, q: { status?: string; from?: string; to?: string; limit?: number }): WasteView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  // Quien no administra la cocina solo ve las bajas que reportó.
  if (!can(user, 'kitchen.manage')) {
    where.push('w.reported_by = ?');
    params.push(user.id);
  }
  if (q.status) {
    where.push('w.status = ?');
    params.push(oneOf(q.status, 'estado', WASTE_STATUSES));
  }
  if (q.from) {
    where.push('w.local_date >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('w.local_date <= ?');
    params.push(q.to);
  }
  params.push(Math.min(Math.max(q.limit ?? 100, 1), 500));
  return (
    db
      .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY w.status = 'pendiente' DESC, w.reported_at DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[]
  ).map(toView);
}

export function getWastePhoto(db: DB, user: User, id: number): { photo: string | null } {
  const w = getWaste(db, id);
  if (!can(user, 'kitchen.manage') && w.reported_by !== user.id) throw notFound('Baja no encontrada.');
  const r = db.prepare('SELECT photo FROM wastes WHERE id = ?').get(id) as { photo: string | null };
  return { photo: r.photo };
}

function validPhoto(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw bad('La foto no es válida.');
  if (v.length > MAX_PHOTO_CHARS) throw bad('La foto es demasiado pesada. Toma otra con menos resolución.');
  return v;
}

/** Reporta una baja. La del administrador queda aprobada de una vez; las demás, pendientes. */
export function reportWaste(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): WasteView {
  const item = db.prepare('SELECT id, name, unit, active FROM items WHERE id = ?').get(Number(body.item_id)) as
    | { id: number; name: string; unit: Unit; active: number }
    | undefined;
  if (!item) throw bad('Elige el producto que se da de baja.');
  if (!item.active) throw bad(`"${item.name}" está desactivado en inventario.`);
  const unit = body.unit === undefined ? item.unit : body.unit;
  if (!isUnit(unit) || !compatible(unit, item.unit)) throw bad(`La unidad no es compatible con "${item.name}".`);
  const qtyM = toMilli(num(body.qty, 'cantidad', { allowZero: false, max: 1e7 }), unit);
  const reason = oneOf(body.reason, 'motivo', WASTE_REASONS);
  const note = optStr(body.note, 'detalle', 300);
  if (reason === 'otro' && note.length < 3) throw bad('Explica el motivo de la baja en el detalle.');
  const photo = validPhoto(body.photo);
  const at = opts.at ?? nowIso();
  const isDemo = opts.isDemo ?? isDemoMode(db);

  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO wastes(item_id, qty_m, unit, reason, note, photo, reported_by, reported_at, local_date, is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(item.id, qtyM, unit, reason, note, photo, user.id, at, localDate(new Date(at)), isDemo ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    if (can(user, 'kitchen.manage')) approve(db, user, id, 'Registrada por el administrador', at);
    return getWaste(db, id);
  });
}

function approve(db: DB, admin: User, id: number, note: string, at: string) {
  const w = getWaste(db, id);
  applyMovement(db, {
    itemId: w.item_id,
    delta: -w.qty_m,
    type: 'baja',
    reason: `Baja #${id}: ${note || w.note || w.reason}`,
    userId: admin.id,
    at,
    isDemo: !!w.is_demo,
  });
  db.prepare("UPDATE wastes SET status='aprobada', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?").run(admin.id, at, note, id);
}

/** El administrador aprueba (descuenta) o rechaza una baja pendiente. */
export function reviewWaste(db: DB, admin: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): WasteView {
  const w = getWaste(db, id);
  if (w.status !== 'pendiente') throw conflict('Esta baja ya fue revisada.');
  const decision = oneOf(body.decision, 'decisión', ['aprobar', 'rechazar'] as const);
  const note = optStr(body.note, 'comentario', 200);
  const at = opts.at ?? nowIso();
  return tx(db, () => {
    if (decision === 'aprobar') {
      if (w.item_qty_m < w.qty_m) {
        throw conflict(
          `El inventario dice que solo hay ${formatQty(w.item_qty_m, w.item_unit)} de ${w.item_name}. Corrige la existencia (ajuste o conteo) antes de aprobar.`,
        );
      }
      approve(db, admin, id, note, at);
    } else {
      if (note.length < 3) throw bad('Explica por qué se rechaza la baja.');
      db.prepare("UPDATE wastes SET status='rechazada', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?").run(admin.id, at, note, id);
    }
    return getWaste(db, id);
  });
}
