// Plan de preparación: el administrador decide qué se prepara cada día de la semana
// (esta semana cebolla, la otra tomate…) y la cocina lo ve en su pantalla.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, notFound, num, optStr } from '../errors.ts';
import { compatible, isUnit, toMilli, type Unit } from '../../shared/units.ts';
import { addDays, isYmd, localDate, weekEnd, weekStart } from '../../shared/dates.ts';
import type { User } from './users.ts';

export interface PrepTask {
  id: number;
  local_date: string;
  preparation_id: number;
  preparation_name: string;
  output_unit: Unit;
  target_m: number | null;
  note: string;
  production_id: number | null;
  done_by_name: string | null;
  done_at: string | null;
  done_output_m: number | null;
  is_demo: number;
}

const SELECT = `SELECT t.id, t.local_date, t.preparation_id, p.name preparation_name, i.unit output_unit, t.target_m, t.note, t.production_id,
  u.name done_by_name, pr.created_at done_at, pr.output_m done_output_m, t.is_demo
  FROM prep_tasks t JOIN preparations p ON p.id = t.preparation_id JOIN items i ON i.id = p.output_item_id
  LEFT JOIN productions pr ON pr.id = t.production_id LEFT JOIN users u ON u.id = pr.user_id`;

function ymd(v: unknown, field = 'fecha'): string {
  if (typeof v !== 'string' || !isYmd(v)) throw bad(`La ${field} no es válida.`);
  return v;
}

export function tasksBetween(db: DB, from: string, to: string): PrepTask[] {
  return db.prepare(`${SELECT} WHERE t.local_date BETWEEN ? AND ? ORDER BY t.local_date, t.id`).all(from, to) as unknown as PrepTask[];
}

export function weekPlan(db: DB, date: unknown) {
  const d = date === undefined ? localDate() : ymd(date);
  const from = weekStart(d);
  const to = weekEnd(d);
  return { from, to, tasks: tasksBetween(db, from, to) };
}

export function addTask(db: DB, user: User, body: Record<string, unknown>): PrepTask {
  const day = ymd(body.date);
  const prep = db
    .prepare('SELECT p.id, p.name, p.active, i.unit FROM preparations p JOIN items i ON i.id = p.output_item_id WHERE p.id = ?')
    .get(Number(body.preparation_id)) as { id: number; name: string; active: number; unit: Unit } | undefined;
  if (!prep) throw bad('Elige qué se va a preparar.');
  if (!prep.active) throw bad(`"${prep.name}" está desactivada.`);
  let target: number | null = null;
  if (body.target_qty !== undefined && body.target_qty !== null && body.target_qty !== '') {
    const unit = body.target_unit ?? prep.unit;
    if (!isUnit(unit) || !compatible(unit, prep.unit)) throw bad('La unidad de la meta no es compatible.');
    target = toMilli(num(body.target_qty, 'cantidad objetivo', { allowZero: false, max: 1e7 }), unit);
  }
  const note = optStr(body.note, 'nota', 200);
  const r = db
    .prepare('INSERT INTO prep_tasks(local_date, preparation_id, target_m, note, created_by, created_at, is_demo) VALUES (?,?,?,?,?,?,?)')
    .run(day, prep.id, target, note, user.id, nowIso(), isDemoMode(db) ? 1 : 0);
  return getTask(db, Number(r.lastInsertRowid));
}

export function getTask(db: DB, id: number): PrepTask {
  const t = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as PrepTask | undefined;
  if (!t) throw notFound('Tarea no encontrada.');
  return t;
}

export function deleteTask(db: DB, id: number): { ok: true } {
  const t = getTask(db, id);
  if (t.production_id) throw bad('Esta tarea ya se hizo; no se puede quitar del plan.');
  db.prepare('DELETE FROM prep_tasks WHERE id = ?').run(id);
  return { ok: true };
}

/** Copia el plan de la semana anterior a la semana de `date` (sin duplicar lo que ya esté). */
export function copyPreviousWeek(db: DB, user: User, date: unknown) {
  const d = ymd(date);
  const from = weekStart(d);
  const prev = tasksBetween(db, addDays(from, -7), addDays(from, -1));
  if (prev.length === 0) throw bad('La semana anterior no tiene plan para copiar.');
  return tx(db, () => {
    const exists = db.prepare('SELECT 1 FROM prep_tasks WHERE local_date = ? AND preparation_id = ?');
    const ins = db.prepare('INSERT INTO prep_tasks(local_date, preparation_id, target_m, note, created_by, created_at, is_demo) VALUES (?,?,?,?,?,?,?)');
    let added = 0;
    for (const t of prev) {
      const day = addDays(t.local_date, 7);
      if (exists.get(day, t.preparation_id)) continue;
      ins.run(day, t.preparation_id, t.target_m, t.note, user.id, nowIso(), isDemoMode(db) ? 1 : 0);
      added++;
    }
    return { added, ...weekPlan(db, d) };
  });
}
