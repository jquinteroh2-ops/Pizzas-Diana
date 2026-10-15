// Conteo físico por ubicación (reemplaza la hoja de conteo de neveras).
// La cocina cuenta y envía; el administrador revisa las diferencias y las aplica.
// La diferencia se calcula contra lo que decía el sistema AL MOMENTO DE CONTAR, así
// las ventas que pasen mientras el administrador revisa no se cuentan dos veces.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, oneOf, optStr, num } from '../errors.ts';
import { compatible, isUnit, toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';
import { COUNT_KINDS, COUNT_STATUSES, LOCATIONS, realConsumption, type CountKind, type CountStatus, type Location } from '../../shared/kitchen.ts';
import { isYmd, localDate } from '../../shared/dates.ts';
import { applyMovement } from './inventory.ts';
import { can, type User } from './users.ts';

export interface CountSheetLine {
  item_id: number;
  name: string;
  unit: Unit;
  base_unit: BaseUnit;
  qty_m: number;
  pack_size_m: number;
  pack_label: string;
  kind: string;
}

/** La hoja de una ubicación, en el mismo orden en que está organizada la nevera. */
export function countSheet(db: DB, location: unknown): { location: Location; lines: CountSheetLine[] } {
  const loc = oneOf(location, 'ubicación', LOCATIONS);
  const lines = db
    .prepare(
      `SELECT id item_id, name, unit, base_unit, qty_m, pack_size_m, pack_label, kind FROM items
       WHERE active = 1 AND location = ? ORDER BY sort_order, name COLLATE NOCASE`,
    )
    .all(loc) as unknown as CountSheetLine[];
  return { location: loc, lines };
}

export interface CountLineView {
  item_id: number;
  item_name: string;
  unit: Unit;
  base_unit: BaseUnit;
  expected_m: number;
  counted_m: number;
  diff_m: number;
}

export interface CountView {
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
  lines?: CountLineView[];
}

const SELECT = `SELECT c.id, c.location, c.kind, c.status, c.note, c.counted_by, cu.name counted_by_name, c.counted_at, c.local_date,
  ru.name reviewed_by_name, c.reviewed_at, c.is_demo,
  (SELECT COUNT(*) FROM count_lines l WHERE l.count_id = c.id) lines_count,
  (SELECT COUNT(*) FROM count_lines l WHERE l.count_id = c.id AND l.counted_m <> l.expected_m) diff_count
  FROM counts c JOIN users cu ON cu.id = c.counted_by LEFT JOIN users ru ON ru.id = c.reviewed_by`;

export function getCount(db: DB, user: User, id: number): CountView {
  const c = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as CountView | undefined;
  if (!c || (!can(user, 'kitchen.manage') && c.counted_by !== user.id)) throw notFound('Conteo no encontrado.');
  const lines = db
    .prepare(
      `SELECT l.item_id, l.item_name, i.unit, i.base_unit, l.expected_m, l.counted_m, l.counted_m - l.expected_m diff_m
       FROM count_lines l JOIN items i ON i.id = l.item_id WHERE l.count_id = ? ORDER BY i.sort_order, l.item_name COLLATE NOCASE`,
    )
    .all(id) as unknown as CountLineView[];
  return { ...c, lines };
}

export function listCounts(db: DB, user: User, q: { status?: string; limit?: number }): CountView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!can(user, 'kitchen.manage')) {
    where.push('c.counted_by = ?');
    params.push(user.id);
  }
  if (q.status) {
    where.push('c.status = ?');
    params.push(oneOf(q.status, 'estado', COUNT_STATUSES));
  }
  params.push(Math.min(Math.max(q.limit ?? 50, 1), 200));
  return db
    .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.status = 'pendiente' DESC, c.counted_at DESC LIMIT ?`)
    .all(...params) as unknown as CountView[];
}

/**
 * Enviar un conteo: { location, lines: [{item_id, qty, unit}], note }.
 * Los productos que no se escriban no se cuentan. Si lo envía el administrador se aplica de una vez.
 */
export function submitCount(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): CountView {
  const sheet = countSheet(db, body.location);
  const byId = new Map(sheet.lines.map((l) => [l.item_id, l]));
  const raw = body.lines;
  if (!Array.isArray(raw)) throw bad('El conteo no es válido.');
  const seen = new Set<number>();
  const lines: { item: CountSheetLine; countedM: number }[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const item = byId.get(Number(l?.item_id));
    if (!item) throw bad(`Un producto del conteo no está en ${sheet.location}.`);
    if (seen.has(item.item_id)) throw bad(`"${item.name}" está repetido en el conteo.`);
    seen.add(item.item_id);
    const unit = l.unit ?? item.unit;
    if (!isUnit(unit) || !compatible(unit, item.unit)) throw bad(`La unidad no es compatible con "${item.name}".`);
    lines.push({ item, countedM: toMilli(num(l.qty, `cantidad de ${item.name}`, { max: 1e7 }), unit) });
  }
  if (lines.length === 0) throw bad('Escribe la cantidad de al menos un producto.');
  const note = optStr(body.note, 'nota', 300);
  const kind = body.kind === undefined ? 'libre' : oneOf(body.kind, 'tipo de conteo', COUNT_KINDS);
  const at = opts.at ?? nowIso();
  const isDemo = opts.isDemo ?? isDemoMode(db);

  return tx(db, () => {
    const r = db
      .prepare('INSERT INTO counts(location, kind, note, counted_by, counted_at, local_date, is_demo) VALUES (?,?,?,?,?,?,?)')
      .run(sheet.location, kind, note, user.id, at, localDate(new Date(at)), isDemo ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO count_lines(count_id, item_id, item_name, expected_m, counted_m) VALUES (?,?,?,?,?)');
    for (const l of lines) ins.run(id, l.item.item_id, l.item.name, l.item.qty_m, l.countedM);
    if (can(user, 'kitchen.manage') && body.apply !== false) applyCount(db, user, id, at);
    return getCount(db, user, id);
  });
}

function applyCount(db: DB, admin: User, id: number, at: string) {
  const c = getCount(db, admin, id);
  for (const l of c.lines ?? []) {
    if (l.diff_m === 0) continue;
    const current = (db.prepare('SELECT qty_m FROM items WHERE id = ?').get(l.item_id) as { qty_m: number }).qty_m;
    // Si después del conteo se gastó más de lo que había, la existencia queda en cero.
    const delta = Math.max(l.diff_m, -current);
    if (delta === 0) continue;
    applyMovement(db, {
      itemId: l.item_id,
      delta,
      type: 'conteo',
      reason: `Conteo de ${c.location} #${id} (${l.diff_m > 0 ? 'sobraba' : 'faltaba'})`,
      userId: admin.id,
      at,
      isDemo: !!c.is_demo,
    });
  }
  db.prepare("UPDATE counts SET status='aplicado', reviewed_by=?, reviewed_at=? WHERE id=?").run(admin.id, at, id);
}

