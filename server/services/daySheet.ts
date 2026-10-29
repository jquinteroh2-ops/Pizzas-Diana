// Hoja del día: una por fecha. La jefa de cocina escribe lo que hay al abrir (Inicio), lo que
// llegó y lo que queda al cerrar (Fin) directamente en la tabla; el sistema calcula el consumo
// y lo compara con lo que vendió la caja. Al validar, la existencia del sistema queda igual a
// lo que se contó al cerrar.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr } from '../errors.ts';
import { addDays, isYmd, localDate } from '../../shared/dates.ts';
import { LOCATIONS, type ItemKind, type Location } from '../../shared/kitchen.ts';
import { isUnit, type BaseUnit, type Unit } from '../../shared/units.ts';
import {
  SHEET_FIELDS,
  dayStartIso,
  sheetLine,
  sortSheet,
  summarize,
  type DayMoves,
  type DaySheet,
  type DaySheetLine,
  type SheetStatus,
} from '../../shared/daySheet.ts';
import { applyMovement, changeItemBase, createItem, getItem, setItemActive, updateItem, CATEGORIES, type Item } from './inventory.ts';
import type { User } from './users.ts';

const MAX_M = 1e12;

function checkDate(date: unknown, today: string): string {
  if (typeof date !== 'string' || !isYmd(date)) throw bad('Fecha no válida.');
  if (date > today) throw bad('Todavía no se puede llenar la hoja de un día que no ha llegado.');
  return date;
}

interface SheetRow {
  status: SheetStatus;
  note: string;
  validated_at: string | null;
  validated_by_name: string | null;
}

function sheetRow(db: DB, date: string): SheetRow | undefined {
  return db
    .prepare(
      `SELECT s.status, s.note, s.validated_at, u.name validated_by_name FROM day_sheets s LEFT JOIN users u ON u.id = s.validated_by WHERE s.local_date = ?`,
    )
    .get(date) as SheetRow | undefined;
}

function ensureSheet(db: DB, date: string) {
  db.prepare('INSERT OR IGNORE INTO day_sheets(local_date, is_demo) VALUES (?, ?)').run(date, isDemoMode(db) ? 1 : 0);
}

/** Movimientos del día por ingrediente: llegó, preparado, usado en preparaciones y bajas. */
function dayMoves(db: DB, date: string): Map<number, DayMoves> {
  const rows = db
    .prepare(
      `SELECT item_id, type, SUM(CASE WHEN delta_m > 0 THEN delta_m ELSE 0 END) pos, SUM(CASE WHEN delta_m < 0 THEN -delta_m ELSE 0 END) neg
       FROM movements WHERE created_at >= ? AND created_at < ? AND type IN ('entrada','produccion') GROUP BY item_id, type`,
    )
    .all(dayStartIso(date), dayStartIso(addDays(date, 1))) as { item_id: number; type: string; pos: number; neg: number }[];
  const out = new Map<number, DayMoves>();
  const get = (id: number) => out.get(id) ?? (out.set(id, { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 }), out.get(id)!);
  for (const r of rows) {
    const m = get(r.item_id);
    if (r.type === 'entrada') m.entries_m += r.pos - r.neg;
    else {
      m.produced_m += r.pos;
      m.used_m += r.neg;
    }
  }
  // Bajas del día en que se reportaron (lo que salió de la nevera), menos las rechazadas.
  const wastes = db.prepare("SELECT item_id, SUM(qty_m) qty FROM wastes WHERE local_date = ? AND status <> 'rechazada' GROUP BY item_id").all(date) as {
    item_id: number;
    qty: number;
  }[];
  for (const w of wastes) get(w.item_id).waste_m += w.qty;
  return out;
}

/** Lo que debió gastarse de cada ingrediente según las ventas confirmadas del día y sus recetas. */
function daySales(db: DB, date: string): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT c.item_id, SUM(c.total_m) total FROM sale_consumption c JOIN sales s ON s.id = c.sale_id
       WHERE s.local_date = ? AND s.status = 'confirmada' GROUP BY c.item_id`,
    )
    .all(date) as { item_id: number; total: number }[];
  return new Map(rows.map((r) => [r.item_id, r.total]));
}

/** Para cada ingrediente, lo último que se contó al cerrar antes de esa fecha. */
function previousClose(db: DB, date: string): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT l.item_id, l.close_m FROM day_sheet_lines l
       WHERE l.close_m IS NOT NULL AND l.local_date = (
         SELECT MAX(x.local_date) FROM day_sheet_lines x WHERE x.item_id = l.item_id AND x.local_date < ? AND x.close_m IS NOT NULL)`,
    )
    .all(date) as { item_id: number; close_m: number }[];
  return new Map(rows.map((r) => [r.item_id, r.close_m]));
}

