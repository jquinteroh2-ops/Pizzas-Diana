// Bajas de cocina (reemplaza el «Formato de bajas»). Se descuentan del inventario al reportarlas
// (el producto ya salió de la nevera); el administrador las autoriza y, si las rechaza, se devuelven.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr } from '../errors.ts';
import { compatible, isUnit, toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';
import { WASTE_REASONS, WASTE_REASON_LABELS, WASTE_STATUSES, type WasteReason, type WasteStatus } from '../../shared/kitchen.ts';
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

export async function getWaste(db: DB, id: number): Promise<WasteView> {
  const r = await db.prepare(`${SELECT} WHERE w.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!r) throw notFound('Baja no encontrada.');
  return toView(r);
}

export async function listWastes(db: DB, user: User, q: { status?: string; from?: string; to?: string; limit?: number }): Promise<WasteView[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  // Como la hoja de papel, la cocina ve las bajas de todo el equipo; la caja, solo las suyas.
  if (!can(user, 'kitchen.use')) {
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
    await db
      .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY w.status = 'pendiente' DESC, w.reported_at DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[]
  ).map(toView);
}

export async function getWastePhoto(db: DB, user: User, id: number): Promise<{ photo: string | null }> {
  const w = await getWaste(db, id);
  if (!can(user, 'kitchen.use') && w.reported_by !== user.id) throw notFound('Baja no encontrada.');
  const r = await db.prepare('SELECT photo FROM wastes WHERE id = ?').get(id) as { photo: string | null };
  return { photo: r.photo };
}

function validPhoto(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw bad('La foto no es válida.');
  if (v.length > MAX_PHOTO_CHARS) throw bad('La foto es demasiado pesada. Toma otra con menos resolución.');
  return v;
}

/** Reporta una baja. La del administrador queda aprobada de una vez; las demás, pendientes. */
export async function reportWaste(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): Promise<WasteView> {
  const item = await db.prepare('SELECT id, name, unit, active FROM items WHERE id = ?').get(Number(body.item_id)) as
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
  const isDemo = opts.isDemo ?? await isDemoMode(db);

  return await tx(db, async () => {
    const r = await db
      .prepare(
        `INSERT INTO wastes(item_id, qty_m, unit, reason, note, photo, reported_by, reported_at, local_date, is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(item.id, qtyM, unit, reason, note, photo, user.id, at, localDate(new Date(at)), isDemo ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    // Lo que se bota ya salió de la nevera: se descuenta de una vez (sin dejar la existencia negativa).
    await take(db, user, id, at, isDemo);
    if (can(user, 'kitchen.manage')) await approve(db, user, id, 'Registrada por el administrador', at);
    return await getWaste(db, id);
  });
}

/** Descuenta la baja del inventario (lo que haya, hasta la cantidad reportada) y guarda cuánto fue. */
async function take(db: DB, user: User, id: number, at: string, isDemo: boolean) {
  const w = await getWaste(db, id);
  const taken = Math.min(w.qty_m, w.item_qty_m);
  if (taken > 0) {
    await applyMovement(db, { itemId: w.item_id, delta: -taken, type: 'baja', reason: `Baja #${id}: ${w.note || WASTE_REASON_LABELS[w.reason]}`, userId: user.id, at, isDemo });
  }
  await db.prepare('UPDATE wastes SET taken_m = ? WHERE id = ?').run(taken, id);
}

async function approve(db: DB, admin: User, id: number, note: string, at: string) {
  const w = await db.prepare('SELECT taken_m, is_demo FROM wastes WHERE id = ?').get(id) as { taken_m: number | null; is_demo: number };
  // Las bajas reportadas antes de este cambio todavía no se habían descontado.
  if (w.taken_m === null) await take(db, admin, id, at, !!w.is_demo);
  await db.prepare("UPDATE wastes SET status='aprobada', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?").run(admin.id, at, note, id);
}

/** El administrador aprueba (descuenta) o rechaza una baja pendiente. */
export async function reviewWaste(db: DB, admin: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): Promise<WasteView> {
  const w = await getWaste(db, id);
  if (w.status !== 'pendiente') throw conflict('Esta baja ya fue revisada.');
  const decision = oneOf(body.decision, 'decisión', ['aprobar', 'rechazar'] as const);
  const note = optStr(body.note, 'comentario', 200);
  const at = opts.at ?? nowIso();
  return await tx(db, async () => {
    if (decision === 'aprobar') {
      await approve(db, admin, id, note, at);
    } else {
      if (note.length < 3) throw bad('Explica por qué se rechaza la baja.');
      // Si no se autoriza, lo descontado vuelve al inventario.
      const t = await db.prepare('SELECT taken_m FROM wastes WHERE id = ?').get(id) as { taken_m: number | null };
      if (t.taken_m) {
        await applyMovement(db, { itemId: w.item_id, delta: t.taken_m, type: 'baja', reason: `Baja #${id} rechazada: se devuelve al inventario`, userId: admin.id, at, isDemo: !!w.is_demo });
      }
      await db.prepare("UPDATE wastes SET status='rechazada', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?").run(admin.id, at, note, id);
    }
    return await getWaste(db, id);
  });
}

/** Quien la anotó (o el administrador) puede corregir una baja mientras no esté autorizada. */
function canTouch(user: User, w: WasteView) {
  if (w.status !== 'pendiente') throw conflict('Esta baja ya fue revisada: ya no se puede cambiar.');
  if (w.reported_by !== user.id && !can(user, 'kitchen.manage')) throw conflict('Solo quien anotó la baja o el administrador la puede cambiar.');
}

/** Devuelve al inventario lo que la baja había descontado. */
async function giveBack(db: DB, user: User, w: WasteView, why: string, at: string) {
  const t = (await db.prepare('SELECT taken_m FROM wastes WHERE id = ?').get(w.id)) as { taken_m: number | null };
  if (t.taken_m) await applyMovement(db, { itemId: w.item_id, delta: t.taken_m, type: 'baja', reason: `Baja #${w.id} ${why}: se devuelve al inventario`, userId: user.id, at, isDemo: !!w.is_demo });
}

/** Corregir la cantidad o el motivo de una baja pendiente: se devuelve lo descontado y se descuenta lo nuevo. */
export async function updateWaste(db: DB, user: User, id: number, body: Record<string, unknown>): Promise<WasteView> {
  const w = await getWaste(db, id);
  canTouch(user, w);
  const unit = body.unit === undefined ? w.unit : body.unit;
  if (!isUnit(unit) || !compatible(unit, w.unit)) throw bad(`La unidad no es compatible con "${w.item_name}".`);
  const qtyM = body.qty === undefined ? w.qty_m : toMilli(num(body.qty, 'cantidad', { allowZero: false, max: 1e7 }), unit);
  const reason = body.reason === undefined ? w.reason : oneOf(body.reason, 'motivo', WASTE_REASONS);
  const note = body.note === undefined ? w.note : optStr(body.note, 'detalle', 300);
  if (reason === 'otro' && note.length < 3) throw bad('Explica el motivo de la baja en el detalle.');
  const at = nowIso();
  return await tx(db, async () => {
    await giveBack(db, user, w, 'corregida', at);
    await db.prepare('UPDATE wastes SET qty_m=?, unit=?, reason=?, note=?, taken_m=0 WHERE id=?').run(qtyM, unit, reason, note, id);
    await take(db, user, id, at, !!w.is_demo);
    return await getWaste(db, id);
  });
}

/** Borrar una baja pendiente (se anotó por error): lo descontado vuelve al inventario. */
export async function deleteWaste(db: DB, user: User, id: number): Promise<{ ok: true }> {
  const w = await getWaste(db, id);
  canTouch(user, w);
  const at = nowIso();
  await tx(db, async () => {
    await giveBack(db, user, w, 'borrada', at);
    await db.prepare('DELETE FROM wastes WHERE id = ?').run(id);
  });
  return { ok: true };
}
