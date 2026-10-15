// Reportes calculados SOLO con ventas confirmadas (las anuladas se excluyen).
import type { DB } from '../db.ts';
import { bad } from '../errors.ts';
import {
  addDays,
  daysBetween,
  isYmd,
  localDate,
  monthEnd,
  monthStart,
  prevMonthStart,
  weekEnd,
  weekStart,
} from '../../shared/dates.ts';
import { stockStatus, type BaseUnit, type Unit } from '../../shared/units.ts';
import { listProductions } from './preparations.ts';

export interface Range {
  from: string;
  to: string;
}

function unitsIn(db: DB, r: Range): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(total_units),0) n FROM sales WHERE status='confirmada' AND local_date BETWEEN ? AND ?")
    .get(r.from, r.to) as { n: number };
  return row.n;
}

export function byProduct(db: DB, r: Range) {
  return db
    .prepare(
      `SELECT si.product_id, COALESCE(p.name, si.product_name) name, SUM(si.qty) units
       FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
       WHERE s.status='confirmada' AND s.local_date BETWEEN ? AND ?
       GROUP BY si.product_id ORDER BY units DESC, name`,
    )
    .all(r.from, r.to) as { product_id: number; name: string; units: number }[];
}

export function consumption(db: DB, r: Range) {
  return db
    .prepare(
      `SELECT c.item_id, i.name, i.base_unit, i.unit, SUM(c.total_m) total_m
       FROM sale_consumption c JOIN sales s ON s.id = c.sale_id JOIN items i ON i.id = c.item_id
       WHERE s.status='confirmada' AND s.local_date BETWEEN ? AND ?
       GROUP BY c.item_id ORDER BY i.name COLLATE NOCASE`,
    )
    .all(r.from, r.to) as { item_id: number; name: string; base_unit: BaseUnit; unit: Unit; total_m: number }[];
}

export function dailySeries(db: DB, r: Range) {
  const rows = db
    .prepare(
      `SELECT local_date d, SUM(total_units) units, COUNT(*) sales FROM sales
       WHERE status='confirmada' AND local_date BETWEEN ? AND ? GROUP BY local_date`,
    )
    .all(r.from, r.to) as { d: string; units: number; sales: number }[];
  const map = new Map(rows.map((x) => [x.d, x]));
  return daysBetween(r.from, r.to).map((d) => ({ date: d, units: map.get(d)?.units ?? 0, sales: map.get(d)?.sales ?? 0 }));
}

function stockCounts(db: DB) {
  const items = db.prepare('SELECT qty_m, min_m FROM items WHERE active = 1').all() as { qty_m: number; min_m: number }[];
  let low = 0;
  let out = 0;
  for (const i of items) {
    const s = stockStatus(i.qty_m, i.min_m);
    if (s === 'bajo') low++;
    if (s === 'agotado') out++;
  }
  return { total: items.length, low, out };
}

export function alerts(db: DB) {
  const rows = db
    .prepare('SELECT id, name, category, base_unit, unit, qty_m, min_m FROM items WHERE active = 1 AND qty_m <= min_m ORDER BY qty_m * 1.0 / MAX(min_m, 1), name')
    .all() as { id: number; name: string; category: string; base_unit: BaseUnit; unit: Unit; qty_m: number; min_m: number }[];
  return rows.map((r) => ({ ...r, status: stockStatus(r.qty_m, r.min_m) }));
}

export function dashboard(db: DB, today = localDate()) {
  const week = { from: weekStart(today), to: today };
  const month = { from: monthStart(today), to: today };
  const recent = db
    .prepare(
      `SELECT s.id, s.created_at, s.total_units, s.status, s.is_demo, u.name user_name
       FROM sales s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 8`,
    )
    .all() as { id: string }[];
  const itemsStmt = db.prepare('SELECT product_name, qty FROM sale_items WHERE sale_id = ? ORDER BY qty DESC');
  return {
    today,
    ranges: { week, month },
    units: { today: unitsIn(db, { from: today, to: today }), week: unitsIn(db, week), month: unitsIn(db, month) },
    stock: stockCounts(db),
    recent: recent.map((s) => ({ ...s, items: itemsStmt.all(s.id) })),
    alerts: alerts(db),
    hasSales: !!db.prepare("SELECT 1 FROM sales WHERE status='confirmada' LIMIT 1").get(),
    kitchen: kitchenSummary(db, today),
  };
}