export function getDaySheet(db: DB, _user: User, date: unknown, opts: { today?: string } = {}): DaySheet {
  const today = opts.today ?? localDate();
  const d = checkDate(date, today);
  const row = sheetRow(db, d);
  const stored = new Map(
    (db.prepare('SELECT item_id, open_m, close_m FROM day_sheet_lines WHERE local_date = ?').all(d) as { item_id: number; open_m: number | null; close_m: number | null }[]).map(
      (r) => [r.item_id, r],
    ),
  );
  const moves = dayMoves(db, d);
  const sales = daySales(db, d);
  const prev = previousClose(db, d);
  const empty: DayMoves = { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 };
  // Los ingredientes activos, y también los desactivados que tengan datos ese día (para no perder historia).
  const items = (
    db
      .prepare(
        `SELECT id item_id, name, location, kind, unit, base_unit, pack_size_m, pack_label, sort_order, qty_m stock_m FROM items
         WHERE active = 1 OR id IN (SELECT item_id FROM day_sheet_lines WHERE local_date = ?)`,
      )
      .all(d) as unknown as {
      item_id: number;
      name: string;
      location: Location;
      kind: ItemKind;
      unit: Unit;
      base_unit: BaseUnit;
      pack_size_m: number;
      pack_label: string;
      sort_order: number;
      stock_m: number;
    }[]
  );
  const lines: DaySheetLine[] = sortSheet(
    items.map((i) => sheetLine(i, stored.get(i.item_id), moves.get(i.item_id) ?? empty, sales.get(i.item_id) ?? 0, prev.get(i.item_id) ?? null)),
    LOCATIONS,
  );
  const sold = db
    .prepare(
      `SELECT si.product_id, si.product_name, SUM(si.qty) qty FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.local_date = ? AND s.status = 'confirmada' GROUP BY si.product_id ORDER BY qty DESC, si.product_name`,
    )
    .all(d) as { product_id: number; product_name: string; qty: number }[];
  const status: SheetStatus = row?.status ?? 'abierta';
  return {
    date: d,
    status,
    validated_by_name: row?.validated_by_name ?? null,
    validated_at: row?.validated_at ?? null,
    note: row?.note ?? '',
    editable: status === 'abierta',
    entries_editable: status === 'abierta' && d === today,
    lines,
    sold,
    sold_units: sold.reduce((s, p) => s + p.qty, 0),
    summary: summarize(lines),
  };
}

/** Existencia que tenía el sistema justo antes de un instante (según el último movimiento). */
function stockAt(db: DB, itemId: number, iso: string): number {
  const r = db.prepare('SELECT after_m FROM movements WHERE item_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1').get(itemId, iso) as
    | { after_m: number }
    | undefined;
  return r?.after_m ?? 0;
}

/**
 * Escribir una casilla de la hoja: { date, item_id, field: 'open'|'entry'|'close', value_m }.
 * value_m va en milésimas de la unidad base (null o vacío borra Inicio o Fin).
 */
