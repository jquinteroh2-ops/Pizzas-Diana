// Motor de datos en navegador para demostraciones estáticas (ej. GitHub Pages).
// Mantiene el estado en localStorage y replica exactamente la lógica del backend
// (descuentos proporcionales de recetas, movimientos, auditoría, reportes y gráficos).
import {
  type Item,
  type Product,
  type Sale,
  type SaleDetail,
  type SalePreview,
  type Movement,
  type User,
  type Session,
  type Dashboard,
  type Charts,
  type PeriodReport,
  type DemoStatus,
  type RecipeLine,
} from './types';
import {
  stockStatus,
  toMilli,
  baseOf,
  niceUnit,
  type Unit,
} from '../../shared/units.ts';
import {
  localDate,
  addDays,
  weekStart,
  weekEnd,
  monthStart,
  monthEnd,
  prevMonthStart,
  daysBetween,
} from '../../shared/dates.ts';
import { ApiError } from './api';

const STORAGE_KEY = 'pizza_diana_client_db_v2';

interface State {
  users: User[];
  currentUser: User | null;
  items: Item[];
  products: Product[];
  sales: SaleDetail[];
  movements: Movement[];
  demoMode: boolean;
  seq: { item: number; product: number; user: number; mov: number };
}

function initialDemoState(): State {
  const now = new Date().toISOString();
  const today = localDate();

  const admin: User = {
    id: 1,
    username: 'diana',
    name: 'Diana Pérez',
    role: 'admin',
    perms: ['entradas', 'reportes', 'historial_completo'],
    active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
  };

  const empleado: User = {
    id: 2,
    username: 'pedro',
    name: 'Pedro Gómez',
    role: 'empleado',
    perms: [],
    active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
  };

  const rawItems: { id: number; name: string; category: string; unit: Unit; qty: number; min: number }[] = [
    { id: 1, name: 'Masa preparada', category: 'Productos preparados', unit: 'unidad', qty: 95, min: 25 },
    { id: 2, name: 'Queso mozzarella', category: 'Ingredientes', unit: 'kg', qty: 22.5, min: 6 },
    { id: 3, name: 'Salsa de tomate', category: 'Ingredientes', unit: 'kg', qty: 11.2, min: 3 },
    { id: 4, name: 'Pepperoni', category: 'Ingredientes', unit: 'kg', qty: 5.4, min: 1.5 },
    { id: 5, name: 'Jamón', category: 'Ingredientes', unit: 'kg', qty: 6.8, min: 1.5 },
    { id: 6, name: 'Piña en cubos', category: 'Ingredientes', unit: 'kg', qty: 4.1, min: 1 },
    { id: 7, name: 'Pollo desmechado', category: 'Ingredientes', unit: 'kg', qty: 4.9, min: 1.5 },
    { id: 8, name: 'Champiñones', category: 'Ingredientes', unit: 'kg', qty: 3.2, min: 1 },
    { id: 9, name: 'Pimentón', category: 'Ingredientes', unit: 'kg', qty: 2.5, min: 0.6 },
    { id: 10, name: 'Cebolla', category: 'Ingredientes', unit: 'kg', qty: 2.3, min: 0.6 },
    { id: 11, name: 'Orégano', category: 'Ingredientes', unit: 'g', qty: 420, min: 100 },
    { id: 12, name: 'Caja para pizza', category: 'Empaques', unit: 'unidad', qty: 110, min: 30 },
    { id: 13, name: 'Gaseosa 400 ml', category: 'Bebidas', unit: 'unidad', qty: 82, min: 24 },
    { id: 14, name: 'Agua embotellada 600 ml', category: 'Bebidas', unit: 'unidad', qty: 38, min: 12 },
    { id: 15, name: 'Servilletas', category: 'Otros', unit: 'unidad', qty: 850, min: 200 },
  ];

  const items: Item[] = rawItems.map((r) => {
    const qty_m = toMilli(r.qty, r.unit);
    const min_m = toMilli(r.min, r.unit);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      base_unit: baseOf(r.unit),
      unit: r.unit,
      qty_m,
      min_m,
      status: stockStatus(qty_m, min_m),
      active: true,
      is_demo: true,
      created_at: now,
      updated_at: now,
    };
  });

  const rawProducts: { id: number; name: string; category: string; type: 'preparado' | 'directo'; desc: string; recipe: [number, number, Unit][] }[] = [
    {
      id: 1,
      name: 'Pizza de pepperoni',
      category: 'Pizzas',
      type: 'preparado',
      desc: 'Mozzarella, salsa de la casa y pepperoni.',
      recipe: [
        [1, 1, 'unidad'],
        [2, 200, 'g'],
        [3, 80, 'g'],
        [4, 60, 'g'],
        [11, 2, 'g'],
        [12, 1, 'unidad'],
      ],
    },
    {
      id: 2,
      name: 'Pizza hawaiana',
      category: 'Pizzas',
      type: 'preparado',
      desc: 'Jamón, piña y mozzarella.',
      recipe: [
        [1, 1, 'unidad'],
        [2, 180, 'g'],
        [3, 80, 'g'],
        [5, 70, 'g'],
        [6, 60, 'g'],
        [12, 1, 'unidad'],
      ],
    },
    {
      id: 3,
      name: 'Pizza de jamón y queso',
      category: 'Pizzas',
      type: 'preparado',
      desc: 'La clásica de la casa con extra de jamón.',
      recipe: [
        [1, 1, 'unidad'],
        [2, 220, 'g'],
        [3, 80, 'g'],
        [5, 90, 'g'],
        [12, 1, 'unidad'],
      ],
    },
    {
      id: 4,
      name: 'Pizza de pollo y champiñones',
      category: 'Pizzas',
      type: 'preparado',
      desc: 'Pollo desmechado con champiñones frescos.',
      recipe: [
        [1, 1, 'unidad'],
        [2, 180, 'g'],
        [3, 70, 'g'],
        [7, 90, 'g'],
        [8, 40, 'g'],
        [12, 1, 'unidad'],
      ],
    },
    {
      id: 5,
      name: 'Pizza especial Diana',
      category: 'Pizzas',
      type: 'preparado',
      desc: 'Pepperoni, jamón, pollo, champiñones, pimentón y cebolla.',
      recipe: [
        [1, 1, 'unidad'],
        [2, 220, 'g'],
        [3, 90, 'g'],
        [4, 40, 'g'],
        [5, 40, 'g'],
        [7, 40, 'g'],
        [8, 30, 'g'],
        [9, 25, 'g'],
        [10, 25, 'g'],
        [12, 1, 'unidad'],
      ],
    },
    {
      id: 6,
      name: 'Gaseosa 400 ml',
      category: 'Bebidas',
      type: 'directo',
      desc: 'Bebida gaseosa en botella individual.',
      recipe: [[13, 1, 'unidad']],
    },
    {
      id: 7,
      name: 'Agua mineral 600 ml',
      category: 'Bebidas',
      type: 'directo',
      desc: 'Agua mineral sin gas.',
      recipe: [[14, 1, 'unidad']],
    },
  ];

  const products: Product[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.desc,
    type: p.type,
    active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
    recipe: p.recipe.map(([itemId, qty, unit]) => {
      const it = items.find((i) => i.id === itemId)!;
      return {
        item_id: it.id,
        item_name: it.name,
        base_unit: it.base_unit,
        item_unit: it.unit,
        item_active: it.active,
        unit,
        qty_m: toMilli(qty, unit),
      };
    }),
    warnings: [],
  }));

  // Generar historial de ventas realistas durante los últimos 28 días
  const sales: SaleDetail[] = [];
  const movements: Movement[] = items.map((it, idx) => ({
    id: idx + 1,
    item_id: it.id,
    item_name: it.name,
    base_unit: it.base_unit,
    unit: it.unit,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    type: 'inicial',
    delta_m: it.qty_m,
    after_m: it.qty_m,
    reason: 'Existencia inicial de demostración',
    user_name: admin.name,
    sale_id: null,
    is_demo: 1,
  }));

  let movSeq = movements.length + 1;
  let saleNum = 1000;

  for (let d = -27; d <= 0; d++) {
    const curDate = addDays(today, d);
    const count = d === 0 ? 5 : 3 + Math.abs((d * 7) % 6);
    for (let s = 0; s < count; s++) {
      saleNum++;
      const prodIdx = (saleNum + s) % products.length;
      const pr = products[prodIdx];
      const qty = 1 + (saleNum % 3);
      const saleId = `V-${saleNum}`;
      const saleIso = new Date(`${curDate}T${12 + (s % 9)}:${10 + s * 5}:00-05:00`).toISOString();

      const consumption = pr.recipe.map((r) => ({
        product_id: pr.id,
        product_name: pr.name,
        item_id: r.item_id,
        item_name: r.item_name,
        base_unit: r.base_unit,
        per_unit_m: r.qty_m,
        total_m: r.qty_m * qty,
      }));

      sales.push({
        id: saleId,
        created_at: saleIso,
        local_date: curDate,
        total_units: qty,
        status: 'confirmada',
        user_id: admin.id,
        user_name: admin.name,
        annulled_by_name: null,
        annulled_at: null,
        annul_reason: null,
        is_demo: 1,
        items: [{ product_id: pr.id, product_name: pr.name, qty }],
        consumption,
      });

      for (const c of consumption) {
        movements.push({
          id: movSeq++,
          item_id: c.item_id,
          item_name: c.item_name,
          base_unit: c.base_unit,
          unit: niceUnit(c.total_m, c.base_unit),
          created_at: saleIso,
          type: 'venta',
          delta_m: -c.total_m,
          after_m: 0,
          reason: `Venta ${saleId}`,
          user_name: admin.name,
          sale_id: saleId,
          is_demo: 1,
        });
      }
    }
  }

  return {
    users: [admin, empleado],
    currentUser: admin,
    items,
    products,
    sales: sales.reverse(),
    movements: movements.reverse(),
    demoMode: true,
    seq: { item: items.length + 1, product: products.length + 1, user: 3, mov: movSeq },
  };
}

