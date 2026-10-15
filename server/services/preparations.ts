// Preparaciones: lo que hace la cocina con los insumos (cebolla → cebolla caramelizada,
// harina + levadura + sal… → masa). Reemplazan la hoja de merma y la hoja de masa.
import { type DB, nowIso, tx, isDemoMode } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr, str } from '../errors.ts';
import { baseOf, compatible, isUnit, toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';
import { PREP_MODES, productionYield, scaleBatch, type PrepMode } from '../../shared/kitchen.ts';
import { localDate } from '../../shared/dates.ts';
import { applyMovement } from './inventory.ts';
import type { User } from './users.ts';

export interface PrepInput {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  item_unit: Unit;
  unit: Unit;
  qty_m: number;
  available_m: number;
}

export interface Preparation {
  id: number;
  name: string;
  mode: PrepMode;
  output_item_id: number;
  output_name: string;
  output_unit: Unit;
  output_base: BaseUnit;
  output_available_m: number;
  std_output_m: number;
  std_yield_pct: number | null;
  instructions: string;
  active: boolean;
  is_demo: boolean;
  inputs: PrepInput[];
  last_production_at: string | null;
}

interface PrepRow {
  id: number;
  name: string;
  mode: PrepMode;
  output_item_id: number;
  output_name: string;
  output_unit: Unit;
  output_base: BaseUnit;
  output_available_m: number;
  std_output_m: number;
  instructions: string;
  active: number;
  is_demo: number;
}

const PREP_SELECT = `SELECT p.id, p.name, p.mode, p.output_item_id, i.name output_name, i.unit output_unit, i.base_unit output_base,
  i.qty_m output_available_m, p.std_output_m, p.instructions, p.active, p.is_demo
  FROM preparations p JOIN items i ON i.id = p.output_item_id`;

function inputsOf(db: DB, prepId: number): PrepInput[] {
  return db
    .prepare(
      `SELECT pi.item_id, i.name item_name, i.base_unit, i.unit item_unit, pi.unit, pi.qty_m, i.qty_m available_m
       FROM preparation_inputs pi JOIN items i ON i.id = pi.item_id WHERE pi.preparation_id = ? ORDER BY pi.position`,
    )
    .all(prepId) as unknown as PrepInput[];
}

function toPrep(db: DB, r: PrepRow): Preparation {
  const inputs = inputsOf(db, r.id);
  const base = inputs[0];
  const last = db.prepare("SELECT MAX(created_at) at FROM productions WHERE preparation_id = ? AND status = 'activa'").get(r.id) as { at: string | null };
  return {
    ...r,
    active: !!r.active,
    is_demo: !!r.is_demo,
    inputs,
    // El % de rendimiento solo tiene sentido en una transformación (1 kg de cebolla → 450 g).
    std_yield_pct: r.mode === 'transformacion' && base && base.base_unit === r.output_base ? Math.round((r.std_output_m / base.qty_m) * 1000) / 10 : null,
    last_production_at: last.at,
  };
}

export function listPreparations(db: DB): Preparation[] {
  const rows = db.prepare(`${PREP_SELECT} ORDER BY p.active DESC, p.name COLLATE NOCASE`).all() as unknown as PrepRow[];
  return rows.map((r) => toPrep(db, r));
}

export function getPreparation(db: DB, id: number): Preparation {
  const r = db.prepare(`${PREP_SELECT} WHERE p.id = ?`).get(id) as PrepRow | undefined;
  if (!r) throw notFound('Preparación no encontrada.');
  return toPrep(db, r);
}

interface ItemRef {
  id: number;
  name: string;
  unit: Unit;
  base_unit: BaseUnit;
  active: number;
}

function itemRef(db: DB, id: unknown): ItemRef {
  const r = db.prepare('SELECT id, name, unit, base_unit, active FROM items WHERE id = ?').get(Number(id)) as ItemRef | undefined;
  if (!r) throw bad('Un artículo de la preparación no existe en el inventario.');
  if (!r.active) throw bad(`"${r.name}" está desactivado en inventario.`);
  return r;
}

function qtyIn(item: ItemRef, qty: unknown, unit: unknown, field: string, allowZero = false): { qtyM: number; unit: Unit } {
  const u = unit === undefined ? item.unit : unit;
  if (!isUnit(u)) throw bad(`Unidad no válida para "${item.name}".`);
  if (!compatible(u, item.unit)) throw bad(`La unidad ${u} no es compatible con "${item.name}" (${item.unit}).`);
  const n = num(qty, field, { allowZero, max: 1e7 });
  return { qtyM: toMilli(n, u), unit: u };
}

function validPrep(db: DB, body: Record<string, unknown>, current?: Preparation) {
  const name = body.name === undefined && current ? current.name : str(body.name, 'nombre', { max: 80 });
  const mode = body.mode === undefined && current ? current.mode : oneOf(body.mode, 'tipo de preparación', PREP_MODES);
  const output = itemRef(db, body.output_item_id ?? current?.output_item_id);
  const instructions = body.instructions === undefined ? (current?.instructions ?? '') : optStr(body.instructions, 'instrucciones', 600);

  const rawInputs = body.inputs ?? current?.inputs.map((i) => ({ item_id: i.item_id, qty: i.qty_m / 1000, unit: baseOf(i.unit) }));
  if (!Array.isArray(rawInputs) || rawInputs.length === 0) throw bad('Agrega al menos un ingrediente.');
  if (mode === 'transformacion' && rawInputs.length !== 1) throw bad('Una transformación usa un solo insumo (por ejemplo, cebolla → cebolla caramelizada).');
  const seen = new Set<number>();
  const inputs = (rawInputs as Record<string, unknown>[]).map((l) => {
    const it = itemRef(db, l?.item_id);
    if (it.id === output.id) throw bad('El resultado no puede ser también ingrediente de la misma preparación.');
    if (seen.has(it.id)) throw bad(`"${it.name}" está repetido. Suma las cantidades en una sola línea.`);
    seen.add(it.id);
    const q = qtyIn(it, l.qty, l.unit, `cantidad de ${it.name}`);
    return { itemId: it.id, qtyM: q.qtyM, unit: q.unit };
  });

  const stdRaw = body.std_output === undefined && current ? null : body.std_output;
  const stdOutputM = stdRaw === null ? current!.std_output_m : qtyIn(output, stdRaw, body.std_output_unit, 'rendimiento estándar').qtyM;
  if (mode === 'transformacion') {
    const base = itemRef(db, inputs[0].itemId);
    if (base.base_unit !== output.base_unit) {
      throw bad(`Para medir la merma, "${base.name}" y "${output.name}" deben medirse igual (los dos en peso o los dos en volumen).`);
    }
  }
  return { name, mode, output, instructions, inputs, stdOutputM };
}

function saveInputs(db: DB, prepId: number, inputs: { itemId: number; qtyM: number; unit: Unit }[]) {
  db.prepare('DELETE FROM preparation_inputs WHERE preparation_id = ?').run(prepId);
  const ins = db.prepare('INSERT INTO preparation_inputs(preparation_id, item_id, qty_m, unit, position) VALUES (?,?,?,?,?)');
  inputs.forEach((l, idx) => ins.run(prepId, l.itemId, l.qtyM, l.unit, idx));
}

export function createPreparation(db: DB, body: Record<string, unknown>): Preparation {
  const v = validPrep(db, body);
  if (db.prepare('SELECT 1 FROM preparations WHERE name = ? COLLATE NOCASE AND active = 1').get(v.name)) {
    throw conflict(`Ya existe una preparación activa llamada "${v.name}".`);
  }
  return tx(db, () => {
    const now = nowIso();
    const r = db
      .prepare('INSERT INTO preparations(name, output_item_id, mode, std_output_m, instructions, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(v.name, v.output.id, v.mode, v.stdOutputM, v.instructions, isDemoMode(db) ? 1 : 0, now, now);
    const id = Number(r.lastInsertRowid);
    saveInputs(db, id, v.inputs);
    // Lo que sale de una preparación lo hace la cocina.
    db.prepare("UPDATE items SET kind = 'preparacion' WHERE id = ?").run(v.output.id);
    return getPreparation(db, id);
  });
}

export function updatePreparation(db: DB, id: number, body: Record<string, unknown>): Preparation {
  const current = getPreparation(db, id);
  const v = validPrep(db, body, current);
  if (db.prepare('SELECT 1 FROM preparations WHERE name = ? COLLATE NOCASE AND active = 1 AND id <> ?').get(v.name, id)) {
    throw conflict(`Ya existe una preparación activa llamada "${v.name}".`);
  }
  return tx(db, () => {
    db.prepare('UPDATE preparations SET name=?, output_item_id=?, mode=?, std_output_m=?, instructions=?, updated_at=? WHERE id=?').run(
      v.name,
      v.output.id,
      v.mode,
      v.stdOutputM,
      v.instructions,
      nowIso(),
      id,
    );
    saveInputs(db, id, v.inputs);
    db.prepare("UPDATE items SET kind = 'preparacion' WHERE id = ?").run(v.output.id);
    return getPreparation(db, id);
  });
}

export function setPreparationActive(db: DB, id: number, active: boolean): Preparation {
  getPreparation(db, id);
  db.prepare('UPDATE preparations SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), id);
  return getPreparation(db, id);
}

// ---------- Producciones (lo que la cocina prepara cada día) ----------

export interface ProductionView {
  id: number;
  preparation_id: number;
  preparation_name: string;
  mode: PrepMode;
  output_item_id: number;
  output_name: string;
  output_unit: Unit;
  output_m: number;
  expected_m: number;
  merma_util_m: number;
  merma_inutil_m: number;
  yield_pct: number | null;
  efficiency_pct: number | null;
  low: boolean;
  note: string;
  status: 'activa' | 'anulada';
  user_id: number;
  user_name: string;
  created_at: string;
  local_date: string;
  annul_reason: string | null;
  is_demo: number;
  inputs: { item_id: number; item_name: string; unit: Unit; base_unit: BaseUnit; qty_m: number }[];
}

type ProductionRow = Omit<ProductionView, 'inputs' | 'yield_pct' | 'efficiency_pct' | 'low'> & { output_base: BaseUnit };

const PRODUCTION_SELECT = `SELECT pr.*, p.mode, i.name output_name, i.unit output_unit, i.base_unit output_base, u.name user_name
  FROM productions pr JOIN preparations p ON p.id = pr.preparation_id JOIN items i ON i.id = pr.output_item_id JOIN users u ON u.id = pr.user_id`;

function toProduction(db: DB, r: ProductionRow): ProductionView {
  const inputs = db
    .prepare(
      `SELECT x.item_id, x.item_name, i.unit, i.base_unit, x.qty_m FROM production_inputs x JOIN items i ON i.id = x.item_id
       WHERE x.production_id = ? ORDER BY x.rowid`,
    )
    .all(r.id) as ProductionView['inputs'];
  const base = inputs[0];
  const y = productionYield({
    baseInputM: base?.qty_m ?? 0,
    outputM: r.output_m,
    expectedM: r.expected_m,
    sameBase: r.mode === 'transformacion' && !!base && base.base_unit === r.output_base,
  });
  const { output_base: _ob, ...rest } = r;
  return { ...rest, inputs, yield_pct: y.yieldPct, efficiency_pct: y.efficiencyPct, low: y.low };
}

export function getProduction(db: DB, id: number): ProductionView {
  const r = db.prepare(`${PRODUCTION_SELECT} WHERE pr.id = ?`).get(id) as ProductionRow | undefined;
  if (!r) throw notFound('Registro de preparación no encontrado.');
  return toProduction(db, r);
}

export function listProductions(db: DB, q: { from?: string; to?: string; userId?: number; preparationId?: number; limit?: number }): ProductionView[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const filters: [string, string | number | undefined][] = [
    ['pr.local_date >= ?', q.from],
    ['pr.local_date <= ?', q.to],
    ['pr.user_id = ?', q.userId],
    ['pr.preparation_id = ?', q.preparationId],
  ];
  for (const [sql, value] of filters) {
    if (value === undefined || value === '') continue;
    where.push(sql);
    params.push(value);
  }
  params.push(Math.min(Math.max(q.limit ?? 100, 1), 500));
  const rows = db
    .prepare(`${PRODUCTION_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY pr.created_at DESC, pr.id DESC LIMIT ?`)
    .all(...params) as unknown as ProductionRow[];
  return rows.map((r) => toProduction(db, r));
}

/**
 * Registrar una preparación. Descuenta lo que se usó, suma lo que salió y guarda el
 * rendimiento, todo o nada.
 * - Transformación: { preparation_id, input_qty, input_unit, output_qty, output_unit, merma_util_qty? }
 * - Lote: { preparation_id, inputs: [{item_id, qty, unit}], output_qty, output_unit }
 *   (el primer ingrediente es la base con la que se calcula lo que debía rendir).
 */
export function registerProduction(db: DB, user: User, body: Record<string, unknown>, opts: { at?: string; isDemo?: boolean } = {}): ProductionView {
  const prep = getPreparation(db, Number(body.preparation_id));
  if (!prep.active) throw conflict('Esta preparación está desactivada.');
  const output = itemRef(db, prep.output_item_id);
  const outQ = qtyIn(output, body.output_qty, body.output_unit, `cantidad de ${output.name} que salió`);
  const note = optStr(body.note, 'nota', 300);

  let used: { itemId: number; name: string; qtyM: number }[];
  let mermaUtil = 0;
  let mermaInutil = 0;
  if (prep.mode === 'transformacion') {
    const baseItem = itemRef(db, prep.inputs[0].item_id);
    const inQ = qtyIn(baseItem, body.input_qty, body.input_unit, `cantidad de ${baseItem.name} que se usó`);
    used = [{ itemId: baseItem.id, name: baseItem.name, qtyM: inQ.qtyM }];
    if (body.merma_util_qty !== undefined && body.merma_util_qty !== '' && body.merma_util_qty !== null) {
      mermaUtil = qtyIn(baseItem, body.merma_util_qty, body.merma_util_unit ?? body.input_unit, 'merma útil', true).qtyM;
    }
    // La merma que se bota es lo que no salió ni se aprovechó: peso inicial − peso final − merma útil.
    mermaInutil = Math.max(0, inQ.qtyM - outQ.qtyM - mermaUtil);
    if (outQ.qtyM + mermaUtil > inQ.qtyM * 1.5) {
      throw bad('Lo que salió es mucho más de lo que entró. Revisa las cantidades y las unidades.');
    }
  } else {
    const raw = body.inputs;
    if (!Array.isArray(raw) || raw.length === 0) throw bad('Indica cuánto se usó de cada ingrediente.');
    const allowed = new Map(prep.inputs.map((i) => [i.item_id, i]));
    const seen = new Set<number>();
    used = [];
    for (const l of raw as Record<string, unknown>[]) {
      const it = itemRef(db, l?.item_id);
      if (!allowed.has(it.id)) throw bad(`"${it.name}" no hace parte de la receta de ${prep.name}.`);
      if (seen.has(it.id)) throw bad(`"${it.name}" está repetido.`);
      seen.add(it.id);
      const q = qtyIn(it, l.qty, l.unit, `cantidad de ${it.name}`, true);
      if (q.qtyM > 0) used.push({ itemId: it.id, name: it.name, qtyM: q.qtyM });
    }
    if (!used.some((u) => u.itemId === prep.inputs[0].item_id)) {
      throw bad(`Indica cuánto se usó de ${prep.inputs[0].item_name}: con eso se calcula lo que debía rendir.`);
    }
  }
  const baseUsed = used.find((u) => u.itemId === prep.inputs[0].item_id)!.qtyM;
  const expected = scaleBatch(prep.inputs, prep.std_output_m, baseUsed).expectedM;

  // Primero se valida que alcance todo, para dar un mensaje claro y no a medias.
  const short = used.filter((u) => (db.prepare('SELECT qty_m FROM items WHERE id = ?').get(u.itemId) as { qty_m: number }).qty_m < u.qtyM);
  if (short.length) {
    throw conflict(
      `No alcanza ${short.map((s) => s.name).join(', ')} según el inventario. Si sí hay, avisa al administrador para que corrija la existencia.`,
      { items: short.map((s) => s.itemId) },
    );
  }

  const at = opts.at ?? nowIso();
  const day = localDate(new Date(at));
  const isDemo = opts.isDemo ?? isDemoMode(db);
  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO productions(preparation_id, preparation_name, output_item_id, output_m, expected_m, merma_util_m, merma_inutil_m, note, user_id, created_at, local_date, is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(prep.id, prep.name, output.id, outQ.qtyM, expected, mermaUtil, mermaInutil, note, user.id, at, day, isDemo ? 1 : 0);
    const id = Number(r.lastInsertRowid);
    const insInput = db.prepare('INSERT INTO production_inputs(production_id, item_id, item_name, qty_m) VALUES (?,?,?,?)');
    for (const u of used) {
      insInput.run(id, u.itemId, u.name, u.qtyM);
      applyMovement(db, { itemId: u.itemId, delta: -u.qtyM, type: 'produccion', reason: `Se usó para ${prep.name} (#${id})`, userId: user.id, at, isDemo });
    }
    applyMovement(db, { itemId: output.id, delta: outQ.qtyM, type: 'produccion', reason: `Preparación #${id}`, userId: user.id, at, isDemo });
    // Marca como hecha la tarea del plan de hoy para esta preparación, si había.
    db.prepare(
      `UPDATE prep_tasks SET production_id = ? WHERE id = (
         SELECT id FROM prep_tasks WHERE local_date = ? AND preparation_id = ? AND production_id IS NULL ORDER BY id LIMIT 1)`,
    ).run(id, day, prep.id);
    return getProduction(db, id);
  });
}

/** Deshacer una preparación registrada por error: devuelve los insumos y retira lo que salió. */
export function annulProduction(db: DB, user: User, id: number, body: Record<string, unknown>): ProductionView {
  const p = getProduction(db, id);
  if (p.status === 'anulada') throw conflict('Esta preparación ya fue anulada.');
  const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
  const at = nowIso();
  return tx(db, () => {
    applyMovement(db, { itemId: p.output_item_id, delta: -p.output_m, type: 'produccion', reason: `Anulación de preparación #${id}: ${reason}`, userId: user.id, at, isDemo: !!p.is_demo });
    for (const i of p.inputs) {
      applyMovement(db, { itemId: i.item_id, delta: i.qty_m, type: 'produccion', reason: `Anulación de preparación #${id}: ${reason}`, userId: user.id, at, isDemo: !!p.is_demo });
    }
    db.prepare("UPDATE productions SET status='anulada', annulled_by=?, annulled_at=?, annul_reason=? WHERE id=?").run(user.id, at, reason, id);
    db.prepare('UPDATE prep_tasks SET production_id = NULL WHERE production_id = ?').run(id);
    return getProduction(db, id);
  });
}