export function setCell(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}): DaySheetLine {
  const at = opts.at ?? nowIso();
  const today = localDate(at);
  const date = checkDate(body.date, today);
  const field = oneOf(body.field, 'casilla', SHEET_FIELDS);
  const item = getItem(db, Number(body.item_id));
  const raw = body.value_m;
  const value = raw === null || raw === undefined || raw === '' ? null : Math.round(num(raw, `cantidad de ${item.name}`, { max: MAX_M }));
  if (sheetRow(db, date)?.status === 'validada') throw conflict('Esta hoja ya fue validada. Para corregirla, el administrador debe volver a abrirla.');

  tx(db, () => {
    ensureSheet(db, date);
    if (field === 'entry') {
      if (date !== today) throw bad('Lo que llegó solo se anota el mismo día.');
      if (!item.active) throw conflict(`"${item.name}" está desactivado.`);
      const current = dayMoves(db, date).get(item.id)?.entries_m ?? 0;
      let delta = (value ?? 0) - current;
      // Una corrección hacia abajo no puede dejar la existencia negativa.
      delta = Math.max(delta, -item.qty_m);
      if (delta !== 0) {
        applyMovement(db, { itemId: item.id, delta, type: 'entrada', reason: delta > 0 ? 'Llegó (hoja del día)' : 'Corrección de lo que llegó (hoja del día)', userId: user.id, at });
      }
      // Lo que llegó cierra los faltantes reportados de ese ingrediente.
      if (delta > 0) {
        db.prepare("UPDATE shortages SET status='recibido', closed_by=?, updated_at=? WHERE item_id=? AND status IN ('abierto','pedido')").run(user.id, at, item.id);
      }
      return;
    }
    const prev = db.prepare('SELECT 1 FROM day_sheet_lines WHERE local_date = ? AND item_id = ?').get(date, item.id);
    if (!prev) {
      if (value === null) return;
      db.prepare('INSERT INTO day_sheet_lines(local_date, item_id, updated_by, updated_at, is_demo) VALUES (?,?,?,?,?)').run(date, item.id, user.id, at, isDemoMode(db) ? 1 : 0);
    }
    if (field === 'open') {
      db.prepare('UPDATE day_sheet_lines SET open_m = ?, updated_by = ?, updated_at = ? WHERE local_date = ? AND item_id = ?').run(value, user.id, at, date, item.id);
    } else {
      // Se guarda lo que decía el sistema al contar: al validar, la diferencia se ajusta contra ese
      // momento y no se pierden las ventas que pasen después.
      const sys = value === null ? null : date === today ? item.qty_m : stockAt(db, item.id, dayStartIso(addDays(date, 1)));
      db.prepare('UPDATE day_sheet_lines SET close_m = ?, close_sys_m = ?, updated_by = ?, updated_at = ? WHERE local_date = ? AND item_id = ?').run(
        value,
        sys,
        user.id,
        at,
        date,
        item.id,
      );
    }
  });
  const line = getDaySheet(db, user, date, { today }).lines.find((l) => l.item_id === item.id);
  if (!line) throw notFound('Ingrediente no encontrado.');
  return line;
}

/**
 * Llenar el Inicio de una vez: con lo que se contó al cerrar el día anterior ('ayer') o con
 * lo que dice el sistema ('sistema'). Solo llena las casillas vacías.
 */
