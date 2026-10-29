// Datos de DEMOSTRACIÓN. Todo lo que se crea aquí queda marcado con is_demo = 1
// y se puede borrar por completo sin tocar información real.
// Se usa el catálogo real de Pizza Diana (shared/catalog.ts) y la actividad se registra
// con la MISMA lógica que la real (ventas, preparaciones, bajas, conteos), solo que con
// fechas pasadas, así que los gráficos coinciden exactamente con lo guardado.
import { type DB, tx, setSetting, isDemoMode } from '../db.ts';
import { conflict } from '../errors.ts';
import { addDays, localDate, weekStart } from '../../shared/dates.ts';
import { CATALOG_ITEMS, CATALOG_PREPARATIONS, CATALOG_PRODUCTS } from '../../shared/catalog.ts';
import { createItem, registerEntry, getItem } from './inventory.ts';
import { createProduct } from './products.ts';
import { annulSale, previewSale, registerSale } from './sales.ts';
import { createPreparation, getPreparation, registerProduction } from './preparations.ts';
import { reportWaste, reviewWaste } from './wastes.ts';
import { reportShortage, setShortageStatus } from './shortages.ts';
import { setCell, validateDay } from './daySheet.ts';
import { getUser, insertDemoUser, type User } from './users.ts';
import type { Unit } from '../../shared/units.ts';

