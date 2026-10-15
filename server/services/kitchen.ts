// Pantalla de cocina y carga del catálogo de Pizza Diana.
import { type DB, tx, isDemoMode } from '../db.ts';
import { conflict } from '../errors.ts';
import { localDate } from '../../shared/dates.ts';
import { CATALOG_ITEMS, CATALOG_PREPARATIONS, CATALOG_PRODUCTS } from '../../shared/catalog.ts';
import { createItem, type Item } from './inventory.ts';
import { createPreparation, listProductions } from './preparations.ts';
import { createProduct } from './products.ts';
import { listWastes } from './wastes.ts';
import { listShortages } from './shortages.ts';
import { dayCountStatus, listCounts } from './counts.ts';
import { tasksBetween } from './plan.ts';
import type { User } from './users.ts';

/** Lo que ve el cocinero al abrir el sistema: el plan de hoy y lo que ya registró. */
export function kitchenToday(db: DB, user: User) {
  const today = localDate();
  return {
    today,
    tasks: tasksBetween(db, today, today),
    productions: listProductions(db, { from: today, to: today, userId: user.id, limit: 50 }),
    wastes: listWastes(db, user, { from: today, to: today, limit: 50 }).filter((w) => w.reported_by === user.id),
    shortages: listShortages(db, { scope: 'open' }),
    counts: listCounts(db, user, { limit: 10 }).filter((c) => c.local_date === today && c.counted_by === user.id),
    dayCounts: dayCountStatus(db, today),
  };
}

/**
 * Carga los productos de las hojas de Pizza Diana con existencia 0, sus preparaciones
 * y el menú con recetas sugeridas. Lo que ya exista con el mismo nombre se deja igual.
 */
export function loadCatalog(db: DB, admin: User) {
  if (isDemoMode(db)) throw conflict('Primero sal del modo demostración (Configuración → Salir del modo demo).');
  return tx(db, () => {
    const findItem = db.prepare('SELECT id FROM items WHERE name = ? COLLATE NOCASE AND active = 1');
    const itemId: Record<string, number> = {};
    let items = 0;
    CATALOG_ITEMS.forEach((c, idx) => {
      const found = findItem.get(c.name) as { id: number } | undefined;
      if (found) {
        itemId[c.key] = found.id;
        return;
      }
      const it: Item = createItem(db, admin, {
        name: c.name,
        category: c.category,
        unit: c.unit,
        qty: 0,
        min: c.min,
        location: c.location,
        kind: c.kind,
        sort_order: (idx + 1) * 10,
      });
      itemId[c.key] = it.id;
      items++;
    });

    let preparations = 0;
    for (const p of CATALOG_PREPARATIONS) {
      if (db.prepare('SELECT 1 FROM preparations WHERE name = ? COLLATE NOCASE AND active = 1').get(p.name)) continue;
      createPreparation(db, {
        name: p.name,
        mode: p.mode,
        output_item_id: itemId[p.output],
        std_output: p.stdOutput[0],
        std_output_unit: p.stdOutput[1],
        instructions: p.instructions,
        inputs: p.inputs.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })),
      });
      preparations++;
    }

    let products = 0;
    for (const p of CATALOG_PRODUCTS) {
      if (db.prepare('SELECT 1 FROM products WHERE name = ? COLLATE NOCASE AND active = 1').get(p.name)) continue;
      createProduct(db, {
        name: p.name,
        category: p.category,
        type: p.type,
        description: p.type === 'preparado' ? `${p.description} Receta sugerida: revisar cantidades.`.trim() : p.description,
        recipe: p.recipe.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })),
      });
      products++;
    }
    return { items, preparations, products };
  });
}