export function fillOpen(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}): DaySheet {
  const at = opts.at ?? nowIso();
  const today = localDate(at);
  const date = checkDate(body.date, today);
  const source = oneOf(body.source ?? 'ayer', 'origen', ['ayer', 'sistema'] as const);
  if (sheetRow(db, date)?.status === 'validada') throw conflict('Esta hoja ya fue validada.');
  const sheet = getDaySheet(db, user, date, { today });
  let filled = 0;
  tx(db, () => {
    ensureSheet(db, date);
    const ins = db.prepare(
      `INSERT INTO day_sheet_lines(local_date, item_id, open_m, updated_by, updated_at, is_demo) VALUES (?,?,?,?,?,?)
       ON CONFLICT(local_date, item_id) DO UPDATE SET open_m = excluded.open_m, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    );
    for (const l of sheet.lines) {
      if (l.open_m !== null) continue;
      const v = source === 'ayer' ? l.prev_close_m : l.stock_m;
      if (v === null) continue;
      ins.run(date, l.item_id, v, user.id, at, isDemoMode(db) ? 1 : 0);
      filled++;
    }
  });
  if (!filled) throw bad(source === 'ayer' ? 'No hay un fin del día anterior para copiar (o el inicio ya está lleno).' : 'El inicio ya está lleno.');
  return getDaySheet(db, user, date, { today });
}

/**
 * Validar el día: la jefa de cocina (o el administrador) revisa lo gastado contra lo vendido y
 * cierra la hoja. La existencia de cada ingrediente contado al cerrar queda igual al conteo.
 */
export function validateDay(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}): DaySheet {
  const at = opts.at ?? nowIso();
  const today = localDate(at);
  const date = checkDate(body.date, today);
  const note = optStr(body.note, 'nota', 500);
  if (sheetRow(db, date)?.status === 'validada') throw conflict('Esta hoja ya fue validada.');
  const lines = db.prepare('SELECT item_id, close_m, close_sys_m FROM day_sheet_lines WHERE local_date = ? AND close_m IS NOT NULL').all(date) as {
    item_id: number;
    close_m: number;
    close_sys_m: number | null;
  }[];
  if (!lines.length) throw bad('Primero escribe el Fin (lo que quedó al cerrar) de al menos un ingrediente.');
  tx(db, () => {
    ensureSheet(db, date);
    const setAdj = db.prepare('UPDATE day_sheet_lines SET adj_m = ? WHERE local_date = ? AND item_id = ?');
    for (const l of lines) {
      if (l.close_sys_m === null) continue;
      const current = getItem(db, l.item_id).qty_m;
      const delta = Math.max(l.close_m - l.close_sys_m, -current);
      if (delta !== 0) {
        applyMovement(db, { itemId: l.item_id, delta, type: 'conteo', reason: `Hoja del ${date} (${delta > 0 ? 'sobraba' : 'faltaba'})`, userId: user.id, at });
      }
      setAdj.run(delta, date, l.item_id);
    }
    db.prepare("UPDATE day_sheets SET status='validada', note=?, validated_by=?, validated_at=? WHERE local_date=?").run(note, user.id, at, date);
  });
  return getDaySheet(db, user, date, { today });
}

/** Volver a abrir una hoja validada: se deshacen los ajustes que hizo al validar. */
export function reopenDay(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string } = {}): DaySheet {
  const at = opts.at ?? nowIso();
  const today = localDate(at);
  const date = checkDate(body.date, today);
  if (sheetRow(db, date)?.status !== 'validada') throw conflict('Esta hoja no está validada.');
  tx(db, () => {
    const lines = db.prepare('SELECT item_id, adj_m FROM day_sheet_lines WHERE local_date = ? AND adj_m <> 0').all(date) as { item_id: number; adj_m: number }[];
    for (const l of lines) {
      const current = getItem(db, l.item_id).qty_m;
      const delta = Math.max(-l.adj_m, -current);
      if (delta !== 0) applyMovement(db, { itemId: l.item_id, delta, type: 'conteo', reason: `Se volvió a abrir la hoja del ${date}`, userId: user.id, at });
    }
    db.prepare('UPDATE day_sheet_lines SET adj_m = 0 WHERE local_date = ?').run(date);
    db.prepare("UPDATE day_sheets SET status='abierta', validated_by=NULL, validated_at=NULL WHERE local_date=?").run(date);
  });
  return getDaySheet(db, user, date, { today });
}

/** Estado de las hojas de varios días (para el administrador y el calendario). */
export function sheetDays(db: DB, from: string, to: string) {
  if (!isYmd(from) || !isYmd(to)) throw bad('Fecha no válida.');
  return db
    .prepare(
      `SELECT s.local_date date, s.status, s.validated_at, u.name validated_by_name,
        (SELECT COUNT(*) FROM day_sheet_lines l WHERE l.local_date = s.local_date AND l.open_m IS NOT NULL) open_filled,
        (SELECT COUNT(*) FROM day_sheet_lines l WHERE l.local_date = s.local_date AND l.close_m IS NOT NULL) close_filled
       FROM day_sheets s LEFT JOIN users u ON u.id = s.validated_by WHERE s.local_date BETWEEN ? AND ? ORDER BY s.local_date DESC`,
    )
    .all(from, to);
}

// ---------- Ingredientes desde la hoja ----------

function categoryFor(body: Record<string, unknown>, kind: ItemKind): string {
  if (typeof body.category === 'string' && (CATEGORIES as readonly string[]).includes(body.category)) return body.category;
  return kind === 'preparacion' ? 'Productos preparados' : 'Ingredientes';
}

/** Agregar un ingrediente nuevo a la hoja (queda al final de su nevera). */
export function addIngredient(db: DB, user: User, body: Record<string, unknown>): Item {
  const location = oneOf(body.location, 'lugar', LOCATIONS);
  const kind = body.kind === 'preparacion' ? 'preparacion' : 'insumo';
  const last = db.prepare('SELECT MAX(sort_order) m FROM items WHERE location = ?').get(location) as { m: number | null };
  return createItem(db, user, {
    name: body.name,
    category: categoryFor(body, kind),
    unit: body.unit,
    qty: 0,
    min: body.min ?? 0,
    location,
    kind,
    sort_order: (last.m ?? 0) + 10,
    pack_size: body.pack_size,
    pack_unit: body.pack_unit,
    pack_label: body.pack_label,
  });
}

/**
 * Editar un ingrediente desde la hoja: nombre, lugar, unidad y presentación.
 * Cambiar entre gramos/ml y unidades pide cuánto pesa una unidad (per_unit).
 */
export function editIngredient(db: DB, id: number, body: Record<string, unknown>): Item {
  const item = getItem(db, id);
  return tx(db, () => {
    if (body.unit !== undefined) {
      if (!isUnit(body.unit)) throw bad('Unidad de medida no válida.');
      changeItemBase(db, id, body.unit, body.per_unit);
    }
    const updated = updateItem(db, id, {
      name: body.name,
      location: body.location,
      kind: body.kind,
      unit: body.unit,
      min: body.min,
      pack_size: body.pack_size,
      pack_unit: body.pack_unit,
      pack_label: body.pack_label,
      category: body.category !== undefined && (CATEGORIES as readonly string[]).includes(body.category as string) ? body.category : undefined,
    });
    if (body.active === false && item.active) return setItemActive(db, id, false);
    return updated;
  });
}

