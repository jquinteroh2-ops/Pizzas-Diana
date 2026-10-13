// Datos de DEMOSTRACIÓN. Todo lo que se crea aquí queda marcado con is_demo = 1
// y se puede borrar por completo sin tocar información real.
// Las ventas DEMO se registran con la MISMA lógica que una venta real (recetas,
// descuentos y movimientos), solo que con fechas pasadas, así que los gráficos
// coinciden exactamente con lo que hay guardado.
import { type DB, tx, setSetting, isDemoMode } from '../db.ts';
import { conflict } from '../errors.ts';
import { addDays, localDate } from '../../shared/dates.ts';
import { createItem, registerAdjustment, registerEntry, getItem } from './inventory.ts';
import { createProduct } from './products.ts';
import { annulSale, previewSale, registerSale } from './sales.ts';
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

const ITEMS: { key: string; name: string; category: string; unit: Unit; qty: number; min: number }[] = [
  { key: 'masa', name: 'Masa preparada', category: 'Productos preparados', unit: 'unidad', qty: 120, min: 25 },
  { key: 'queso', name: 'Queso mozzarella', category: 'Ingredientes', unit: 'kg', qty: 30, min: 6 },
  { key: 'salsa', name: 'Salsa de tomate', category: 'Ingredientes', unit: 'kg', qty: 15, min: 3 },
  { key: 'pepperoni', name: 'Pepperoni', category: 'Ingredientes', unit: 'kg', qty: 7, min: 1.5 },
  { key: 'jamon', name: 'Jamón', category: 'Ingredientes', unit: 'kg', qty: 8, min: 1.5 },
  { key: 'pina', name: 'Piña en cubos', category: 'Ingredientes', unit: 'kg', qty: 5, min: 1 },
  { key: 'pollo', name: 'Pollo desmechado', category: 'Ingredientes', unit: 'kg', qty: 6, min: 1.5 },
  { key: 'champi', name: 'Champiñones', category: 'Ingredientes', unit: 'kg', qty: 4, min: 1 },
  { key: 'pimenton', name: 'Pimentón', category: 'Ingredientes', unit: 'kg', qty: 3, min: 0.6 },
  { key: 'cebolla', name: 'Cebolla', category: 'Ingredientes', unit: 'kg', qty: 3, min: 0.6 },
  { key: 'oregano', name: 'Orégano', category: 'Ingredientes', unit: 'g', qty: 500, min: 100 },
  { key: 'caja', name: 'Caja para pizza', category: 'Empaques', unit: 'unidad', qty: 150, min: 30 },
  { key: 'gaseosa', name: 'Gaseosa 400 ml', category: 'Bebidas', unit: 'unidad', qty: 96, min: 24 },
  { key: 'agua', name: 'Agua embotellada 600 ml', category: 'Bebidas', unit: 'unidad', qty: 48, min: 12 },
  { key: 'servilletas', name: 'Servilletas', category: 'Otros', unit: 'unidad', qty: 1000, min: 200 },
];