/** El administrador aplica las diferencias de un conteo o lo descarta. */
export function reviewCount(db: DB, admin: User, id: number, body: Record<string, unknown>, opts: { at?: string } = {}): CountView {
  const c = getCount(db, admin, id);
  if (c.status !== 'pendiente') throw conflict('Este conteo ya fue revisado.');
  const decision = oneOf(body.decision, 'decisión', ['aplicar', 'descartar'] as const);
  const at = opts.at ?? nowIso();
  return tx(db, () => {
    if (decision === 'aplicar') applyCount(db, admin, id, at);
    else db.prepare("UPDATE counts SET status='descartado', reviewed_by=?, reviewed_at=? WHERE id=?").run(admin.id, at, id);
    return getCount(db, admin, id);
  });
}

interface DayCount {
  id: number;
  counted_by_name: string;
  counted_at: string;
  status: CountStatus;
}

/** El último conteo (no descartado) de ese tipo, en esa ubicación y ese día. */
function lastCount(db: DB, location: string, kind: CountKind, date: string): DayCount | null {
  return (
    (db
      .prepare(
        `SELECT c.id, u.name counted_by_name, c.counted_at, c.status FROM counts c JOIN users u ON u.id = c.counted_by
         WHERE c.location = ? AND c.kind = ? AND c.local_date = ? AND c.status <> 'descartado' ORDER BY c.counted_at DESC LIMIT 1`,
      )
      .get(location, kind, date) as DayCount | undefined) ?? null
  );
}