class BrowserDB {
  private state: State;

  constructor() {
    this.state = this.load();
  }

  private load(): State {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // Ignorar error de JSON/storage
    }
    const fresh = initialDemoState();
    this.saveState(fresh);
    return fresh;
  }

  private save(): void {
    this.saveState(this.state);
  }

  private saveState(s: State): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Ignorar error de cuota
    }
  }

  resetDemo(): void {
    this.state = initialDemoState();
    this.save();
  }

  clearDemo(): void {
    const admin = this.state.users.find((u) => u.role === 'admin') || this.state.currentUser;
    this.state = {
      users: admin ? [admin] : [],
      currentUser: admin,
      items: [],
      products: [],
      sales: [],
      movements: [],
      demoMode: false,
      seq: { item: 1, product: 1, user: 2, mov: 1 },
    };
    this.save();
  }

  // --- Handlers ---

  session(): Session {
    return {
      user: this.state.currentUser,
      needsSetup: !this.state.users.some((u) => u.role === 'admin'),
      demoMode: this.state.demoMode,
      today: localDate(),
    };
  }

  setup(body: { username: string; name: string }): { user: User } {
    const u: User = {
      id: this.state.seq.user++,
      username: body.username,
      name: body.name,
      role: 'admin',
      perms: ['entradas', 'reportes', 'historial_completo'],
      active: true,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.state.users.push(u);
    this.state.currentUser = u;
    this.save();
    return { user: u };
  }

  login(body: { username: string }): { user: User } {
    const u = this.state.users.find((x) => x.username.toLowerCase() === body.username.toLowerCase() && x.active);
    if (!u) throw new ApiError(401, 'Usuario o contraseña incorrectos.');
    this.state.currentUser = u;
    this.save();
    return { user: u };
  }

  logout(): { ok: boolean } {
    this.state.currentUser = null;
    this.save();
    return { ok: true };
  }

  listItems(): Item[] {
    return this.state.items.map((i) => ({
      ...i,
      status: stockStatus(i.qty_m, i.min_m),
    }));
  }

  createItem(body: { name: string; category: string; unit: Unit; qty: number; min: number }): Item {
    const base = baseOf(body.unit);
    const qty_m = toMilli(body.qty, body.unit);
    const min_m = toMilli(body.min, body.unit);
    const it: Item = {
      id: this.state.seq.item++,
      name: body.name.trim(),
      category: body.category,
      base_unit: base,
      unit: body.unit,
      qty_m,
      min_m,
      status: stockStatus(qty_m, min_m),
      active: true,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.state.items.push(it);

    this.state.movements.unshift({
      id: this.state.seq.mov++,
      item_id: it.id,
      item_name: it.name,
      base_unit: it.base_unit,
      unit: it.unit,
      created_at: it.created_at,
      type: 'inicial',
      delta_m: it.qty_m,
      after_m: it.qty_m,
      reason: 'Existencia inicial',
      user_name: this.state.currentUser?.name || 'Admin',
      sale_id: null,
      is_demo: 0,
    });
    this.save();
    return it;
  }

  updateItem(id: number, body: { name: string; category: string; unit: Unit; min: number }): Item {
    const it = this.state.items.find((i) => i.id === id);
    if (!it) throw new ApiError(404, 'Artículo no encontrado.');
    it.name = body.name.trim();
    it.category = body.category;
    it.unit = body.unit;
    it.min_m = toMilli(body.min, body.unit);
    it.status = stockStatus(it.qty_m, it.min_m);
    it.updated_at = new Date().toISOString();
    this.save();
    return it;
  }

  setItemActive(id: number, active: boolean): { ok: boolean } {
    const it = this.state.items.find((i) => i.id === id);
    if (!it) throw new ApiError(404, 'Artículo no encontrado.');
    it.active = active;
    this.save();
    return { ok: true };
  }

  registerEntry(id: number, body: { qty: number; unit: Unit; reason?: string }): Item {
    const it = this.state.items.find((i) => i.id === id);
    if (!it) throw new ApiError(404, 'Artículo no encontrado.');
    const delta = toMilli(body.qty, body.unit);
    it.qty_m += delta;
    it.status = stockStatus(it.qty_m, it.min_m);
    it.updated_at = new Date().toISOString();

    this.state.movements.unshift({
      id: this.state.seq.mov++,
      item_id: it.id,
      item_name: it.name,
      base_unit: it.base_unit,
      unit: body.unit,
      created_at: it.updated_at,
      type: 'entrada',
      delta_m: delta,
      after_m: it.qty_m,
      reason: body.reason || 'Entrada de mercancía',
      user_name: this.state.currentUser?.name || 'Admin',
      sale_id: null,
      is_demo: 0,
    });
    this.save();
    return it;
  }

  registerAdjust(id: number, body: { mode: 'set' | 'add' | 'sub'; value: number; unit: Unit; reason?: string }): Item {
    const it = this.state.items.find((i) => i.id === id);
    if (!it) throw new ApiError(404, 'Artículo no encontrado.');
    const v = toMilli(body.value, body.unit);
    const before = it.qty_m;
    let delta = 0;
    if (body.mode === 'set') {
      delta = v - before;
      it.qty_m = v;
    } else if (body.mode === 'add') {
      delta = v;
      it.qty_m += v;
    } else {
      delta = -v;
      it.qty_m = Math.max(0, it.qty_m - v);
    }
    it.status = stockStatus(it.qty_m, it.min_m);
    it.updated_at = new Date().toISOString();

    this.state.movements.unshift({
      id: this.state.seq.mov++,
      item_id: it.id,
      item_name: it.name,
      base_unit: it.base_unit,
      unit: body.unit,
      created_at: it.updated_at,
      type: 'ajuste',
      delta_m: delta,
      after_m: it.qty_m,
      reason: body.reason || 'Ajuste manual',
      user_name: this.state.currentUser?.name || 'Admin',
      sale_id: null,
      is_demo: 0,
    });
    this.save();
    return it;
  }

  listMovements(q: { itemId?: number; type?: string; limit?: number }): Movement[] {
    let list = this.state.movements;
    if (q.itemId) list = list.filter((m) => m.item_id === q.itemId);
    if (q.type) list = list.filter((m) => m.type === q.type);
    if (q.limit) list = list.slice(0, q.limit);
    return list;
  }

  listProducts(): Product[] {
    return this.state.products;
  }

  createProduct(body: { name: string; category: string; description?: string; type: 'preparado' | 'directo'; recipe: { item_id: number; qty: number; unit: Unit }[] }): Product {
    const lines: RecipeLine[] = (body.recipe || []).map((r) => {
      const it = this.state.items.find((i) => i.id === r.item_id)!;
      return {
        item_id: it.id,
        item_name: it.name,
        base_unit: it.base_unit,
        item_unit: it.unit,
        item_active: it.active,
        unit: r.unit,
        qty_m: toMilli(r.qty, r.unit),
      };
    });
    const p: Product = {
      id: this.state.seq.product++,
      name: body.name.trim(),
      category: body.category,
      description: body.description || '',
      type: body.type,
      active: true,
      is_demo: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      recipe: lines,
      warnings: lines.length === 0 ? ['Este producto no tiene ingredientes configurados en su receta.'] : [],
    };
    this.state.products.push(p);
    this.save();
    return p;
  }

  updateProduct(id: number, body: { name: string; category: string; description?: string; type: 'preparado' | 'directo'; recipe: { item_id: number; qty: number; unit: Unit }[] }): Product {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) throw new ApiError(404, 'Producto no encontrado.');
    p.name = body.name.trim();
    p.category = body.category;
    p.description = body.description || '';
    p.type = body.type;
    p.updated_at = new Date().toISOString();
    p.recipe = (body.recipe || []).map((r) => {
      const it = this.state.items.find((i) => i.id === r.item_id)!;
      return {
        item_id: it.id,
        item_name: it.name,
        base_unit: it.base_unit,
        item_unit: it.unit,
        item_active: it.active,
        unit: r.unit,
        qty_m: toMilli(r.qty, r.unit),
      };
    });
    this.save();
    return p;
  }

  setProductActive(id: number, active: boolean): { ok: boolean } {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) throw new ApiError(404, 'Producto no encontrado.');
    p.active = active;
    this.save();
    return { ok: true };
  }

  previewSale(body: { items: { productId: number; qty: number }[] }): SalePreview {
    const neededMap = new Map<number, number>();
    let totalUnits = 0;

    for (const line of body.items) {
      const p = this.state.products.find((x) => x.id === line.productId);
      if (!p) continue;
      totalUnits += line.qty;
      for (const r of p.recipe) {
        neededMap.set(r.item_id, (neededMap.get(r.item_id) || 0) + r.qty_m * line.qty);
      }
    }

    const requirements = Array.from(neededMap.entries()).map(([itemId, needed_m]) => {
      const it = this.state.items.find((i) => i.id === itemId)!;
      const available_m = it ? it.qty_m : 0;
      const after_m = available_m - needed_m;
      const short_m = after_m < 0 ? Math.abs(after_m) : 0;
      return {
        item_id: itemId,
        item_name: it?.name || 'Desconocido',
        base_unit: it?.base_unit || 'unidad',
        unit: it?.unit || 'unidad',
        needed_m,
        available_m,
        after_m,
        short_m,
      };
    });

    const shortages = requirements.filter((r) => r.short_m > 0);
    return {
      items: body.items.map((b) => ({
        productId: b.productId,
        name: this.state.products.find((p) => p.id === b.productId)?.name || '',
        qty: b.qty,
      })),
      requirements,
      totalUnits,
      ok: shortages.length === 0,
      shortages,
    };
  }

  registerSale(body: { items: { productId: number; qty: number }[]; requestId?: string }): { sale: Sale; duplicate: boolean } {
    const prev = this.previewSale(body);
    if (!prev.ok) {
      throw new ApiError(409, 'No hay suficientes ingredientes para registrar esta venta.', { shortages: prev.shortages });
    }

    const saleId = `V-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();
    const today = localDate();

    // Descontar existencias y generar movimientos
    const consumption: SaleDetail['consumption'] = [];
    for (const req of prev.requirements) {
      const it = this.state.items.find((i) => i.id === req.item_id)!;
      it.qty_m -= req.needed_m;
      it.status = stockStatus(it.qty_m, it.min_m);
      it.updated_at = nowIso;

      this.state.movements.unshift({
        id: this.state.seq.mov++,
        item_id: it.id,
        item_name: it.name,
        base_unit: it.base_unit,
        unit: niceUnit(req.needed_m, it.base_unit),
        created_at: nowIso,
        type: 'venta',
        delta_m: -req.needed_m,
        after_m: it.qty_m,
        reason: `Venta ${saleId}`,
        user_name: this.state.currentUser?.name || 'Admin',
        sale_id: saleId,
        is_demo: this.state.demoMode ? 1 : 0,
      });

      consumption.push({
        product_id: 0,
        product_name: '',
        item_id: it.id,
        item_name: it.name,
        base_unit: it.base_unit,
        per_unit_m: req.needed_m,
        total_m: req.needed_m,
      });
    }

    const saleRecord: SaleDetail = {
      id: saleId,
      created_at: nowIso,
      local_date: today,
      total_units: prev.totalUnits,
      status: 'confirmada',
      user_id: this.state.currentUser?.id || 1,
      user_name: this.state.currentUser?.name || 'Admin',
      annulled_by_name: null,
      annulled_at: null,
      annul_reason: null,
      is_demo: this.state.demoMode ? 1 : 0,
      items: body.items.map((b) => ({
        product_id: b.productId,
        product_name: this.state.products.find((p) => p.id === b.productId)?.name || '',
        qty: b.qty,
      })),
      consumption,
    };

    this.state.sales.unshift(saleRecord);
    this.save();
    return { sale: saleRecord, duplicate: false };
  }

  listSales(q: { from?: string; to?: string; productId?: number; status?: string; limit?: number }): Sale[] {
    let list = this.state.sales;
    if (q.from) list = list.filter((s) => s.local_date >= q.from!);
    if (q.to) list = list.filter((s) => s.local_date <= q.to!);
    if (q.status) list = list.filter((s) => s.status === q.status);
    if (q.limit) list = list.slice(0, q.limit);
    return list;
  }

  getSale(id: string): SaleDetail {
    const s = this.state.sales.find((x) => x.id === id);
    if (!s) throw new ApiError(404, 'Venta no encontrada.');
    return s;
  }

  annulSale(id: string, body: { reason?: string }): { ok: boolean } {
    const s = this.state.sales.find((x) => x.id === id);
    if (!s) throw new ApiError(404, 'Venta no encontrada.');
    if (s.status === 'anulada') throw new ApiError(400, 'Esta venta ya fue anulada.');

    const nowIso = new Date().toISOString();
    s.status = 'anulada';
    s.annulled_by_name = this.state.currentUser?.name || 'Admin';
    s.annulled_at = nowIso;
    s.annul_reason = body.reason || 'Anulación autorizada';

    // Restituir existencias
    for (const c of s.consumption) {
      const it = this.state.items.find((i) => i.id === c.item_id);
      if (it) {
        it.qty_m += c.total_m;
        it.status = stockStatus(it.qty_m, it.min_m);
        it.updated_at = nowIso;

        this.state.movements.unshift({
          id: this.state.seq.mov++,
          item_id: it.id,
          item_name: it.name,
          base_unit: it.base_unit,
          unit: niceUnit(c.total_m, it.base_unit),
          created_at: nowIso,
          type: 'anulacion',
          delta_m: c.total_m,
          after_m: it.qty_m,
          reason: `Anulación venta ${s.id}: ${s.annul_reason}`,
          user_name: this.state.currentUser?.name || 'Admin',
          sale_id: s.id,
          is_demo: s.is_demo,
        });
      }
    }

    this.save();
    return { ok: true };
  }

  dashboard(): Dashboard {
    const today = localDate();
    const wStart = weekStart(today);
    const wEnd = weekEnd(today);
    const mStart = monthStart(today);
    const mEnd = monthEnd(today);

    const validSales = this.state.sales.filter((s) => s.status === 'confirmada');

    const unitsToday = validSales.filter((s) => s.local_date === today).reduce((sum, s) => sum + s.total_units, 0);
    const unitsWeek = validSales.filter((s) => s.local_date >= wStart && s.local_date <= wEnd).reduce((sum, s) => sum + s.total_units, 0);
    const unitsMonth = validSales.filter((s) => s.local_date >= mStart && s.local_date <= mEnd).reduce((sum, s) => sum + s.total_units, 0);

    const activeItems = this.state.items.filter((i) => i.active);
    const low = activeItems.filter((i) => i.status === 'bajo').length;
    const out = activeItems.filter((i) => i.status === 'agotado').length;

    const alerts = activeItems
      .filter((i) => i.status === 'bajo' || i.status === 'agotado')
      .map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        base_unit: i.base_unit,
        unit: i.unit,
        qty_m: i.qty_m,
        min_m: i.min_m,
        status: i.status,
      }));

    return {
      today,
      ranges: { week: { from: wStart, to: wEnd }, month: { from: mStart, to: mEnd } },
      units: { today: unitsToday, week: unitsWeek, month: unitsMonth },
      stock: { total: activeItems.length, low, out },
      recent: this.state.sales.slice(0, 6).map((s) => ({
        id: s.id,
        created_at: s.created_at,
        total_units: s.total_units,
        status: s.status,
        is_demo: s.is_demo,
        user_name: s.user_name,
        items: s.items,
      })),
      alerts,
      hasSales: this.state.sales.length > 0,
    };
  }

  charts(seriesKey: string, topKey: string): Charts {
    const today = localDate();
    let sRange = { from: addDays(today, -6), to: today };
    if (seriesKey === '30d') sRange = { from: addDays(today, -29), to: today };
    if (seriesKey === 'mes') sRange = { from: monthStart(today), to: monthEnd(today) };

    let tRange = { from: weekStart(today), to: weekEnd(today) };
    if (topKey === 'dia') tRange = { from: today, to: today };
    if (topKey === 'mes') tRange = { from: monthStart(today), to: monthEnd(today) };

    const valid = this.state.sales.filter((s) => s.status === 'confirmada');

    // Series
    const days = daysBetween(sRange.from, sRange.to);
    const seriesData = days.map((d) => {
      const match = valid.filter((s) => s.local_date === d);
      return {
        date: d,
        units: match.reduce((sum, s) => sum + s.total_units, 0),
        sales: match.length,
      };
    });

    // Top
    const prodUnits = new Map<number, number>();
    for (const s of valid) {
      if (s.local_date >= tRange.from && s.local_date <= tRange.to) {
        for (const item of s.items) {
          prodUnits.set(item.product_id, (prodUnits.get(item.product_id) || 0) + item.qty);
        }
      }
    }
    const topData = Array.from(prodUnits.entries())
      .map(([pid, units]) => ({
        product_id: pid,
        name: this.state.products.find((p) => p.id === pid)?.name || 'Producto',
        units,
      }))
      .sort((a, b) => b.units - a.units);

    return {
      series: { range: sRange, data: seriesData },
      top: { range: tRange, data: topData },
    };
  }

  reports(period: 'dia' | 'semana' | 'mes', date: string): PeriodReport {
    let range = { from: date, to: date };
    let prev = { from: addDays(date, -1), to: addDays(date, -1) };

    if (period === 'semana') {
      range = { from: weekStart(date), to: weekEnd(date) };
      prev = { from: addDays(range.from, -7), to: addDays(range.to, -7) };
    } else if (period === 'mes') {
      range = { from: monthStart(date), to: monthEnd(date) };
      const pStart = prevMonthStart(date);
      prev = { from: pStart, to: monthEnd(pStart) };
    }

    const currentSales = this.state.sales.filter((s) => s.local_date >= range.from && s.local_date <= range.to);
    const confirmed = currentSales.filter((s) => s.status === 'confirmada');
    const prevConfirmed = this.state.sales.filter((s) => s.status === 'confirmada' && s.local_date >= prev.from && s.local_date <= prev.to);

    const total = confirmed.reduce((sum, s) => sum + s.total_units, 0);
    const prevTotal = prevConfirmed.reduce((sum, s) => sum + s.total_units, 0);

    const byProductMap = new Map<number, number>();
    for (const s of confirmed) {
      for (const i of s.items) byProductMap.set(i.product_id, (byProductMap.get(i.product_id) || 0) + i.qty);
    }
    const byProduct = Array.from(byProductMap.entries())
      .map(([product_id, units]) => ({
        product_id,
        name: this.state.products.find((p) => p.id === product_id)?.name || '',
        units,
      }))
      .sort((a, b) => b.units - a.units);

    // Consumption
    const consMap = new Map<number, number>();
    for (const s of confirmed) {
      for (const c of s.consumption) consMap.set(c.item_id, (consMap.get(c.item_id) || 0) + c.total_m);
    }
    const consumption = Array.from(consMap.entries()).map(([item_id, total_m]) => {
      const it = this.state.items.find((i) => i.id === item_id)!;
      return {
        item_id,
        name: it?.name || 'Insumo',
        base_unit: it?.base_unit || 'unidad',
        unit: niceUnit(total_m, it?.base_unit || 'unidad'),
        total_m,
      };
    });

    // Evolution
    const days = daysBetween(range.from, range.to);
    const evolution = days.map((d) => ({
      label: d,
      from: d,
      to: d,
      units: confirmed.filter((s) => s.local_date === d).reduce((sum, s) => sum + s.total_units, 0),
    }));

    return {
      period,
      range,
      prev,
      total,
      prevTotal,
      salesCount: confirmed.length,
      annulled: currentSales.filter((s) => s.status === 'anulada').length,
      byProduct,
      prevByProduct: [],
      consumption,
      evolution,
    };
  }

  demoStatus(): DemoStatus {
    const demoItems = this.state.items.filter((i) => i.is_demo).length;
    const demoProds = this.state.products.filter((p) => p.is_demo).length;
    const demoSales = this.state.sales.filter((s) => s.is_demo === 1).length;

    const realItems = this.state.items.filter((i) => !i.is_demo).length;
    const realProds = this.state.products.filter((p) => !p.is_demo).length;
    const realSales = this.state.sales.filter((s) => s.is_demo === 0).length;

    return {
      demoMode: this.state.demoMode,
      real: { items: realItems, products: realProds, sales: realSales },
      demo: { items: demoItems, products: demoProds, sales: demoSales },
    };
  }

  listUsers(): User[] {
    return this.state.users;
  }
}

export const browserDb = new BrowserDB();

export async function handleBrowserRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const [cleanPath, queryStr] = path.split('?');
  const query = new URLSearchParams(queryStr || '');

  // Session
  if (cleanPath === '/session') return browserDb.session() as T;
  if (cleanPath === '/setup') return browserDb.setup(body) as T;
  if (cleanPath === '/login') return browserDb.login(body) as T;
  if (cleanPath === '/logout') return browserDb.logout() as T;

  // Items
  if (cleanPath === '/items' && method === 'GET') return browserDb.listItems() as T;
  if (cleanPath === '/items' && method === 'POST') return browserDb.createItem(body) as T;
  const matchItemPut = cleanPath.match(/^\/items\/(\d+)$/);
  if (matchItemPut && method === 'PUT') return browserDb.updateItem(Number(matchItemPut[1]), body) as T;
  const matchItemActive = cleanPath.match(/^\/items\/(\d+)\/active$/);
  if (matchItemActive) return browserDb.setItemActive(Number(matchItemActive[1]), body.active) as T;
  const matchItemEntry = cleanPath.match(/^\/items\/(\d+)\/entry$/);
  if (matchItemEntry) return browserDb.registerEntry(Number(matchItemEntry[1]), body) as T;
  const matchItemAdjust = cleanPath.match(/^\/items\/(\d+)\/adjust$/);
  if (matchItemAdjust) return browserDb.registerAdjust(Number(matchItemAdjust[1]), body) as T;

  // Movements
  if (cleanPath === '/movements') {
    return browserDb.listMovements({
      itemId: query.get('itemId') ? Number(query.get('itemId')) : undefined,
      type: query.get('type') || undefined,
      limit: query.get('limit') ? Number(query.get('limit')) : undefined,
    }) as T;
  }

  // Products
  if (cleanPath === '/products' && method === 'GET') return browserDb.listProducts() as T;
  if (cleanPath === '/products' && method === 'POST') return browserDb.createProduct(body) as T;
  const matchProdPut = cleanPath.match(/^\/products\/(\d+)$/);
  if (matchProdPut && method === 'PUT') return browserDb.updateProduct(Number(matchProdPut[1]), body) as T;
  const matchProdActive = cleanPath.match(/^\/products\/(\d+)\/active$/);
  if (matchProdActive) return browserDb.setProductActive(Number(matchProdActive[1]), body.active) as T;

  // Sales
  if (cleanPath === '/sales/preview') return browserDb.previewSale(body) as T;
  if (cleanPath === '/sales' && method === 'POST') return browserDb.registerSale(body) as T;
  if (cleanPath === '/sales' && method === 'GET') {
    return browserDb.listSales({
      from: query.get('from') || undefined,
      to: query.get('to') || undefined,
      status: query.get('status') || undefined,
      limit: query.get('limit') ? Number(query.get('limit')) : undefined,
    }) as T;
  }
  const matchSaleGet = cleanPath.match(/^\/sales\/([^/]+)$/);
  if (matchSaleGet && method === 'GET') return browserDb.getSale(decodeURIComponent(matchSaleGet[1])) as T;
  const matchSaleAnnul = cleanPath.match(/^\/sales\/([^/]+)\/annul$/);
  if (matchSaleAnnul && method === 'POST') return browserDb.annulSale(decodeURIComponent(matchSaleAnnul[1]), body) as T;

  // Dashboard & Charts & Reports
  if (cleanPath === '/dashboard') return browserDb.dashboard() as T;
  if (cleanPath === '/charts') return browserDb.charts(query.get('series') || '7d', query.get('top') || 'semana') as T;
  if (cleanPath === '/reports') return browserDb.reports((query.get('period') as any) || 'dia', query.get('date') || localDate()) as T;

  // Users
  if (cleanPath === '/users' && method === 'GET') return browserDb.listUsers() as T;

  // Demo
  if (cleanPath === '/settings/demo') return browserDb.demoStatus() as T;
  if (cleanPath === '/settings/demo/reset') {
    browserDb.resetDemo();
    return { ok: true } as T;
  }
  if (cleanPath === '/settings/demo/clear') {
    browserDb.clearDemo();
    return { ok: true } as T;
  }
  if (cleanPath === '/settings/demo/load') {
    browserDb.resetDemo();
    return { ok: true } as T;
  }

  return { ok: true } as T;
}