type Line = [key: string, qty: number, unit: Unit];
const PRODUCTS: { key: string; name: string; category: string; type: 'preparado' | 'directo'; description: string; recipe: Line[]; weight: number }[] = [
  {
    key: 'pepperoni', name: 'Pizza de pepperoni', category: 'Pizzas', type: 'preparado', weight: 26,
    description: 'Mozzarella, salsa de la casa y pepperoni.',
    recipe: [['masa', 1, 'unidad'], ['queso', 200, 'g'], ['salsa', 80, 'g'], ['pepperoni', 60, 'g'], ['oregano', 2, 'g'], ['caja', 1, 'unidad']],
  },
  {
    key: 'hawaiana', name: 'Pizza hawaiana', category: 'Pizzas', type: 'preparado', weight: 20,
    description: 'Jamón, piña y mozzarella.',
    recipe: [['masa', 1, 'unidad'], ['queso', 180, 'g'], ['salsa', 80, 'g'], ['jamon', 70, 'g'], ['pina', 60, 'g'], ['caja', 1, 'unidad']],
  },
  {
    key: 'jamonqueso', name: 'Pizza de jamón y queso', category: 'Pizzas', type: 'preparado', weight: 15,
    description: 'La clásica de la casa.',
    recipe: [['masa', 1, 'unidad'], ['queso', 220, 'g'], ['salsa', 80, 'g'], ['jamon', 90, 'g'], ['caja', 1, 'unidad']],
  },
  {
    key: 'pollo', name: 'Pizza de pollo', category: 'Pizzas', type: 'preparado', weight: 13,
    description: 'Pollo desmechado con champiñones.',
    recipe: [['masa', 1, 'unidad'], ['queso', 180, 'g'], ['salsa', 70, 'g'], ['pollo', 90, 'g'], ['champi', 40, 'g'], ['caja', 1, 'unidad']],
  },
  {
    key: 'especial', name: 'Pizza especial Diana', category: 'Pizzas', type: 'preparado', weight: 9,
    description: 'Pepperoni, jamón, pollo, champiñones, pimentón y cebolla.',
    recipe: [
      ['masa', 1, 'unidad'], ['queso', 220, 'g'], ['salsa', 90, 'g'], ['pepperoni', 40, 'g'], ['jamon', 40, 'g'], ['pollo', 40, 'g'],
      ['champi', 30, 'g'], ['pimenton', 25, 'g'], ['cebolla', 25, 'g'], ['caja', 1, 'unidad'],
    ],
  },
  { key: 'gaseosa', name: 'Gaseosa 400 ml', category: 'Bebidas', type: 'directo', weight: 22, description: '', recipe: [['gaseosa', 1, 'unidad']] },
  { key: 'agua', name: 'Agua embotellada', category: 'Bebidas', type: 'directo', weight: 8, description: '', recipe: [['agua', 1, 'unidad']] },
];

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
    const rand = rng(20261013);
    const today = localDate(now);
    const DAYS = 35;
    const start = addDays(today, -DAYS);
    const t0 = bogota(start, 8, 0);

    const laura = getUser(db, insertDemoUser(db, 'laura.demo', 'Laura (DEMO)', 'empleado'));
    const carlos = getUser(db, insertDemoUser(db, 'carlos.demo', 'Carlos (DEMO)', 'empleado'));
    const sellers = [laura, laura, carlos, admin];

    const itemId: Record<string, number> = {};
    for (const it of ITEMS) {
      itemId[it.key] = createItem(db, admin, { name: it.name, category: it.category, unit: it.unit, qty: it.qty, min: it.min }, { at: t0 }).id;
    }
    const productId: Record<string, number> = {};
    for (const p of PRODUCTS) {
      productId[p.key] = createProduct(db, {
        name: p.name,
        category: p.category,
        type: p.type,
        description: p.description,
        recipe: p.recipe.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })),
      }).id;
    }
    // Las fechas de creación de los productos también quedan en el pasado.
    db.prepare('UPDATE products SET created_at = ?, updated_at = ? WHERE is_demo = 1').run(t0, t0);

    const totalWeight = PRODUCTS.reduce((s, p) => s + p.weight, 0);
    const pick = () => {
      let r = rand() * totalWeight;
      for (const p of PRODUCTS) if ((r -= p.weight) < 0) return p.key;
      return PRODUCTS[0].key;
    };

    let seq = 0;
    const saleIds: string[] = [];
    for (let i = 0; i <= DAYS; i++) {
      const day = addDays(start, i);
      const dow = new Date(day + 'T00:00:00Z').getUTCDay();
      // Lunes: compra semanal al proveedor para reponer.
      if (dow === 1 && i > 0) {
        for (const it of ITEMS) {
          const cur = getItem(db, itemId[it.key]);
          const target = it.unit === 'kg' ? it.qty * 1_000_000 : it.qty * 1000;
          if (cur.qty_m < target * 0.7) {
            const missing = (target - cur.qty_m) / (it.unit === 'kg' ? 1_000_000 : 1000);
            registerEntry(db, admin, cur.id, { qty: Math.ceil(missing), unit: it.unit, reason: 'Compra semanal a proveedor (DEMO)' }, { at: bogota(day, 9, 0) });
          }
        }
      }
      const weekend = dow === 5 || dow === 6 || dow === 0;
      const count = Math.round((weekend ? 11 : 6) + rand() * (weekend ? 7 : 5) + i * 0.08);
      const times = Array.from({ length: count }, () => 11 * 60 + Math.floor(rand() * 11 * 60)).sort((a, b) => a - b);
      for (const minute of times) {
        const at = bogota(day, Math.floor(minute / 60), minute % 60);
        if (new Date(at) > now) break;
        const lines = new Map<string, number>();
        const nLines = rand() < 0.55 ? 1 : rand() < 0.8 ? 2 : 3;
        for (let k = 0; k < nLines; k++) {
          const key = pick();
          lines.set(key, (lines.get(key) ?? 0) + (rand() < 0.75 ? 1 : 2));
        }
        const items = [...lines].map(([k, qty]) => ({ productId: productId[k], qty }));
        // Si algo no alcanza, se registra una compra urgente justo antes (también DEMO).
        const pv = previewSale(db, { items });
        for (const s of pv.shortages) {
          const it = getItem(db, s.item_id);
          const factor = it.base_unit === 'unidad' ? 1000 : 1_000_000;
          const unit: Unit = it.base_unit === 'unidad' ? 'unidad' : it.base_unit === 'g' ? 'kg' : 'l';
          registerEntry(db, admin, it.id, { qty: Math.ceil(s.short_m / factor) + 5, unit, reason: 'Compra urgente (DEMO)' }, { at });
        }
        const seller = sellers[Math.floor(rand() * sellers.length)];
        const res = registerSale(db, seller, { requestId: `demo-${++seq}-${day}`, items }, { at, isDemo: true });
        saleIds.push(res.sale.id);
      }
    }

    // Un par de ventas anuladas para que se vea el flujo de auditoría.
    for (const idx of [Math.floor(saleIds.length * 0.4), Math.floor(saleIds.length * 0.8)]) {
      const id = saleIds[idx];
      if (!id) continue;
      const created = (db.prepare('SELECT created_at FROM sales WHERE id = ?').get(id) as { created_at: string }).created_at;
      annulSale(db, admin, id, { reason: 'Registrada por error (DEMO)' }, { at: new Date(new Date(created).getTime() + 10 * 60_000).toISOString() });
    }

    // Conteo físico final: deja algunos artículos en alerta para la demostración.
    const at = new Date(now.getTime() - 60_000).toISOString();
    registerAdjustment(db, admin, itemId.pepperoni, { mode: 'set', value: 0.9, unit: 'kg', reason: 'Conteo físico: merma por vencimiento (DEMO)' }, { at });
    registerAdjustment(db, admin, itemId.champi, { mode: 'set', value: 0.6, unit: 'kg', reason: 'Conteo físico (DEMO)' }, { at });
    registerAdjustment(db, admin, itemId.agua, { mode: 'set', value: 0, unit: 'unidad', reason: 'Conteo físico: sin existencias (DEMO)' }, { at });

    return demoStatus(db);
  });
}

/** Borra TODO lo marcado como DEMO y sale del modo demostración. */
export function clearDemo(db: DB) {
  return tx(db, () => {
    db.exec(`
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
