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
  };
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
export function periodReport(db: DB, period: string, date: string) {
  if (!isYmd(date)) throw bad('Fecha no válida.');
  let range: Range;
  let prev: Range;
  if (period === 'dia') {
    range = { from: date, to: date };
    prev = { from: addDays(date, -1), to: addDays(date, -1) };
  } else if (period === 'semana') {
    range = { from: weekStart(date), to: weekEnd(date) };
    prev = { from: addDays(range.from, -7), to: addDays(range.to, -7) };
  } else if (period === 'mes') {
    range = { from: monthStart(date), to: monthEnd(date) };
    const pm = prevMonthStart(date);
    prev = { from: pm, to: monthEnd(pm) };
  } else {
    throw bad('Período no válido.');
  }

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