/** Lo que el administrador debe atender de la cocina. */
export function kitchenSummary(db: DB, today = localDate()) {
  const n = (sql: string, ...p: string[]) => (db.prepare(sql).get(...p) as { n: number }).n;
  const week = { from: weekStart(today), to: today };
  const lowYield = listProductions(db, { from: addDays(today, -6), to: today, limit: 200 })
    .filter((p) => p.status === 'activa' && p.low)
    .slice(0, 5)
    .map((p) => ({ id: p.id, preparation_name: p.preparation_name, efficiency_pct: p.efficiency_pct, local_date: p.local_date, user_name: p.user_name }));
  return {
    pendingWastes: n("SELECT COUNT(*) n FROM wastes WHERE status = 'pendiente'"),
    openShortages: n("SELECT COUNT(*) n FROM shortages WHERE status IN ('abierto','pedido')"),
    pendingCounts: n("SELECT COUNT(*) n FROM counts WHERE status = 'pendiente'"),
    tasksToday: {
      total: n('SELECT COUNT(*) n FROM prep_tasks WHERE local_date = ?', today),
      done: n('SELECT COUNT(*) n FROM prep_tasks WHERE local_date = ? AND production_id IS NOT NULL', today),
    },
    productionsWeek: n("SELECT COUNT(*) n FROM productions WHERE status = 'activa' AND local_date BETWEEN ? AND ?", week.from, week.to),
    lowYield,
  };
}

/** Sección «Cocina» del reporte: preparaciones, mermas, bajas, entradas y diferencias de conteo. */
export function kitchenReport(db: DB, period: string, date: string) {
  const { range } = periodRange(period, date);
  const productions = listProductions(db, { from: range.from, to: range.to, limit: 500 }).filter((p) => p.status === 'activa');
  const byPrep = new Map<number, { preparation_id: number; name: string; unit: Unit; count: number; output_m: number; expected_m: number; merma_m: number; low: number }>();
  for (const p of productions) {
    const g = byPrep.get(p.preparation_id) ?? { preparation_id: p.preparation_id, name: p.preparation_name, unit: p.output_unit, count: 0, output_m: 0, expected_m: 0, merma_m: 0, low: 0 };
    g.count++;
    g.output_m += p.output_m;
    g.expected_m += p.expected_m;
    g.merma_m += p.merma_inutil_m;
    if (p.low) g.low++;
    byPrep.set(p.preparation_id, g);
  }
  const wastes = db
    .prepare(
      `SELECT w.item_id, i.name, i.unit, i.base_unit, w.reason, COUNT(*) count, SUM(w.qty_m) qty_m FROM wastes w JOIN items i ON i.id = w.item_id
       WHERE w.status = 'aprobada' AND w.local_date BETWEEN ? AND ? GROUP BY w.item_id, w.reason ORDER BY qty_m DESC`,
    )
    .all(range.from, range.to) as { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; reason: string; count: number; qty_m: number }[];
  // Entradas de mercancía por artículo. created_at es UTC: se compara con el rango en hora de Colombia.
  const entries = db
    .prepare(
      `SELECT m.item_id, i.name, i.unit, i.base_unit, COUNT(*) count, SUM(m.delta_m) total_m FROM movements m JOIN items i ON i.id = m.item_id
       WHERE m.type = 'entrada' AND m.created_at >= ? AND m.created_at < ? GROUP BY m.item_id ORDER BY i.name COLLATE NOCASE`,
    )
    .all(bogotaStart(range.from), bogotaStart(addDays(range.to, 1))) as { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; count: number; total_m: number }[];
  const countDiffs = db
    .prepare(
      `SELECT l.item_id, i.name, i.unit, i.base_unit, COUNT(*) count, SUM(l.counted_m - l.expected_m) diff_m FROM count_lines l
       JOIN counts c ON c.id = l.count_id JOIN items i ON i.id = l.item_id
       WHERE c.status = 'aplicado' AND c.local_date BETWEEN ? AND ? AND l.counted_m <> l.expected_m
       GROUP BY l.item_id ORDER BY ABS(SUM(l.counted_m - l.expected_m)) DESC`,
    )
    .all(range.from, range.to) as { item_id: number; name: string; unit: Unit; base_unit: BaseUnit; count: number; diff_m: number }[];
  return {
    period,
    range,
    productions: [...byPrep.values()].sort((a, b) => b.count - a.count),
    productionsCount: productions.length,
    wastes,
    wastesCount: wastes.reduce((s, w) => s + w.count, 0),
    entries,
    countDiffs,
  };
}

