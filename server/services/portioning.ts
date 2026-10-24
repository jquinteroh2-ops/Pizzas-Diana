// Porcionado: la cocina parte un insumo en porciones estándar (pechuga en porciones de
// 80 g para las picadas, papas en bolsas de 250 g…). Las porciones siguen siendo el MISMO
// artículo, así que el inventario no se duplica ni hay que contar «entrada» y «salida»:
// solo se descuenta la merma que se botó al limpiar.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, optStr, str } from '../errors.ts';
import { toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';
import { portioningYield, smallUnitOf } from '../../shared/kitchen.ts';
import { localDate } from '../../shared/dates.ts';
import { applyMovement, getItem, parseJson } from './inventory.ts';
import type { User } from './users.ts';

export interface PortioningLine {
  label: string;
  size_m: number;
  n: number;
}

export interface PortioningView {
  id: number;
  item_id: number;
  item_name: string;
  unit: Unit;
  base_unit: BaseUnit;
  lines: PortioningLine[];
  output_m: number;
  merma_m: number;
  yield_pct: number | null;
  note: string;
  status: 'activa' | 'anulada';
  user_id: number;
  user_name: string;
  created_at: string;
  local_date: string;
  annul_reason: string | null;
  is_demo: number;
}

type Row = Omit<PortioningView, 'lines' | 'yield_pct'> & { lines: string };

const SELECT = `SELECT p.*, i.unit, i.base_unit, u.name user_name FROM portionings p
  JOIN items i ON i.id = p.item_id JOIN users u ON u.id = p.user_id`;

function toView(r: Row): PortioningView {
  return { ...r, lines: parseJson<PortioningLine[]>(r.lines, []), yield_pct: portioningYield(r.output_m, r.merma_m) };
}

export function getPortioning(db: DB, id: number): PortioningView {
  const r = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as Row | undefined;
  if (!r) throw notFound('Porcionado no encontrado.');
  return toView(r);
}

export function listPortionings(db: DB, q: { from?: string; to?: string; itemId?: number; limit?: number }): PortioningView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  for (const [sql, v] of [
    ['p.local_date >= ?', q.from],
    ['p.local_date <= ?', q.to],
    ['p.item_id = ?', q.itemId],
  ] as [string, string | number | undefined][]) {
    if (v === undefined || v === '') continue;
    where.push(sql);
    params.push(v);
  }
  params.push(Math.min(Math.max(q.limit ?? 100, 1), 500));
  const rows = db
    .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`)
    .all(...params) as unknown as Row[];
  return rows.map(toView);
}

/**
 * Registrar un porcionado: { item_id, portions: [cuántas de cada porción del artículo], merma?, note? }.
 * La merma se escribe en la unidad pequeña (g o ml): lo que se botó al limpiar.
 */
export function registerPortioning(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): PortioningView {
  const item = getItem(db, Number(body.item_id));
  if (!item.active) throw conflict('El artículo está desactivado.');
  if (!item.portions.length) throw bad(`"${item.name}" no tiene porciones configuradas. El administrador las agrega en Inventario → Editar.`);
  const counts = Array.isArray(body.portions) ? body.portions : [];
  if (counts.length > item.portions.length) throw bad('Hay más porciones de las configuradas.');
  const lines = item.portions
    .map((p, i) => {
      const n = counts[i] === undefined || counts[i] === '' || counts[i] === null ? 0 : num(counts[i], `porciones «${p.label}»`, { max: 10_000 });
      if (!Number.isInteger(n)) throw bad(`Las porciones «${p.label}» deben ser un número entero.`);
      return { label: p.label, size_m: p.size_m, n };
    })
    .filter((l) => l.n > 0);
  if (!lines.length) throw bad('Escribe cuántas porciones salieron.');
  const output = lines.reduce((s, l) => s + l.n * l.size_m, 0);
  const merma = body.merma === undefined || body.merma === '' || body.merma === null ? 0 : toMilli(num(body.merma, 'merma', { max: 1e7 }), smallUnitOf(item.base_unit));
  if (merma > output) throw bad('La merma es más que lo porcionado. Revisa las cantidades.');
  if (merma > item.qty_m) {
    throw conflict(`Según el inventario no hay ${item.name} suficiente para esa merma. Si sí hay, avisa al administrador para que corrija la existencia.`);
  }
  const note = optStr(body.note, 'nota', 300);
  const at = opts.at ?? nowIso();
  const isDemo = opts.isDemo ?? isDemoMode(db);
  return tx(db, () => {
    const r = db
      .prepare('INSERT INTO portionings(item_id, item_name, lines, output_m, merma_m, note, user_id, created_at, local_date, is_demo) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(item.id, item.name, JSON.stringify(lines), output, merma, note, user.id, at, localDate(new Date(at)), isDemo ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    if (merma > 0) applyMovement(db, { itemId: item.id, delta: -merma, type: 'porcionado', reason: `Merma al porcionar #${id}`, userId: user.id, at, isDemo });
    return getPortioning(db, id);
  });
}

/** Deshacer un porcionado registrado por error: devuelve la merma al inventario. */
export function annulPortioning(db: DB, user: User, id: number, body: Record<string, unknown>): PortioningView {
  const p = getPortioning(db, id);
  if (p.status === 'anulada') throw conflict('Este porcionado ya fue anulado.');
  const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
  const at = nowIso();
  return tx(db, () => {
    if (p.merma_m > 0) {
      applyMovement(db, { itemId: p.item_id, delta: p.merma_m, type: 'porcionado', reason: `Anulación del porcionado #${id}: ${reason}`, userId: user.id, at, isDemo: !!p.is_demo });
    }
    db.prepare("UPDATE portionings SET status='anulada', annulled_by=?, annulled_at=?, annul_reason=? WHERE id=?").run(user.id, at, reason, id);
    return getPortioning(db, id);
  });
}