/** Generador pseudoaleatorio con semilla fija: la demo siempre sale igual. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Instante ISO para una fecha local de Colombia (UTC-5, sin horario de verano). */
function bogota(ymd: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${ymd}T${hh}:${mm}:00-05:00`).toISOString();
}

export function realDataCounts(db: DB) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    items: n('SELECT COUNT(*) n FROM items WHERE is_demo = 0'),
    products: n('SELECT COUNT(*) n FROM products WHERE is_demo = 0'),
    sales: n('SELECT COUNT(*) n FROM sales WHERE is_demo = 0'),
  };
}

export function demoStatus(db: DB) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    demoMode: isDemoMode(db),
    real: realDataCounts(db),
    demo: {
      items: n('SELECT COUNT(*) n FROM items WHERE is_demo = 1'),
      products: n('SELECT COUNT(*) n FROM products WHERE is_demo = 1'),
      sales: n('SELECT COUNT(*) n FROM sales WHERE is_demo = 1'),
    },
  };
}

/** Qué prepara la cocina cada día de la semana (0 = domingo). Así trabaja Pizza Diana: cada día algo distinto. */
export const DEMO_WEEK_PLAN: Record<number, string[]> = {
  1: ['masa', 'cebolla_caramelizada', 'tomate_picado'],
  2: ['pechuga_desmechada', 'cebolla_picada'],
  3: ['cerdo_prep', 'pechuga_plancha'],
  4: ['tomate_picado', 'carne_molida_prep'],
  5: ['masa', 'cebolla_caramelizada', 'pechuga_desmechada'],
  6: ['tomate_picado', 'pechuga_plancha'],
  0: ['cebolla_picada', 'cerdo_prep'],
};

export function loadDemo(db: DB, admin: User, now = new Date()) {
  const real = realDataCounts(db);
  if (real.items || real.products || real.sales) {
    throw conflict(
      `Ya hay información real (${real.items} artículos, ${real.products} productos, ${real.sales} ventas). ` +
        'Para no mezclarla con datos ficticios, la demostración solo se puede cargar en un sistema vacío.',
    );
  }
  if (isDemoMode(db)) throw conflict('La demostración ya está cargada. Usa "Restablecer demostración".');

  return tx(db, () => {
    setSetting(db, 'demo_mode', '1');
    const rand = rng(20261015);
    const today = localDate(now);
    const DAYS = 35;
    const start = addDays(today, -DAYS);
    const t0 = bogota(start, 7, 0);

    const laura = getUser(db, insertDemoUser(db, 'laura.demo', 'Laura (DEMO)', 'caja'));
    const carlos = getUser(db, insertDemoUser(db, 'carlos.demo', 'Carlos (DEMO)', 'cocina'));
    const andres = getUser(db, insertDemoUser(db, 'andres.demo', 'Andrés (DEMO)', 'cocina'));
    const sellers = [laura, laura, laura, admin];
    const cooks = [carlos, carlos, andres];
    const pickOne = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

    // ---- Catálogo ----
    const itemId: Record<string, number> = {};
    CATALOG_ITEMS.forEach((c, idx) => {
      itemId[c.key] = createItem(
        db,
        admin,
        {
          name: c.name,
          category: c.category,
          unit: c.unit,
          qty: c.demoQty,
          min: c.min,
          location: c.location,
          kind: c.kind,
          sort_order: (idx + 1) * 10,
          pack_size: c.pack?.[0] ?? null,
          pack_unit: c.pack ? (c.unit === 'kg' ? 'g' : c.unit === 'l' ? 'ml' : c.unit) : undefined,
          pack_label: c.pack?.[1],
        },
        { at: t0 },
      ).id;
    });
    const prepId: Record<string, number> = {};
    for (const p of CATALOG_PREPARATIONS) {
      prepId[p.key] = createPreparation(db, {
        name: p.name,
        mode: p.mode,
        output_item_id: itemId[p.output],
        std_output: p.stdOutput[0],
        std_output_unit: p.stdOutput[1],
        instructions: p.instructions,
        inputs: p.inputs.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })),
      }).id;
    }
    const productId: Record<string, number> = {};
    for (const p of CATALOG_PRODUCTS) {
      productId[p.key] = createProduct(db, {
        name: p.name,
        category: p.category,
        type: p.type,
        description: p.description,
        recipe: p.recipe.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })),
      }).id;
    }
    // Las fechas de creación también quedan en el pasado.
    db.prepare('UPDATE products SET created_at = ?, updated_at = ? WHERE is_demo = 1').run(t0, t0);
    db.prepare('UPDATE preparations SET created_at = ?, updated_at = ? WHERE is_demo = 1').run(t0, t0);

    const prepByOutput = new Map(CATALOG_PREPARATIONS.map((p) => [itemId[p.output], p.key]));
    const catalogByItem = new Map(CATALOG_ITEMS.map((c) => [itemId[c.key], c]));
    const milliOf = (unit: Unit) => (unit === 'kg' || unit === 'l' ? 1_000_000 : 1000);

    /** Compra lo que haga falta de un insumo (también DEMO). */
    const buy = (id: number, missingM: number, at: string, reason: string) => {
      const c = catalogByItem.get(id)!;
      const qty = Math.ceil((missingM + c.min * milliOf(c.unit)) / milliOf(c.unit));
      registerEntry(db, admin, id, { qty, unit: c.unit, reason }, { at });
    };

    /** La cocina prepara un lote; si no alcanza un insumo, primero se compra. */
    const produce = (key: string, at: string, cook: User, size = 1) => {
      const prep = getPreparation(db, prepId[key]);
      const base = prep.inputs[0];
      const baseQ = Math.round(base.qty_m * size * (prep.mode === 'lote' ? 1 : 2 + Math.floor(rand() * 3)));
      const factor = baseQ / base.qty_m;
      for (const i of prep.inputs) {
        const need = Math.round(i.qty_m * factor);
        const have = getItem(db, i.item_id).qty_m;
        if (have < need) buy(i.item_id, need - have, at, 'Compra urgente (DEMO)');
      }
      // Rendimiento real: casi siempre cerca del estándar; a veces bajo (para ver la alerta).
      const eff = rand() < 0.06 ? 0.78 + rand() * 0.08 : 0.92 + rand() * 0.12;
      const outM = Math.round(prep.std_output_m * factor * eff);
      const body: Record<string, unknown> = { preparation_id: prep.id, output_qty: outM / 1000, output_unit: prep.output_base };
      if (prep.mode === 'transformacion') {
        body.input_qty = baseQ / 1000;
        body.input_unit = base.base_unit;
        if (rand() < 0.3) body.merma_util_qty = Math.round((baseQ * 0.05) / 1000);
      } else {
        body.inputs = prep.inputs.map((i) => ({ item_id: i.item_id, qty: Math.round(i.qty_m * factor) / 1000, unit: i.base_unit }));
      }
      return registerProduction(db, cook, body, { at, isDemo: true });
    };

    const totalWeight = CATALOG_PRODUCTS.reduce((s, p) => s + p.weight, 0);
    const pickProduct = () => {
      let r = rand() * totalWeight;
      for (const p of CATALOG_PRODUCTS) if ((r -= p.weight) < 0) return p.key;
      return CATALOG_PRODUCTS[0].key;
    };

    const thisWeek = weekStart(today);
    const planFrom = addDays(thisWeek, -7);
    const insTask = db.prepare(
      'INSERT INTO prep_tasks(local_date, preparation_id, target_m, note, created_by, created_at, is_demo) VALUES (?,?,?,?,?,?,1)',
    );

    let seq = 0;
    const saleIds: string[] = [];

    // Apertura y cierre de la última semana. Al cerrar, algunos productos se gastaron un poco
    // más de lo que dicen las recetas (porciones grandes, picoteo): así se ve en «Caja vs cocina».
    const EXTRA_USE: Record<string, number> = { queso_mozzarella: 0.06, tocineta: 0.1, papas: 0.08, pepperoni: 0.07 };
    const soldSince = db.prepare("SELECT COALESCE(-SUM(delta_m), 0) n FROM movements WHERE item_id = ? AND type = 'venta' AND created_at >= ?");
    // La hoja del día: inicio al abrir, fin al cerrar (con el gasto de más) y la validación de la jefa de cocina.
    const fillSheet = (day: string, field: 'open' | 'close', at: string, openedAt?: string) => {
      for (const c of CATALOG_ITEMS) {
        const it = getItem(db, itemId[c.key]);
        const extra = field === 'close' && openedAt ? Math.round((soldSince.get(it.id, openedAt) as { n: number }).n * (EXTRA_USE[c.key] ?? 0)) : 0;
        setCell(db, carlos, { date: day, item_id: it.id, field, value_m: Math.max(0, it.qty_m - extra) }, { at });
      }
    };
    for (let i = 0; i <= DAYS; i++) {
      const day = addDays(start, i);
      const dow = new Date(day + 'T00:00:00Z').getUTCDay();
      const isToday = day === today;

      // Lunes: compra semanal de insumos al proveedor.
      if (dow === 1 && i > 0) {
        for (const c of CATALOG_ITEMS) {
          if (c.kind !== 'insumo') continue;
          const cur = getItem(db, itemId[c.key]);
          const target = c.demoQty * milliOf(c.unit);
          if (cur.qty_m < target * 0.7) {
            registerEntry(db, admin, cur.id, { qty: Math.ceil((target - cur.qty_m) / milliOf(c.unit)), unit: c.unit, reason: 'Compra semanal a proveedor (DEMO)' }, { at: bogota(day, 9, 0) });
          }
        }
      }

      const withCounts = i >= DAYS - 7;
      if (withCounts && new Date(bogota(day, 8, 30)) <= now) fillSheet(day, 'open', bogota(day, 8, 30));

      // Plan del día (se guarda para la semana pasada y la actual) y lo que prepara la cocina en la mañana.
      const plan = DEMO_WEEK_PLAN[dow];
      if (day >= planFrom) {
        for (const key of plan) insTask.run(day, prepId[key], null, '', admin.id, bogota(addDays(day, -2), 18, 0));
      }
      plan.forEach((key, idx) => {
        // Hoy la cocina va por la mitad del plan: lo demás queda pendiente en su pantalla.
        if (isToday && idx >= Math.ceil(plan.length / 2)) return;
        const at = bogota(day, 9 + idx, 10 + Math.floor(rand() * 40));
        if (new Date(at) > now) return;
        produce(key, at, pickOne(cooks));
      });

      // Ventas del día.
      const weekend = dow === 5 || dow === 6 || dow === 0;
      const count = Math.round((weekend ? 12 : 7) + rand() * (weekend ? 8 : 5) + i * 0.08);
      const times = Array.from({ length: count }, () => 12 * 60 + Math.floor(rand() * 10 * 60)).sort((a, b) => a - b);
      for (const minute of times) {
        const at = bogota(day, Math.floor(minute / 60), minute % 60);
        if (new Date(at) > now) break;
        const lines = new Map<string, number>();
        const nLines = rand() < 0.5 ? 1 : rand() < 0.8 ? 2 : 3;
        for (let k = 0; k < nLines; k++) {
          const key = pickProduct();
          lines.set(key, (lines.get(key) ?? 0) + (rand() < 0.75 ? 1 : 2));
        }
        const items = [...lines].map(([k, qty]) => ({ productId: productId[k], qty }));
        // Si algo no alcanza: las preparaciones se hacen de urgencia y los insumos se compran.
        for (const s of previewSale(db, { items }).shortages) {
          const prepKey = prepByOutput.get(s.item_id);
          if (prepKey) {
            let guard = 0;
            while (getItem(db, s.item_id).qty_m < s.needed_m && guard++ < 5) produce(prepKey, at, pickOne(cooks));
          } else {
            buy(s.item_id, s.short_m, at, 'Compra urgente (DEMO)');
          }
        }
        const res = registerSale(db, pickOne(sellers), { requestId: `demo-${++seq}-${day}`, items }, { at, isDemo: true });
        saleIds.push(res.sale.id);
      }

      // Algunas bajas autorizadas a lo largo del mes.
      if (!isToday && rand() < 0.22) {
        const candidates = ['tomate', 'lechuga', 'pan_hamburguesa', 'masa', 'cebolla_caramelizada'];
        const key = pickOne(candidates);
        const it = getItem(db, itemId[key]);
        const qtyM =
          it.base_unit === 'unidad' ? Math.min(2000, Math.floor(it.qty_m / 1000) * 1000) : Math.min(it.qty_m, 150_000 + Math.floor(rand() * 250_000));
        if (qtyM > 0) {
          const w = reportWaste(
            db,
            pickOne(cooks),
            { item_id: it.id, qty: qtyM / 1000, unit: it.base_unit, reason: pickOne(['vencido', 'danado', 'mal_preparado', 'accidente'] as const), note: 'DEMO' },
            { at: bogota(day, 21, 30), isDemo: true },
          );
          reviewWaste(db, admin, w.id, { decision: 'aprobar', note: 'Revisada con la foto' }, { at: bogota(day, 22, 0) });
        }
      }

      // Cierre del día, después de las bajas de la noche.
      if (withCounts && !isToday) {
        fillSheet(day, 'close', bogota(day, 23, 15), bogota(day, 8, 30));
        // El último día cerrado queda sin validar, para que se vea cómo se valida.
        if (i < DAYS - 1) validateDay(db, carlos, { date: day, note: '' }, { at: bogota(day, 23, 40) });
      }
    }

    // Un par de ventas anuladas para que se vea el flujo de auditoría.
    for (const idx of [Math.floor(saleIds.length * 0.4), Math.floor(saleIds.length * 0.6)]) {
      const id = saleIds[idx];
      if (!id) continue;
      const created = (db.prepare('SELECT created_at FROM sales WHERE id = ?').get(id) as { created_at: string }).created_at;
      annulSale(db, admin, id, { reason: 'Registrada por error (DEMO)' }, { at: new Date(new Date(created).getTime() + 10 * 60_000).toISOString() });
    }

    // ---- Lo pendiente de hoy, para que el administrador vea su bandeja ----
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
    // Bajas de hoy esperando autorización.
    const tomate = getItem(db, itemId.tomate);
    if (tomate.qty_m > 0) {
      reportWaste(db, carlos, { item_id: tomate.id, qty: Math.min(400, tomate.qty_m / 1000), unit: 'g', reason: 'danado', note: 'Poca rotación, tenía moho (DEMO)' }, { at: minutesAgo(80), isDemo: true });
    }
    const masa = getItem(db, itemId.masa);
    if (masa.qty_m > 0) {
      reportWaste(db, andres, { item_id: masa.id, qty: Math.min(600, masa.qty_m / 1000), unit: 'g', reason: 'mal_preparado', note: 'Se pasó de fermentación (DEMO)' }, { at: minutesAgo(40), isDemo: true });
    }

    // Faltantes reportados por la cocina hoy.
    reportShortage(db, carlos, { item_id: itemId.lechuga, level: 'agotado', note: 'No alcanza para la noche' }, { at: minutesAgo(120), isDemo: true });
    reportShortage(db, andres, { item_id: itemId.levadura, level: 'poco', note: 'Queda para un solo lote de masa' }, { at: minutesAgo(70), isDemo: true });
    const pedido = reportShortage(db, carlos, { item_id: itemId.salsa_bbq, level: 'poco', note: '' }, { at: minutesAgo(60 * 26), isDemo: true });
    setShortageStatus(db, admin, pedido.id, { status: 'pedido' });

    return demoStatus(db);
  });
}

/** Borra TODO lo marcado como DEMO y sale del modo demostración. */
export function clearDemo(db: DB) {
  return tx(db, () => {
    db.exec(`
      DELETE FROM prep_tasks WHERE is_demo = 1;
      DELETE FROM productions WHERE is_demo = 1;
      DELETE FROM wastes WHERE is_demo = 1;
      DELETE FROM shortages WHERE is_demo = 1;
      DELETE FROM counts WHERE is_demo = 1;
      DELETE FROM day_sheet_lines WHERE is_demo = 1;
      DELETE FROM day_sheets WHERE is_demo = 1;
      DELETE FROM preparations WHERE is_demo = 1;
      DELETE FROM movements WHERE is_demo = 1;
      DELETE FROM sales WHERE is_demo = 1;
      DELETE FROM products WHERE is_demo = 1;
      DELETE FROM items WHERE is_demo = 1;
      DELETE FROM users WHERE is_demo = 1;
    `);
    setSetting(db, 'demo_mode', '0');
    return demoStatus(db);
  });
}

export function resetDemo(db: DB, admin: User) {
  return tx(db, () => {
    clearDemo(db);
    return loadDemo(db, admin);
  });
}