/** Qué ubicaciones ya se contaron al abrir y al cerrar ese día. */
export function dayCountStatus(db: DB, date = localDate()) {
  const used = new Set((db.prepare('SELECT DISTINCT location FROM items WHERE active = 1').all() as { location: string }[]).map((r) => r.location));
  return LOCATIONS.filter((l) => used.has(l)).map((location) => ({
    location,
    apertura: lastCount(db, location, 'apertura', date),
    cierre: lastCount(db, location, 'cierre', date),
  }));
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
  /** Lo que de verdad gastó la cocina según la apertura y el cierre. */
  real_m: number;
  /** Lo que descontaron las ventas de caja (ventas − anulaciones) según las recetas. */
  sales_m: number;
  diff_m: number;
}

/**
 * «Caja vs cocina» de un día: para cada producto contado al abrir y al cerrar, lo que
 * descontaron las ventas frente a lo que realmente se gastó. Se mira solo lo que pasó
 * entre la hora del conteo de apertura y la del cierre de su nevera.
 */
export function reconciliation(db: DB, date: unknown) {
  if (typeof date !== 'string' || !isYmd(date)) throw bad('Fecha no válida.');
  const status = dayCountStatus(db, date);
  const lines: ReconciliationLine[] = [];
  const sums = db.prepare(
    `SELECT type, SUM(CASE WHEN delta_m > 0 THEN delta_m ELSE 0 END) pos, SUM(CASE WHEN delta_m < 0 THEN -delta_m ELSE 0 END) neg
     FROM movements WHERE item_id = ? AND created_at >= ? AND created_at < ? GROUP BY type`,
  );
  for (const s of status) {
    if (!s.apertura || !s.cierre || s.cierre.counted_at <= s.apertura.counted_at) continue;
    const close = new Map(
      (db.prepare('SELECT item_id, counted_m FROM count_lines WHERE count_id = ?').all(s.cierre.id) as { item_id: number; counted_m: number }[]).map((l) => [l.item_id, l.counted_m]),
    );
    const open = db
      .prepare(
        `SELECT l.item_id, i.name, i.location, i.unit, i.base_unit, l.counted_m FROM count_lines l JOIN items i ON i.id = l.item_id
         WHERE l.count_id = ? ORDER BY i.sort_order, i.name COLLATE NOCASE`,
      )
      .all(s.apertura.id) as { item_id: number; name: string; location: Location; unit: Unit; base_unit: BaseUnit; counted_m: number }[];
    for (const o of open) {
      const closeM = close.get(o.item_id);
      if (closeM === undefined) continue;
      const by = new Map(
        (sums.all(o.item_id, s.apertura.counted_at, s.cierre.counted_at) as { type: string; pos: number; neg: number }[]).map((r) => [r.type, r]),
      );
      const get = (type: string, k: 'pos' | 'neg') => by.get(type)?.[k] ?? 0;
      const entries = get('entrada', 'pos');
      const produced = get('produccion', 'pos');
      const used = get('produccion', 'neg');
      const waste = get('baja', 'neg');
      // Una venta anulada devuelve lo que había descontado.
      const sales = get('venta', 'neg') - get('anulacion', 'pos');
      const real = realConsumption({ openM: o.counted_m, closeM, entriesM: entries, producedM: produced, usedForPrepM: used, wasteM: waste });
      lines.push({
        item_id: o.item_id,
        name: o.name,
        location: o.location,
        unit: o.unit,
        base_unit: o.base_unit,
        open_m: o.counted_m,
        entries_m: entries,
        produced_m: produced,
        used_m: used,
        waste_m: waste,
        close_m: closeM,
        real_m: real,
        sales_m: sales,
        diff_m: real - sales,
      });
    }
  }
  return { date, status, lines };
}
