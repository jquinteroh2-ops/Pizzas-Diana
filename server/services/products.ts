import { type DB, nowIso, tx, isDemoMode, mapAsync } from '../db.ts';
import { bad, conflict, notFound, num, oneOf, optStr, str } from '../errors.ts';
import { compatible, isUnit, toMilli, type BaseUnit, type Unit } from '../../shared/units.ts';

export const PRODUCT_CATEGORIES = ['Pizzas', 'Hamburguesas', 'Perros', 'Salchipapas', 'Picadas', 'Asados', 'Pollo', 'Bebidas', 'Adicionales', 'Entradas', 'Postres', 'Otros'] as const;
export type ProductType = 'preparado' | 'directo';

export interface RecipeLine {
  item_id: number;
  item_name: string;
  base_unit: BaseUnit;
  item_unit: Unit;
  item_active: boolean;
  unit: Unit; // unidad en la que se escribió la receta
  qty_m: number; // milésimas de la unidad base, por cada unidad vendida
}

export interface Product {
  id: number;
  name: string;
  category: string;
  description: string;
  type: ProductType;
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  recipe: RecipeLine[];
  /** Avisos de configuración, p. ej. "sin receta". Si hay alguno no se puede vender. */
  warnings: string[];
}

interface ProductRow {
  id: number;
  name: string;
  category: string;
  description: string;
  type: ProductType;
  active: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

async function recipeOf(db: DB, productId: number): Promise<RecipeLine[]> {
  const rows = await db
    .prepare(
      `SELECT r.item_id, i.name item_name, i.base_unit, i.unit item_unit, i.active item_active, r.unit, r.qty_m
       FROM recipe_lines r JOIN items i ON i.id = r.item_id WHERE r.product_id = ? ORDER BY lower(i.name)`,
    )
    .all(productId) as unknown as (Omit<RecipeLine, 'item_active'> & { item_active: number })[];
  return rows.map((r) => ({ ...r, item_active: !!r.item_active }));
}

async function toProduct(db: DB, r: ProductRow): Promise<Product> {
  const recipe = await recipeOf(db, r.id);
  const warnings: string[] = [];
  if (recipe.length === 0) {
    warnings.push(r.type === 'directo' ? 'No está enlazado a un artículo de inventario.' : 'No tiene receta configurada.');
  }
  for (const l of recipe) if (!l.item_active) warnings.push(`Usa "${l.item_name}", que está desactivado en inventario.`);
  return { ...r, active: !!r.active, is_demo: !!r.is_demo, recipe, warnings };
}

export async function listProducts(db: DB): Promise<Product[]> {
  const rows = await db.prepare('SELECT * FROM products ORDER BY active DESC, category, lower(name)').all() as unknown as ProductRow[];
  return await mapAsync(rows, async (r) => await toProduct(db, r));
}

export async function getProduct(db: DB, id: number): Promise<Product> {
  const r = await db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
  if (!r) throw notFound('Producto no encontrado.');
  return await toProduct(db, r);
}

interface LineInput {
  itemId: number;
  qtyM: number;
  unit: Unit;
}

async function validRecipe(db: DB, raw: unknown, type: ProductType): Promise<LineInput[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw bad('La receta no es válida.');
  const seen = new Set<number>();
  const lines: LineInput[] = [];
  for (const l of raw as Record<string, unknown>[]) {
    const itemId = Number(l?.item_id);
    const item = await db.prepare('SELECT id, name, unit, active FROM items WHERE id = ?').get(itemId) as
      | { id: number; name: string; unit: Unit; active: number }
      | undefined;
    if (!item) throw bad('Un ingrediente de la receta no existe en el inventario.');
    if (!item.active) throw bad(`"${item.name}" está desactivado en inventario.`);
    if (seen.has(itemId)) throw bad(`"${item.name}" está repetido en la receta. Suma las cantidades en una sola línea.`);
    seen.add(itemId);
    if (!isUnit(l.unit)) throw bad(`Unidad no válida para "${item.name}".`);
    if (!compatible(l.unit, item.unit)) throw bad(`La unidad ${l.unit} no es compatible con "${item.name}" (${item.unit}).`);
    const qty = num(l.qty, `cantidad de ${item.name}`, { allowZero: false, max: 1e6 });
    const qtyM = toMilli(qty, l.unit);
    if (qtyM <= 0) throw bad(`La cantidad de "${item.name}" es demasiado pequeña.`);
    lines.push({ itemId, qtyM, unit: l.unit });
  }
  if (type === 'directo' && lines.length > 1) throw bad('Un producto de venta directa se enlaza a un solo artículo de inventario.');
  return lines;
}

async function saveRecipe(db: DB, productId: number, lines: LineInput[]) {
  await db.prepare('DELETE FROM recipe_lines WHERE product_id = ?').run(productId);
  const ins = db.prepare('INSERT INTO recipe_lines(product_id, item_id, qty_m, unit) VALUES (?,?,?,?)');
  for (const l of lines) await ins.run(productId, l.itemId, l.qtyM, l.unit);
}

export async function createProduct(db: DB, body: Record<string, unknown>): Promise<Product> {
  const name = str(body.name, 'nombre', { max: 80 });
  const category = str(body.category, 'categoría', { max: 40 });
  const description = optStr(body.description, 'descripción', 300);
  const type = oneOf(body.type, 'tipo de producto', ['preparado', 'directo'] as const);
  const lines = await validRecipe(db, body.recipe, type);
  if (await db.prepare('SELECT 1 FROM products WHERE lower(name) = lower(?) AND active = 1').get(name)) {
    throw conflict(`Ya existe un producto activo llamado "${name}".`);
  }
  return await tx(db, async () => {
    const now = nowIso();
    const r = await db
      .prepare('INSERT INTO products(name, category, description, type, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(name, category, description, type, await isDemoMode(db) ? 1 : 0, now, now);
    const id = Number(r.lastInsertRowid);
    await saveRecipe(db, id, lines);
    return await getProduct(db, id);
  });
}

/**
 * Editar un producto o su receta. Las ventas anteriores no cambian porque cada
 * venta guarda su propia copia de las cantidades aplicadas.
 */
export async function updateProduct(db: DB, id: number, body: Record<string, unknown>): Promise<Product> {
  const p = await getProduct(db, id);
  const name = body.name === undefined ? p.name : str(body.name, 'nombre', { max: 80 });
  const category = body.category === undefined ? p.category : str(body.category, 'categoría', { max: 40 });
  const description = body.description === undefined ? p.description : optStr(body.description, 'descripción', 300);
  const type = body.type === undefined ? p.type : oneOf(body.type, 'tipo de producto', ['preparado', 'directo'] as const);
  const lines = body.recipe === undefined ? null : await validRecipe(db, body.recipe, type);
  if (await db.prepare('SELECT 1 FROM products WHERE lower(name) = lower(?) AND active = 1 AND id <> ?').get(name, id)) {
    throw conflict(`Ya existe un producto activo llamado "${name}".`);
  }
  return await tx(db, async () => {
    await db.prepare('UPDATE products SET name=?, category=?, description=?, type=?, updated_at=? WHERE id=?').run(
      name,
      category,
      description,
      type,
      nowIso(),
      id,
    );
    if (lines) await saveRecipe(db, id, lines);
    return await getProduct(db, id);
  });
}

export async function setProductActive(db: DB, id: number, active: boolean): Promise<Product> {
  await getProduct(db, id);
  await db.prepare('UPDATE products SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), id);
  return await getProduct(db, id);
}