function bogotaStart(ymd: string): string {
  return new Date(`${ymd}T00:00:00-05:00`).toISOString();
}

/** Rango para los gráficos del tablero. */
export function chartRange(kind: string, today = localDate()): Range {
  switch (kind) {
    case 'dia':
      return { from: today, to: today };
    case 'semana':
    case '7d':
      return kind === '7d' ? { from: addDays(today, -6), to: today } : { from: weekStart(today), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mes':
      return { from: monthStart(today), to: today };
    default:
      throw bad('Período no válido.');
  }
}

/**
 * Reporte diario, semanal (lunes a domingo) o mensual que contiene la fecha dada,
 * con su comparación contra el período anterior equivalente.
 */
function periodRange(period: string, date: string): { range: Range; prev: Range } {
  if (!isYmd(date)) throw bad('Fecha no válida.');
  if (period === 'dia') return { range: { from: date, to: date }, prev: { from: addDays(date, -1), to: addDays(date, -1) } };
  if (period === 'semana') {
    const range = { from: weekStart(date), to: weekEnd(date) };
    return { range, prev: { from: addDays(range.from, -7), to: addDays(range.to, -7) } };
  }
  if (period === 'mes') {
    const pm = prevMonthStart(date);
    return { range: { from: monthStart(date), to: monthEnd(date) }, prev: { from: pm, to: monthEnd(pm) } };
  }
  throw bad('Período no válido.');
}

export function periodReport(db: DB, period: string, date: string) {
  const { range, prev } = periodRange(period, date);

  const total = unitsIn(db, range);
  const prevTotal = unitsIn(db, prev);
  const salesCount = (
    db.prepare("SELECT COUNT(*) n FROM sales WHERE status='confirmada' AND local_date BETWEEN ? AND ?").get(range.from, range.to) as {
      n: number;
    }
  ).n;
  const annulled = (
    db.prepare("SELECT COUNT(*) n FROM sales WHERE status='anulada' AND local_date BETWEEN ? AND ?").get(range.from, range.to) as {
      n: number;
    }
  ).n;

  // Evolución: por día (semana) o por semana (mes, cortando la semana al mes).
  let evolution: { label: string; from: string; to: string; units: number }[] = [];
  if (period === 'semana') {
    evolution = dailySeries(db, range).map((d) => ({ label: d.date, from: d.date, to: d.date, units: d.units }));
  } else if (period === 'mes') {
    for (let start = range.from; start <= range.to; ) {
      const end = weekEnd(start) < range.to ? weekEnd(start) : range.to;
      evolution.push({ label: `${start}|${end}`, from: start, to: end, units: unitsIn(db, { from: start, to: end }) });
      start = addDays(end, 1);
    }
  }

  return {
    period,
    range,
    prev,
    total,
    prevTotal,
    salesCount,
    annulled,
    byProduct: byProduct(db, range),
    prevByProduct: byProduct(db, prev),
    consumption: consumption(db, range),
    evolution,
  };
}
