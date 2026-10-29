// Motor de datos en el navegador para la demostración estática (GitHub Pages).
// Replica la API del servidor (mismas rutas, permisos y reglas: recetas, movimientos,
// preparaciones, bajas, faltantes, conteos y plan) y guarda todo en localStorage.
// OJO: aquí cada dispositivo tiene sus propios datos. Para que cocina, caja y
// administrador compartan la información hace falta el servidor (npm start / Railway).
import type {
  Count,
  CountSheet,
  Dashboard,
  DayCountStatus,
  InventorySheet,
  Reconciliation,
  ReconciliationLine,
  DemoStatus,
  Item,
  KitchenReport,
  KitchenToday,
  Movement,
  MovementType,
  PeriodReport,
  Preparation,
  PrepTask,
  Product,
  Production,
  RecipeLine,
  Requirement,
  Sale,
  SaleDetail,
  SalePreview,
  Session,
  Shortage,
  ShoppingLine,
  User,
  Waste,
  WeekPlan,
  Charts,
} from './types';
import { baseOf, compatible, isUnit, stockStatus, toMilli, type Unit } from '../../shared/units.ts';
import {
  addDays,
  comparablePrev,
  daysBetween,
  isYmd,
  localDate,
  monthEnd,
  monthStart,
  prevMonthStart,
  weekEnd,
  weekStart,
} from '../../shared/dates.ts';
import { can, EXTRA_PERMS, ROLES, type Action, type ExtraPerm, type Role } from '../../shared/permissions.ts';
import {
  COUNT_KINDS,
  LOCATIONS,
  productionYield,
  realConsumption,
  scaleBatch,
  WASTE_REASONS,
  WASTE_REASON_LABELS,
  type CountKind,
  type CountStatus,
  type ItemKind,
  type Location,
  type PrepMode,
  type ShortageLevel,
  type ShortageStatus,
  type WasteReason,
  type WasteStatus,
} from '../../shared/kitchen.ts';
import { CATALOG_ITEMS, CATALOG_PREPARATIONS, CATALOG_PRODUCTS } from '../../shared/catalog.ts';
import {
  SHEET_FIELDS,
  baseChangeFactor,
  dayStartIso,
  sheetLine,
  sortSheet,
  summarize,
  type DayMoves,
  type DaySheet,
  type DaySheetLine,
  type SheetStatus,
  type SoldProduct,
} from '../../shared/daySheet.ts';
import { ApiError } from './api';

// v6: se empieza con la hoja en blanco (los productos de la hoja de papel, sin datos de prueba).
const STORAGE_KEY = 'pizza_diana_client_db_v6';
const LEGACY_KEY = 'pizza_diana_client_db_v4';

/** Usuarios para probar cada rol en la demostración. */
export const DEMO_LOGINS: { username: string; password: string; role: Role; label: string }[] = [
  { username: 'admin', password: 'demo1234', role: 'admin', label: 'Administrador' },
  { username: 'caja', password: 'demo1234', role: 'caja', label: 'Caja' },
  { username: 'cocina', password: 'demo1234', role: 'cocina', label: 'Jefe de cocina' },
];

// ---------- Registros guardados ----------

interface UserRec extends User {
  password?: string; // versiones anteriores (texto plano)
  pass?: string; // sha256$sal$hash
}
interface ProductRec extends Omit<Product, 'recipe' | 'warnings'> {
  recipe: { item_id: number; qty_m: number; unit: Unit }[];
}
interface PrepRec {
  id: number;
  name: string;
  mode: PrepMode;
  output_item_id: number;
  std_output_m: number;
  instructions: string;
  active: boolean;
  is_demo: boolean;
  inputs: { item_id: number; qty_m: number; unit: Unit }[];
}
interface ProdRec {
  id: number;
  preparation_id: number;
  preparation_name: string;
  output_item_id: number;
  output_m: number;
  expected_m: number;
  merma_util_m: number;
  merma_inutil_m: number;
  note: string;
  status: 'activa' | 'anulada';
  user_id: number;
  created_at: string;
  local_date: string;
  annul_reason: string | null;
  is_demo: number;
  inputs: { item_id: number; item_name: string; qty_m: number }[];
}
interface WasteRec {
  id: number;
  item_id: number;
  qty_m: number;
  unit: Unit;
  reason: WasteReason;
  note: string;
  photo: string | null;
  status: WasteStatus;
  reported_by: number;
  reported_at: string;
  local_date: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string;
  is_demo: number;
  /** Cuánto se descontó al reportarla (undefined = baja de antes: se descuenta al aprobarla). */
  taken_m?: number;
}
interface ShortageRec {
  id: number;
  item_id: number;
  level: ShortageLevel;
  note: string;
  status: ShortageStatus;
  reported_by: number;
  created_at: string;
  updated_at: string;
  is_demo: number;
}
interface CountRec {
  id: number;
  location: Location;
  kind?: CountKind; // falta en los conteos guardados antes de la apertura/cierre
  status: CountStatus;
  note: string;
  counted_by: number;
  counted_at: string;
  local_date: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  is_demo: number;
  lines: { item_id: number; item_name: string; expected_m: number; counted_m: number }[];
}
interface SheetRec {
  status: SheetStatus;
  note: string;
  validated_by_name: string | null;
  validated_at: string | null;
  is_demo: number;
}
interface SheetLineRec {
  local_date: string;
  item_id: number;
  open_m: number | null;
  close_m: number | null;
  close_sys_m: number | null;
  adj_m: number;
  updated_at: string;
  is_demo: number;
}
interface TaskRec {
  id: number;
  local_date: string;
  preparation_id: number;
  target_m: number | null;
  note: string;
  production_id: number | null;
  is_demo: number;
}

interface State {
  users: UserRec[];
  currentUserId: number | null;
  items: Item[];
  products: ProductRec[];
  sales: SaleDetail[];
  requestIds: Record<string, string>;
  movements: Movement[];
  preparations: PrepRec[];
  productions: ProdRec[];
  wastes: WasteRec[];
  shortages: ShortageRec[];
  counts: CountRec[];
  tasks: TaskRec[];
  /** Hoja del día por fecha (las versiones anteriores no la tienen: se crea al cargar). */
  daySheets: Record<string, SheetRec>;
  sheetLines: SheetLineRec[];
  demoMode: boolean;
  seq: Record<'item' | 'product' | 'user' | 'mov' | 'prep' | 'prod' | 'waste' | 'short' | 'count' | 'task' | 'sale', number>;
}

type Opts = { at?: string; isDemo?: boolean };
type Body = Record<string, unknown>;

const nowIso = () => new Date().toISOString();
const bad = (m: string, d?: unknown) => new ApiError(400, m, d);
const conflict = (m: string, d?: unknown) => new ApiError(409, m, d);
const notFound = (m = 'Registro no encontrado.') => new ApiError(404, m);
const forbidden = (m = 'No tienes permiso para realizar esta acción.') => new ApiError(403, m);
const dayOf = (iso: string) => localDate(new Date(iso));

function num(v: unknown, field: string, { allowZero = true, min = 0 } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`"${field}" debe ser un número válido.`);
  if (n < min) throw bad(`"${field}" no puede ser negativo.`);
  if (!allowZero && n === 0) throw bad(`"${field}" debe ser mayor que cero.`);
  return n;
}
function str(v: unknown, field: string, { min = 1, max = 120 } = {}): string {
  if (typeof v !== 'string' || v.trim().length < min) throw bad(min <= 1 ? `El campo "${field}" es obligatorio.` : `"${field}" debe tener al menos ${min} caracteres.`);
  if (v.trim().length > max) throw bad(`"${field}" no puede superar ${max} caracteres.`);
  return v.trim();
}
const optStr = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function oneOf<T extends string>(v: unknown, field: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) throw bad(`Valor no válido para "${field}".`);
  return v as T;
}
function unitFor(v: unknown, itemUnit: Unit, name: string): Unit {
  const u = v === undefined || v === null ? itemUnit : v;
  if (!isUnit(u) || !compatible(u, itemUnit)) throw bad(`La unidad no es compatible con "${name}".`);
  return u;
}

async function sha256(text: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hashPassword(pw: string): Promise<{ pass?: string; password?: string }> {
  const salt = Math.random().toString(36).slice(2, 10);
  const h = await sha256(salt + pw);
  return h ? { pass: `sha256$${salt}$${h}` } : { password: pw };
}
async function checkPassword(u: UserRec, pw: string): Promise<boolean> {
  if (u.pass) {
    const [, salt, hash] = u.pass.split('$');
    return (await sha256(salt + pw)) === hash;
  }
  return u.password !== undefined && u.password === pw;
}

function emptyState(): State {
  return {
    users: [],
    currentUserId: null,
    items: [],
    products: [],
    sales: [],
    requestIds: {},
    movements: [],
    preparations: [],
    productions: [],
    wastes: [],
    shortages: [],
    counts: [],
    tasks: [],
    daySheets: {},
    sheetLines: [],
    demoMode: false,
    seq: { item: 1, product: 1, user: 1, mov: 1, prep: 1, prod: 1, waste: 1, short: 1, count: 1, task: 1, sale: 1000 },
  };
}

/** Convierte los datos guardados por la versión anterior (v4) sin perderlos. */
function migrateV4(old: Record<string, unknown>): State {
  const s = emptyState();
  const users = (old.users as UserRec[] | undefined) ?? [];
  s.users = users.map((u) => ({ ...u, role: (u.role as string) === 'empleado' ? 'caja' : u.role }));
  s.currentUserId = (old.currentUser as User | null)?.id ?? null;
  s.items = ((old.items as Item[] | undefined) ?? []).map((i, idx) => ({
    ...i,
    kind: i.kind ?? 'insumo',
    location: i.location ?? 'Otro',
    pack_size_m: i.pack_size_m ?? 0,
    pack_label: i.pack_label ?? '',
    sort_order: i.sort_order ?? (idx + 1) * 10,
  }));
  s.products = ((old.products as Product[] | undefined) ?? []).map((p) => ({
    ...p,
    recipe: p.recipe.map((r) => ({ item_id: r.item_id, qty_m: r.qty_m, unit: r.unit })),
  }));
  s.sales = (old.sales as SaleDetail[] | undefined) ?? [];
  s.movements = (old.movements as Movement[] | undefined) ?? [];
  s.demoMode = !!old.demoMode;
  const maxId = (list: { id: number }[]) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  s.seq.item = maxId(s.items);
  s.seq.product = maxId(s.products);
  s.seq.user = maxId(s.users);
  s.seq.mov = maxId(s.movements);
  return s;
}

class BrowserDB {
  state: State;

  constructor() {
    this.state = this.load();
    this.ensureDemoLogins();
  }

  /**
   * Los botones «Administrador / Caja / Cocina» de la pantalla de entrada deben funcionar
   * siempre, aunque el navegador tenga datos guardados por una versión anterior (que solo
   * tenía otros usuarios). No se borra ni cambia nada de lo que ya hay.
   */
  private ensureDemoLogins() {
    const names: Record<Role, string> = { admin: 'Diana (Administradora)', caja: 'Laura (Caja)', cocina: 'Carlos (Cocina)' };
    let added = false;
    for (const d of DEMO_LOGINS) {
      if (this.state.users.some((u) => u.username.toLowerCase() === d.username)) continue;
      const at = nowIso();
      this.state.users.push({
        id: this.state.seq.user++,
        username: d.username,
        name: names[d.role],
        role: d.role,
        perms: [],
        active: true,
        is_demo: false,
        created_at: at,
        updated_at: at,
        password: d.password,
      });
      added = true;
    }
    if (added) {
      try {
        this.save();
      } catch {
        // Sin espacio: igual quedan disponibles mientras la página esté abierta.
      }
    }
  }

  // ---------- Persistencia ----------

  private load(): State {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const st = JSON.parse(data) as State;
        st.daySheets ??= {};
        st.sheetLines ??= [];
        return st;
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = migrateV4(JSON.parse(legacy));
        this.persist(migrated);
        return migrated;
      }
    } catch {
      // Datos dañados: se empieza de nuevo.
    }
    const fresh = buildBlankState();
    this.persist(fresh);
    return fresh;
  }

  save(): void {
    this.persist(this.state);
  }

  private persist(s: State): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      throw new ApiError(507, 'El navegador se quedó sin espacio para guardar (las fotos ocupan mucho). Borra bajas antiguas o restablece la demostración.');
    }
  }

  // ---------- Usuarios y sesión ----------

  user(): UserRec | null {
    const u = this.state.users.find((x) => x.id === this.state.currentUserId);
    return u && u.active ? u : null;
  }

  private publicUser(u: UserRec): User {
    const { password: _p, pass: _h, ...rest } = u;
    return { ...rest, can_login: !!(u.pass || u.password) };
  }

  session(): Session {
    const u = this.user();
    return {
      user: u ? this.publicUser(u) : null,
      needsSetup: !this.state.users.some((x) => x.pass || x.password),
      demoMode: this.state.demoMode,
      today: localDate(),
    };
  }

  async setup(body: Body): Promise<{ user: User }> {
    if (!this.session().needsSetup) throw forbidden('El sistema ya tiene un administrador configurado.');
    const u = await this.insertUser({ ...body, role: 'admin' });
    this.state.currentUserId = u.id;
    this.save();
    return { user: this.publicUser(u) };
  }

  async login(body: Body): Promise<{ user: User }> {
    const fail = new ApiError(401, 'Usuario o contraseña incorrectos.');
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const u = this.state.users.find((x) => x.username.toLowerCase() === username);
    if (!u || !password || !(await checkPassword(u, password))) throw fail;
    if (!u.active) throw new ApiError(401, 'Este usuario está desactivado. Habla con el administrador.');
    // Las claves guardadas en texto plano por versiones anteriores se cifran al entrar.
    if (u.password !== undefined) {
      Object.assign(u, await hashPassword(password));
      if (u.pass) delete u.password;
    }
    this.state.currentUserId = u.id;
    this.save();
    return { user: this.publicUser(u) };
  }

  logout() {
    this.state.currentUserId = null;
    this.save();
    return { ok: true };
  }

  private async insertUser(body: Body, isDemo = false): Promise<UserRec> {
    const username = str(body.username, 'usuario', { min: 3, max: 40 }).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(username)) throw bad('El usuario solo puede tener letras sin tilde, números, punto, guion y guion bajo.');
    const name = str(body.name, 'nombre', { max: 80 });
    const role = oneOf(body.role, 'rol', ROLES);
    const pw = body.password;
    if (typeof pw !== 'string' || pw.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres.');
    if (this.state.users.some((u) => u.username.toLowerCase() === username)) throw conflict('Ese nombre de usuario ya existe.');
    const perms = role === 'admin' ? [] : this.validPerms(body.perms);
    const at = nowIso();
    const u: UserRec = { id: this.state.seq.user++, username, name, role, perms, active: true, is_demo: isDemo, created_at: at, updated_at: at, ...(await hashPassword(pw)) };
    this.state.users.push(u);
    return u;
  }

  private validPerms(v: unknown): ExtraPerm[] {
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw bad('Permisos no válidos.');
    return [...new Set(v.map((p) => oneOf(p, 'permiso', EXTRA_PERMS)))];
  }

  listUsers(): User[] {
    return [...this.state.users].sort((a, b) => Number(b.active) - Number(a.active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name)).map((u) => this.publicUser(u));
  }

  async createUser(body: Body) {
    const u = await this.insertUser(body);
    this.save();
    return this.publicUser(u);
  }

  updateUser(actor: UserRec, id: number, body: Body) {
    const u = this.state.users.find((x) => x.id === id);
    if (!u) throw notFound('Usuario no encontrado.');
    const role = body.role === undefined ? u.role : oneOf(body.role, 'rol', ROLES);
    const active = body.active === undefined ? u.active : body.active === true;
    const admins = this.state.users.filter((x) => x.role === 'admin' && x.active && (x.pass || x.password)).length;
    if (u.role === 'admin' && u.active && (role !== 'admin' || !active) && admins <= 1) throw conflict('Debe quedar al menos un administrador activo.');
    if (actor.id === id && !active) throw conflict('No puedes desactivar tu propio usuario.');
    u.name = body.name === undefined ? u.name : str(body.name, 'nombre', { max: 80 });
    u.role = role;
    u.perms = role === 'admin' ? [] : body.perms === undefined ? u.perms : this.validPerms(body.perms);
    u.active = active;
    u.updated_at = nowIso();
    this.save();
    return this.publicUser(u);
  }

  async resetPassword(id: number, password: unknown) {
    const u = this.state.users.find((x) => x.id === id);
    if (!u) throw notFound('Usuario no encontrado.');
    if (typeof password !== 'string' || password.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres.');
    delete u.password;
    Object.assign(u, await hashPassword(password));
    this.save();
    return { ok: true };
  }

  async changeOwnPassword(u: UserRec, current: unknown, next: unknown) {
    if (typeof current !== 'string' || !(await checkPassword(u, current))) throw bad('La contraseña actual no es correcta.');
    return this.resetPassword(u.id, next);
  }

  // ---------- Inventario ----------

  item(id: number): Item {
    const it = this.state.items.find((i) => i.id === id);
    if (!it) throw notFound('Artículo de inventario no encontrado.');
    return it;
  }

  listItems(): Item[] {
    return this.state.items.map((i) => ({ ...i, status: stockStatus(i.qty_m, i.min_m) })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  applyMovement(p: { itemId: number; delta: number; type: MovementType; reason: string; user: User; saleId?: string; at?: string; isDemo?: boolean }) {
    const it = this.item(p.itemId);
    const after = it.qty_m + p.delta;
    if (after < 0) throw conflict(`La operación dejaría "${it.name}" con existencia negativa.`);
    const at = p.at ?? nowIso();
    it.qty_m = after;
    it.status = stockStatus(after, it.min_m);
    it.updated_at = at;
    this.state.movements.push({
      id: this.state.seq.mov++,
      item_id: it.id,
      item_name: it.name,
      base_unit: it.base_unit,
      unit: it.unit,
      created_at: at,
      type: p.type,
      delta_m: p.delta,
      after_m: after,
      reason: p.reason,
      user_name: p.user.name,
      sale_id: p.saleId ?? null,
      is_demo: (p.isDemo ?? this.state.demoMode) ? 1 : 0,
    });
  }

  private kitchenFields(body: Body, unit: Unit, cur?: Item) {
    const location = body.location === undefined ? (cur?.location ?? 'Otro') : oneOf(body.location, 'ubicación', LOCATIONS);
    const kind = body.kind === undefined ? (cur?.kind ?? 'insumo') : oneOf(body.kind, 'tipo', ['insumo', 'preparacion'] as const);
    let pack = cur?.pack_size_m ?? 0;
    if (body.pack_size === null || body.pack_size === '') pack = 0;
    else if (body.pack_size !== undefined) pack = toMilli(num(body.pack_size, 'tamaño del paquete'), unitFor(body.pack_unit, unit, 'paquete'));
    const label = body.pack_label === undefined ? (cur?.pack_label ?? '') : optStr(body.pack_label, 30);
    const sort = body.sort_order === undefined ? (cur?.sort_order ?? this.state.items.length * 10 + 10) : Math.round(num(body.sort_order, 'orden'));
    return { location: location as Location, kind: kind as ItemKind, pack_size_m: pack, pack_label: pack > 0 ? label || 'paquete' : '', sort_order: sort };
  }

  createItem(user: User, body: Body, opts: Opts = {}): Item {
    const name = str(body.name, 'nombre', { max: 80 });
    const category = str(body.category, 'categoría', { max: 40 });
    if (!isUnit(body.unit)) throw bad('Unidad de medida no válida.');
    const unit = body.unit;
    if (this.state.items.some((i) => i.active && i.name.toLowerCase() === name.toLowerCase())) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
    const at = opts.at ?? nowIso();
    const min_m = toMilli(num(body.min ?? 0, 'cantidad mínima'), unit);
    const it: Item = {
      id: this.state.seq.item++,
      name,
      category,
      base_unit: baseOf(unit),
      unit,
      qty_m: 0,
      min_m,
      status: stockStatus(0, min_m),
      ...this.kitchenFields(body, unit),
      active: true,
      is_demo: opts.isDemo ?? this.state.demoMode,
      created_at: at,
      updated_at: at,
    };
    this.state.items.push(it);
    const q = toMilli(num(body.qty ?? 0, 'cantidad inicial'), unit);
    if (q > 0) this.applyMovement({ itemId: it.id, delta: q, type: 'inicial', reason: 'Existencia inicial', user, at, isDemo: it.is_demo });
    return it;
  }

  updateItem(id: number, body: Body): Item {
    const it = this.item(id);
    const unit = body.unit === undefined ? it.unit : unitFor(body.unit, it.unit, it.name);
    const name = body.name === undefined ? it.name : str(body.name, 'nombre', { max: 80 });
    if (this.state.items.some((i) => i.id !== id && i.active && i.name.toLowerCase() === name.toLowerCase())) throw conflict(`Ya existe un artículo activo llamado "${name}".`);
    Object.assign(it, this.kitchenFields(body, unit, it), {
      name,
      category: body.category === undefined ? it.category : str(body.category, 'categoría', { max: 40 }),
      unit,
      min_m: body.min === undefined ? it.min_m : toMilli(num(body.min, 'cantidad mínima'), unit),
      updated_at: nowIso(),
    });
    it.status = stockStatus(it.qty_m, it.min_m);
    return it;
  }

  setItemActive(id: number, active: boolean): Item {
    const it = this.item(id);
    if (!active) {
      const used = this.state.products.filter((p) => p.active && p.recipe.some((r) => r.item_id === id));
      if (used.length) throw conflict(`No se puede desactivar: se usa en la receta de ${used.map((u) => u.name).join(', ')}. Quítalo de esas recetas primero.`);
      const preps = this.state.preparations.filter((p) => p.active && (p.output_item_id === id || p.inputs.some((i) => i.item_id === id)));
      if (preps.length) throw conflict(`No se puede desactivar: se usa en la preparación ${preps.map((p) => p.name).join(', ')}. Desactiva esa preparación primero.`);
    }
    it.active = active;
    return it;
  }

  registerEntry(user: User, id: number, body: Body, opts: Opts = {}): Item {
    const it = this.item(id);
    if (!it.active) throw conflict('El artículo está desactivado.');
    const unit = unitFor(body.unit, it.unit, it.name);
    const at = opts.at ?? nowIso();
    this.applyMovement({
      itemId: id,
      delta: toMilli(num(body.qty, 'cantidad', { allowZero: false }), unit),
      type: 'entrada',
      reason: optStr(body.reason, 200) || 'Entrada de mercancía',
      user,
      at,
      isDemo: opts.isDemo,
    });
    for (const s of this.state.shortages) {
      if (s.item_id === id && (s.status === 'abierto' || s.status === 'pedido')) {
        s.status = 'recibido';
        s.updated_at = at;
      }
    }
    return it;
  }

  registerAdjust(user: User, id: number, body: Body): Item {
    const it = this.item(id);
    const unit = unitFor(body.unit, it.unit, it.name);
    const mode = oneOf(body.mode, 'tipo de ajuste', ['set', 'delta'] as const);
    const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
    const raw = typeof body.value === 'string' ? Number(body.value.replace(',', '.')) : body.value;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw bad('La cantidad del ajuste no es válida.');
    if (mode === 'set' && raw < 0) throw bad('La existencia no puede ser negativa.');
    // «delta» suma o resta según el signo (antes la demostración lo restaba siempre).
    const delta = mode === 'set' ? toMilli(raw, unit) - it.qty_m : toMilli(raw, unit);
    if (delta === 0) throw bad('El ajuste no cambia la existencia.');
    this.applyMovement({ itemId: id, delta, type: 'ajuste', reason, user });
    return it;
  }

  listMovements(q: { itemId?: number; type?: string; limit?: number }): Movement[] {
    let list = this.state.movements;
    if (q.itemId) list = list.filter((m) => m.item_id === q.itemId);
    if (q.type) list = list.filter((m) => m.type === q.type);
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, Math.min(q.limit ?? 200, 1000));
  }

  // ---------- Productos ----------

  private productView(p: ProductRec): Product {
    const recipe: RecipeLine[] = p.recipe.map((r) => {
      const it = this.item(r.item_id);
      return { item_id: it.id, item_name: it.name, base_unit: it.base_unit, item_unit: it.unit, item_active: it.active, unit: r.unit, qty_m: r.qty_m };
    });
    const warnings: string[] = [];
    if (!recipe.length) warnings.push(p.type === 'directo' ? 'No está enlazado a un artículo de inventario.' : 'No tiene receta configurada.');
    for (const l of recipe) if (!l.item_active) warnings.push(`Usa "${l.item_name}", que está desactivado en inventario.`);
    return { ...p, recipe, warnings };
  }

  listProducts(): Product[] {
    return this.state.products
      .map((p) => this.productView(p))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'es'));
  }

  private validRecipe(raw: unknown, type: 'preparado' | 'directo') {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw bad('La receta no es válida.');
    const seen = new Set<number>();
    const lines = (raw as Body[]).map((l) => {
      const it = this.state.items.find((i) => i.id === Number(l.item_id));
      if (!it) throw bad('Un ingrediente de la receta no existe en el inventario.');
      if (!it.active) throw bad(`"${it.name}" está desactivado en inventario.`);
      if (seen.has(it.id)) throw bad(`"${it.name}" está repetido en la receta. Suma las cantidades en una sola línea.`);
      seen.add(it.id);
      const unit = unitFor(l.unit, it.unit, it.name);
      return { item_id: it.id, qty_m: toMilli(num(l.qty, `cantidad de ${it.name}`, { allowZero: false }), unit), unit };
    });
    if (type === 'directo' && lines.length > 1) throw bad('Un producto de venta directa se enlaza a un solo artículo de inventario.');
    return lines;
  }

  createProduct(body: Body, opts: Opts = {}): Product {
    const name = str(body.name, 'nombre', { max: 80 });
    const type = oneOf(body.type, 'tipo de producto', ['preparado', 'directo'] as const);
    if (this.state.products.some((p) => p.active && p.name.toLowerCase() === name.toLowerCase())) throw conflict(`Ya existe un producto activo llamado "${name}".`);
    const at = opts.at ?? nowIso();
    const p: ProductRec = {
      id: this.state.seq.product++,
      name,
      category: str(body.category, 'categoría', { max: 40 }),
      description: optStr(body.description, 300),
      type,
      active: true,
      is_demo: opts.isDemo ?? this.state.demoMode,
      created_at: at,
      updated_at: at,
      recipe: this.validRecipe(body.recipe, type),
    };
    this.state.products.push(p);
    return this.productView(p);
  }

  updateProduct(id: number, body: Body): Product {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) throw notFound('Producto no encontrado.');
    const type = body.type === undefined ? p.type : oneOf(body.type, 'tipo de producto', ['preparado', 'directo'] as const);
    const name = body.name === undefined ? p.name : str(body.name, 'nombre', { max: 80 });
    if (this.state.products.some((x) => x.id !== id && x.active && x.name.toLowerCase() === name.toLowerCase())) throw conflict(`Ya existe un producto activo llamado "${name}".`);
    p.name = name;
    p.type = type;
    if (body.category !== undefined) p.category = str(body.category, 'categoría', { max: 40 });
    if (body.description !== undefined) p.description = optStr(body.description, 300);
    if (body.recipe !== undefined) p.recipe = this.validRecipe(body.recipe, type);
    p.updated_at = nowIso();
    return this.productView(p);
  }

  setProductActive(id: number, active: boolean): Product {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) throw notFound('Producto no encontrado.');
    p.active = active;
    return this.productView(p);
  }

  // ---------- Ventas ----------

  private plan(body: Body) {
    const raw = body.items;
    if (!Array.isArray(raw) || raw.length === 0) throw bad('Agrega al menos un producto a la venta.');
    const lines = new Map<number, number>();
    for (const l of raw as Body[]) {
      const qty = num(l.qty, 'cantidad', { allowZero: false });
      if (!Number.isInteger(qty)) throw bad('"cantidad" debe ser un número entero.');
      lines.set(Number(l.productId), (lines.get(Number(l.productId)) ?? 0) + qty);
    }
    const products = [...lines].map(([id, qty]) => {
      const p = this.state.products.find((x) => x.id === id);
      if (!p) throw notFound('Producto no encontrado.');
      const view = this.productView(p);
      if (!p.active) throw conflict(`"${p.name}" está inactivo y no se puede vender.`);
      if (view.warnings.length) throw conflict(`"${p.name}" no se puede vender: ${view.warnings[0]}`);
      return { p: view, qty };
    });
    const need = new Map<number, number>();
    for (const { p, qty } of products) for (const r of p.recipe) need.set(r.item_id, (need.get(r.item_id) ?? 0) + r.qty_m * qty);
    const requirements: Requirement[] = [...need].map(([itemId, needed]) => {
      const it = this.item(itemId);
      const after = it.qty_m - needed;
      return { item_id: it.id, item_name: it.name, base_unit: it.base_unit, unit: it.unit, needed_m: needed, available_m: it.qty_m, after_m: after, short_m: after < 0 ? -after : 0 };
    });
    return { products, requirements, shortages: requirements.filter((r) => r.short_m > 0), totalUnits: products.reduce((s, x) => s + x.qty, 0) };
  }

  previewSale(body: Body): SalePreview {
    const pl = this.plan(body);
    return {
      items: pl.products.map(({ p, qty }) => ({ productId: p.id, name: p.name, qty })),
      requirements: pl.requirements,
      totalUnits: pl.totalUnits,
      ok: pl.shortages.length === 0,
      shortages: pl.shortages,
    };
  }

  registerSale(user: User, body: Body, opts: Opts = {}): { sale: SaleDetail; duplicate: boolean } {
    const requestId = str(body.requestId, 'identificador', { min: 8, max: 100 });
    const prevId = this.state.requestIds[requestId];
    if (prevId) return { sale: this.getSale(user, prevId), duplicate: true };
    const pl = this.plan(body);
    const at = opts.at ?? nowIso();
    const id = `V-${String(this.state.seq.sale++).padStart(5, '0')}`;
    const isDemo = opts.isDemo ?? this.state.demoMode;
    const consumption: SaleDetail['consumption'] = [];
    for (const { p, qty } of pl.products) {
      for (const r of p.recipe) consumption.push({ product_id: p.id, product_name: p.name, item_id: r.item_id, item_name: r.item_name, base_unit: r.base_unit, per_unit_m: r.qty_m, total_m: r.qty_m * qty });
    }
    // Nunca se bloquea la caja: se descuenta lo que hay y la diferencia se ve en la hoja del día.
    for (const r of pl.requirements) {
      const take = Math.min(r.needed_m, r.available_m);
      if (take > 0) this.applyMovement({ itemId: r.item_id, delta: -take, type: 'venta', reason: `Venta ${id}`, user, saleId: id, at, isDemo });
    }
    const sale: SaleDetail = {
      id,
      created_at: at,
      local_date: dayOf(at),
      total_units: pl.totalUnits,
      status: 'confirmada',
      user_id: user.id,
      user_name: user.name,
      annulled_by_name: null,
      annulled_at: null,
      annul_reason: null,
      is_demo: isDemo ? 1 : 0,
      items: pl.products.map(({ p, qty }) => ({ product_id: p.id, product_name: p.name, qty })),
      consumption,
    };
    this.state.sales.push(sale);
    this.state.requestIds[requestId] = id;
    return { sale, duplicate: false };
  }

  listSales(user: User, q: { from?: string; to?: string; productId?: number; userId?: number; status?: string; limit?: number }): Sale[] {
    const userId = can(user, 'sales.viewAll') ? q.userId : user.id;
    return this.state.sales
      .filter(
        (s) =>
          (!q.from || s.local_date >= q.from) &&
          (!q.to || s.local_date <= q.to) &&
          (!q.status || s.status === q.status) &&
          (!userId || s.user_id === userId) &&
          (!q.productId || s.items.some((i) => i.product_id === q.productId)),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, Math.min(q.limit ?? 200, 1000))
      .map(({ consumption: _c, ...s }) => s);
  }

  getSale(user: User, id: string): SaleDetail {
    const s = this.state.sales.find((x) => x.id === id);
    if (!s) throw notFound('Venta no encontrada.');
    if (s.user_id !== user.id && !can(user, 'sales.viewAll')) throw forbidden('Solo puedes ver tus propias ventas.');
    return s;
  }

  annulSale(user: User, id: string, body: Body, opts: Opts = {}) {
    const s = this.state.sales.find((x) => x.id === id);
    if (!s) throw notFound('Venta no encontrada.');
    if (s.status === 'anulada') throw conflict('Esta venta ya fue anulada.');
    const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
    const at = opts.at ?? nowIso();
    const back = new Map<number, number>();
    // Se devuelve exactamente lo que se descontó (si no alcanzaba, se descontó menos que la receta).
    for (const m of this.state.movements) if (m.sale_id === s.id && m.type === 'venta') back.set(m.item_id, (back.get(m.item_id) ?? 0) - m.delta_m);
    for (const [itemId, m] of back) this.applyMovement({ itemId, delta: m, type: 'anulacion', reason: `Anulación venta ${s.id}: ${reason}`, user, saleId: s.id, at, isDemo: !!s.is_demo });
    Object.assign(s, { status: 'anulada', annulled_by_name: user.name, annulled_at: at, annul_reason: reason });
    return this.getSale(user, id);
  }

  // ---------- Preparaciones ----------

  private prepView(p: PrepRec): Preparation {
    const out = this.item(p.output_item_id);
    const inputs = p.inputs.map((i) => {
      const it = this.item(i.item_id);
      return { item_id: it.id, item_name: it.name, base_unit: it.base_unit, item_unit: it.unit, unit: i.unit, qty_m: i.qty_m, available_m: it.qty_m };
    });
    const last = this.state.productions.filter((x) => x.preparation_id === p.id && x.status === 'activa').reduce<string | null>((m, x) => (!m || x.created_at > m ? x.created_at : m), null);
    const base = inputs[0];
    return {
      id: p.id,
      name: p.name,
      mode: p.mode,
      output_item_id: out.id,
      output_name: out.name,
      output_unit: out.unit,
      output_base: out.base_unit,
      output_available_m: out.qty_m,
      std_output_m: p.std_output_m,
      std_yield_pct: p.mode === 'transformacion' && base && base.base_unit === out.base_unit ? Math.round((p.std_output_m / base.qty_m) * 1000) / 10 : null,
      instructions: p.instructions,
      active: p.active,
      is_demo: p.is_demo,
      inputs,
      last_production_at: last,
    };
  }

  prep(id: number): PrepRec {
    const p = this.state.preparations.find((x) => x.id === id);
    if (!p) throw notFound('Preparación no encontrada.');
    return p;
  }

  listPreparations(): Preparation[] {
    return this.state.preparations.map((p) => this.prepView(p)).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
  }

  private validPrep(body: Body, cur?: PrepRec) {
    const name = body.name === undefined && cur ? cur.name : str(body.name, 'nombre', { max: 80 });
    const mode = body.mode === undefined && cur ? cur.mode : oneOf(body.mode, 'tipo de preparación', ['transformacion', 'lote'] as const);
    const output = this.state.items.find((i) => i.id === Number(body.output_item_id ?? cur?.output_item_id));
    if (!output || !output.active) throw bad('Elige un resultado activo del inventario.');
    const raw = (body.inputs ?? cur?.inputs.map((i) => ({ item_id: i.item_id, qty: i.qty_m / 1000, unit: baseOf(i.unit) }))) as Body[] | undefined;
    if (!Array.isArray(raw) || raw.length === 0) throw bad('Agrega al menos un ingrediente.');
    if (mode === 'transformacion' && raw.length !== 1) throw bad('Una transformación usa un solo insumo (por ejemplo, cebolla → cebolla caramelizada).');
    const seen = new Set<number>();
    const inputs = raw.map((l) => {
      const it = this.state.items.find((i) => i.id === Number(l.item_id));
      if (!it || !it.active) throw bad('Un ingrediente de la preparación no existe o está desactivado.');
      if (it.id === output.id) throw bad('El resultado no puede ser también ingrediente de la misma preparación.');
      if (seen.has(it.id)) throw bad(`"${it.name}" está repetido. Suma las cantidades en una sola línea.`);
      seen.add(it.id);
      const unit = unitFor(l.unit, it.unit, it.name);
      return { item_id: it.id, qty_m: toMilli(num(l.qty, `cantidad de ${it.name}`, { allowZero: false }), unit), unit };
    });
    const std_output_m =
      body.std_output === undefined && cur ? cur.std_output_m : toMilli(num(body.std_output, 'rendimiento estándar', { allowZero: false }), unitFor(body.std_output_unit, output.unit, output.name));
    if (mode === 'transformacion' && this.item(inputs[0].item_id).base_unit !== output.base_unit) {
      throw bad('Para medir la merma, el insumo y el resultado deben medirse igual (los dos en peso o los dos en volumen).');
    }
    return { name, mode, output_item_id: output.id, std_output_m, instructions: body.instructions === undefined ? (cur?.instructions ?? '') : optStr(body.instructions, 600), inputs };
  }

  createPreparation(body: Body, opts: Opts = {}): Preparation {
    const v = this.validPrep(body);
    if (this.state.preparations.some((p) => p.active && p.name.toLowerCase() === v.name.toLowerCase())) throw conflict(`Ya existe una preparación activa llamada "${v.name}".`);
    const p: PrepRec = { id: this.state.seq.prep++, ...v, active: true, is_demo: opts.isDemo ?? this.state.demoMode };
    this.state.preparations.push(p);
    this.item(v.output_item_id).kind = 'preparacion';
    return this.prepView(p);
  }

  updatePreparation(id: number, body: Body): Preparation {
    const p = this.prep(id);
    const v = this.validPrep(body, p);
    if (this.state.preparations.some((x) => x.id !== id && x.active && x.name.toLowerCase() === v.name.toLowerCase())) throw conflict(`Ya existe una preparación activa llamada "${v.name}".`);
    Object.assign(p, v);
    this.item(v.output_item_id).kind = 'preparacion';
    return this.prepView(p);
  }

  setPreparationActive(id: number, active: boolean): Preparation {
    const p = this.prep(id);
    p.active = active;
    return this.prepView(p);
  }

  private productionView(r: ProdRec): Production {
    const p = this.prep(r.preparation_id);
    const out = this.item(r.output_item_id);
    const inputs = r.inputs.map((i) => {
      const it = this.item(i.item_id);
      return { item_id: i.item_id, item_name: i.item_name, unit: it.unit, base_unit: it.base_unit, qty_m: i.qty_m };
    });
    const y = productionYield({
      baseInputM: inputs[0]?.qty_m ?? 0,
      outputM: r.output_m,
      expectedM: r.expected_m,
      sameBase: p.mode === 'transformacion' && !!inputs[0] && inputs[0].base_unit === out.base_unit,
    });
    const u = this.state.users.find((x) => x.id === r.user_id);
    return {
      ...r,
      mode: p.mode,
      output_name: out.name,
      output_unit: out.unit,
      user_name: u?.name ?? '—',
      inputs,
      yield_pct: y.yieldPct,
      efficiency_pct: y.efficiencyPct,
      low: y.low,
    };
  }

  listProductions(q: { from?: string; to?: string; userId?: number; preparationId?: number; limit?: number }): Production[] {
    return this.state.productions
      .filter(
        (r) =>
          (!q.from || r.local_date >= q.from) &&
          (!q.to || r.local_date <= q.to) &&
          (!q.userId || r.user_id === q.userId) &&
          (!q.preparationId || r.preparation_id === q.preparationId),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      .slice(0, Math.min(q.limit ?? 100, 500))
      .map((r) => this.productionView(r));
  }

  registerProduction(user: User, body: Body, opts: Opts = {}): Production {
    const p = this.prep(Number(body.preparation_id));
    if (!p.active) throw conflict('Esta preparación está desactivada.');
    const view = this.prepView(p);
    const out = this.item(p.output_item_id);
    const outM = toMilli(num(body.output_qty, `cantidad de ${out.name} que salió`, { allowZero: false }), unitFor(body.output_unit, out.unit, out.name));
    let used: { item_id: number; item_name: string; qty_m: number }[];
    let util = 0;
    let inutil = 0;
    if (p.mode === 'transformacion') {
      const base = this.item(p.inputs[0].item_id);
      const inM = toMilli(num(body.input_qty, `cantidad de ${base.name} que se usó`, { allowZero: false }), unitFor(body.input_unit, base.unit, base.name));
      used = [{ item_id: base.id, item_name: base.name, qty_m: inM }];
      if (body.merma_util_qty !== undefined && body.merma_util_qty !== '' && body.merma_util_qty !== null) {
        util = toMilli(num(body.merma_util_qty, 'merma útil'), unitFor(body.merma_util_unit ?? body.input_unit, base.unit, base.name));
      }
      inutil = Math.max(0, inM - outM - util);
      if (outM + util > inM * 1.5) throw bad('Lo que salió es mucho más de lo que entró. Revisa las cantidades y las unidades.');
    } else {
      const raw = body.inputs;
      if (!Array.isArray(raw) || raw.length === 0) throw bad('Indica cuánto se usó de cada ingrediente.');
      used = [];
      for (const l of raw as Body[]) {
        const it = this.item(Number(l.item_id));
        if (!p.inputs.some((i) => i.item_id === it.id)) throw bad(`"${it.name}" no hace parte de la receta de ${p.name}.`);
        const m = toMilli(num(l.qty, `cantidad de ${it.name}`), unitFor(l.unit, it.unit, it.name));
        if (m > 0) used.push({ item_id: it.id, item_name: it.name, qty_m: m });
      }
      if (!used.some((u) => u.item_id === p.inputs[0].item_id)) throw bad(`Indica cuánto se usó de ${view.inputs[0].item_name}: con eso se calcula lo que debía rendir.`);
    }
    const baseUsed = used.find((u) => u.item_id === p.inputs[0].item_id)!.qty_m;
    const expected = scaleBatch(p.inputs, p.std_output_m, baseUsed).expectedM;

    const at = opts.at ?? nowIso();
    const isDemo = opts.isDemo ?? this.state.demoMode;
    const id = this.state.seq.prod++;
    // Lo anotado en la hoja manda: si el sistema cree que hay menos, se descuenta lo que haya.
    for (const u of used) {
      const take = Math.min(u.qty_m, this.item(u.item_id).qty_m);
      if (take > 0) this.applyMovement({ itemId: u.item_id, delta: -take, type: 'produccion', reason: `Se usó para ${p.name} (#${id})`, user, at, isDemo });
    }
    this.applyMovement({ itemId: out.id, delta: outM, type: 'produccion', reason: `Preparación #${id}`, user, at, isDemo });
    const rec: ProdRec = {
      id,
      preparation_id: p.id,
      preparation_name: p.name,
      output_item_id: out.id,
      output_m: outM,
      expected_m: expected,
      merma_util_m: util,
      merma_inutil_m: inutil,
      note: optStr(body.note, 300),
      status: 'activa',
      user_id: user.id,
      created_at: at,
      local_date: dayOf(at),
      annul_reason: null,
      is_demo: isDemo ? 1 : 0,
      inputs: used,
    };
    this.state.productions.push(rec);
    const task = this.state.tasks.find((t) => t.local_date === rec.local_date && t.preparation_id === p.id && !t.production_id);
    if (task) task.production_id = id;
    return this.productionView(rec);
  }

  annulProduction(user: User, id: number, body: Body): Production {
    const r = this.state.productions.find((x) => x.id === id);
    if (!r) throw notFound('Registro de preparación no encontrado.');
    if (r.status === 'anulada') throw conflict('Esta preparación ya fue anulada.');
    const reason = str(body.reason, 'motivo', { min: 3, max: 200 });
    const out = this.item(r.output_item_id);
    if (out.qty_m < r.output_m) throw conflict(`La operación dejaría "${out.name}" con existencia negativa.`);
    this.applyMovement({ itemId: r.output_item_id, delta: -r.output_m, type: 'produccion', reason: `Anulación de preparación #${id}: ${reason}`, user, isDemo: !!r.is_demo });
    for (const i of r.inputs) this.applyMovement({ itemId: i.item_id, delta: i.qty_m, type: 'produccion', reason: `Anulación de preparación #${id}: ${reason}`, user, isDemo: !!r.is_demo });
    r.status = 'anulada';
    r.annul_reason = reason;
    for (const t of this.state.tasks) if (t.production_id === id) t.production_id = null;
    return this.productionView(r);
  }

  // ---------- Bajas ----------

  private wasteView(w: WasteRec): Waste {
    const it = this.item(w.item_id);
    const by = this.state.users.find((u) => u.id === w.reported_by);
    const rv = this.state.users.find((u) => u.id === w.reviewed_by);
    const { photo, ...rest } = w;
    return {
      ...rest,
      item_name: it.name,
      item_unit: it.unit,
      base_unit: it.base_unit,
      item_qty_m: it.qty_m,
      has_photo: !!photo,
      reported_by_name: by?.name ?? '—',
      reviewed_by_name: rv?.name ?? null,
    };
  }

  listWastes(user: User, q: { status?: string; from?: string; to?: string; limit?: number }): Waste[] {
    return this.state.wastes
      .filter(
        (w) =>
          (can(user, 'kitchen.use') || w.reported_by === user.id) &&
          (!q.status || w.status === q.status) &&
          (!q.from || w.local_date >= q.from) &&
          (!q.to || w.local_date <= q.to),
      )
      .sort((a, b) => Number(b.status === 'pendiente') - Number(a.status === 'pendiente') || b.reported_at.localeCompare(a.reported_at))
      .slice(0, Math.min(q.limit ?? 100, 500))
      .map((w) => this.wasteView(w));
  }

  wastePhoto(user: User, id: number) {
    const w = this.state.wastes.find((x) => x.id === id);
    if (!w || (!can(user, 'kitchen.use') && w.reported_by !== user.id)) throw notFound('Baja no encontrada.');
    return { photo: w.photo };
  }

  reportWaste(user: User, body: Body, opts: Opts = {}): Waste {
    const it = this.state.items.find((i) => i.id === Number(body.item_id));
    if (!it) throw bad('Elige el producto que se da de baja.');
    if (!it.active) throw bad(`"${it.name}" está desactivado en inventario.`);
    const unit = unitFor(body.unit, it.unit, it.name);
    const reason = oneOf(body.reason, 'motivo', WASTE_REASONS);
    const note = optStr(body.note, 300);
    if (reason === 'otro' && note.length < 3) throw bad('Explica el motivo de la baja en el detalle.');
    const photo = typeof body.photo === 'string' && body.photo ? body.photo : null;
    if (photo && !/^data:image\/(jpeg|png|webp|svg\+xml);base64,/.test(photo)) throw bad('La foto no es válida.');
    const at = opts.at ?? nowIso();
    const w: WasteRec = {
      id: this.state.seq.waste++,
      item_id: it.id,
      qty_m: toMilli(num(body.qty, 'cantidad', { allowZero: false }), unit),
      unit,
      reason,
      note,
      photo,
      status: 'pendiente',
      reported_by: user.id,
      reported_at: at,
      local_date: dayOf(at),
      reviewed_by: null,
      reviewed_at: null,
      review_note: '',
      is_demo: (opts.isDemo ?? this.state.demoMode) ? 1 : 0,
    };
    this.state.wastes.push(w);
    // Lo que se bota ya salió de la nevera: se descuenta de una vez (sin dejar la existencia negativa).
    this.takeWaste(user, w, at);
    if (can(user, 'kitchen.manage')) this.approveWaste(user, w, 'Registrada por el administrador', at);
    return this.wasteView(w);
  }

  private takeWaste(user: User, w: WasteRec, at: string) {
    const taken = Math.min(w.qty_m, this.item(w.item_id).qty_m);
    if (taken > 0) this.applyMovement({ itemId: w.item_id, delta: -taken, type: 'baja', reason: `Baja #${w.id}: ${w.note || WASTE_REASON_LABELS[w.reason]}`, user, at, isDemo: !!w.is_demo });
    w.taken_m = taken;
  }

  private approveWaste(admin: User, w: WasteRec, note: string, at: string) {
    // Las bajas reportadas antes de este cambio todavía no se habían descontado.
    if (w.taken_m === undefined) this.takeWaste(admin, w, at);
    Object.assign(w, { status: 'aprobada', reviewed_by: admin.id, reviewed_at: at, review_note: note });
  }

  reviewWaste(admin: User, id: number, body: Body, opts: Opts = {}): Waste {
    const w = this.state.wastes.find((x) => x.id === id);
    if (!w) throw notFound('Baja no encontrada.');
    if (w.status !== 'pendiente') throw conflict('Esta baja ya fue revisada.');
    const decision = oneOf(body.decision, 'decisión', ['aprobar', 'rechazar'] as const);
    const note = optStr(body.note, 200);
    const at = opts.at ?? nowIso();
    if (decision === 'aprobar') {
      this.approveWaste(admin, w, note, at);
    } else {
      if (note.length < 3) throw bad('Explica por qué se rechaza la baja.');
      // Si no se autoriza, lo descontado vuelve al inventario.
      if (w.taken_m) this.applyMovement({ itemId: w.item_id, delta: w.taken_m, type: 'baja', reason: `Baja #${w.id} rechazada: se devuelve al inventario`, user: admin, at, isDemo: !!w.is_demo });
      Object.assign(w, { status: 'rechazada', reviewed_by: admin.id, reviewed_at: at, review_note: note });
    }
    return this.wasteView(w);
  }

  // ---------- Faltantes ----------

  private shortageView(s: ShortageRec): Shortage {
    const it = this.item(s.item_id);
    return {
      ...s,
      item_name: it.name,
      item_unit: it.unit,
      base_unit: it.base_unit,
      location: it.location,
      qty_m: it.qty_m,
      min_m: it.min_m,
      reported_by_name: this.state.users.find((u) => u.id === s.reported_by)?.name ?? '—',
    };
  }

  listShortages(scope = 'open'): Shortage[] {
    return this.state.shortages
      .filter((s) => scope !== 'open' || s.status === 'abierto' || s.status === 'pedido')
      .sort(
        (a, b) =>
          Number(b.status === 'abierto') - Number(a.status === 'abierto') ||
          Number(b.level === 'agotado') - Number(a.level === 'agotado') ||
          b.created_at.localeCompare(a.created_at),
      )
      .map((s) => this.shortageView(s));
  }

  reportShortage(user: User, body: Body, opts: Opts = {}): Shortage & { merged: boolean } {
    const it = this.state.items.find((i) => i.id === Number(body.item_id));
    if (!it) throw bad('Elige el producto que falta.');
    if (!it.active) throw bad(`"${it.name}" está desactivado en inventario.`);
    const level = oneOf(body.level, 'qué tanto falta', ['poco', 'agotado'] as const);
    const note = optStr(body.note, 200);
    const at = opts.at ?? nowIso();
    const ex = this.state.shortages.filter((s) => s.item_id === it.id && (s.status === 'abierto' || s.status === 'pedido')).pop();
    if (ex) {
      ex.level = ex.level === 'agotado' || level === 'agotado' ? 'agotado' : 'poco';
      if (note) ex.note = (ex.note ? `${ex.note} · ${note}` : note).slice(0, 400);
      ex.updated_at = at;
      return { ...this.shortageView(ex), merged: true };
    }
    const s: ShortageRec = { id: this.state.seq.short++, item_id: it.id, level, note, status: 'abierto', reported_by: user.id, created_at: at, updated_at: at, is_demo: (opts.isDemo ?? this.state.demoMode) ? 1 : 0 };
    this.state.shortages.push(s);
    return { ...this.shortageView(s), merged: false };
  }

  setShortageStatus(id: number, body: Body): Shortage {
    const s = this.state.shortages.find((x) => x.id === id);
    if (!s) throw notFound('Faltante no encontrado.');
    const status = oneOf(body.status, 'estado', ['abierto', 'pedido', 'recibido', 'descartado'] as const);
    if (status === 'recibido') throw bad('Para marcarlo como recibido registra la entrada de mercancía: así suma al inventario.');
    if (s.status === 'recibido') throw conflict('Este faltante ya se recibió.');
    s.status = status;
    s.updated_at = nowIso();
    return this.shortageView(s);
  }

  shoppingList(): ShoppingLine[] {
    const open = new Map<number, ShortageRec>();
    for (const s of this.state.shortages) if (s.status === 'abierto' || s.status === 'pedido') open.set(s.item_id, s);
    const lines = this.state.items
      .filter((i) => i.active && (open.has(i.id) || (i.kind === 'insumo' && i.min_m > 0 && i.qty_m <= i.min_m)))
      .map((i) => {
        const s = open.get(i.id);
        return {
          item_id: i.id,
          name: i.name,
          location: i.location,
          category: i.category,
          unit: i.unit,
          base_unit: i.base_unit,
          qty_m: i.qty_m,
          min_m: i.min_m,
          status: stockStatus(i.qty_m, i.min_m),
          suggested_m: i.min_m > 0 ? Math.max(0, i.min_m * 2 - i.qty_m) : 0,
          shortage: s
            ? { id: s.id, level: s.level, status: s.status, note: s.note, reported_by_name: this.state.users.find((u) => u.id === s.reported_by)?.name ?? '—', created_at: s.created_at }
            : null,
        };
      });
    const rank = (l: ShoppingLine) => (l.shortage?.level === 'agotado' || l.status === 'agotado' ? 0 : 1);
    return lines.sort((a, b) => rank(a) - rank(b) || a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'es'));
  }

  // ---------- Conteos ----------

  countSheet(location: unknown): CountSheet {
    const loc = oneOf(location, 'ubicación', LOCATIONS);
    const lines = this.state.items
      .filter((i) => i.active && i.location === loc)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'))
      .map((i) => ({ item_id: i.id, name: i.name, unit: i.unit, base_unit: i.base_unit, qty_m: i.qty_m, pack_size_m: i.pack_size_m, pack_label: i.pack_label, kind: i.kind }));
    return { location: loc, lines };
  }

  private countView(c: CountRec, withLines: boolean): Count {
    const diff = c.lines.filter((l) => l.counted_m !== l.expected_m).length;
    const { lines, ...rest } = c;
    return {
      ...rest,
      kind: c.kind ?? 'libre', // los conteos guardados antes no tenían tipo
      counted_by_name: this.state.users.find((u) => u.id === c.counted_by)?.name ?? '—',
      reviewed_by_name: this.state.users.find((u) => u.id === c.reviewed_by)?.name ?? null,
      lines_count: lines.length,
      diff_count: diff,
      lines: withLines
        ? lines.map((l) => {
            const it = this.item(l.item_id);
            return { ...l, unit: it.unit, base_unit: it.base_unit, diff_m: l.counted_m - l.expected_m };
          })
        : undefined,
    };
  }

  getCount(user: User, id: number): Count {
    const c = this.state.counts.find((x) => x.id === id);
    if (!c || (!can(user, 'kitchen.manage') && c.counted_by !== user.id)) throw notFound('Conteo no encontrado.');
    return this.countView(c, true);
  }

  listCounts(user: User, q: { status?: string; limit?: number }): Count[] {
    return this.state.counts
      .filter((c) => (can(user, 'kitchen.manage') || c.counted_by === user.id) && (!q.status || c.status === q.status))
      .sort((a, b) => Number(b.status === 'pendiente') - Number(a.status === 'pendiente') || b.counted_at.localeCompare(a.counted_at))
      .slice(0, Math.min(q.limit ?? 50, 200))
      .map((c) => this.countView(c, false));
  }

  submitCount(user: User, body: Body, opts: Opts = {}): Count {
    const sheet = this.countSheet(body.location);
    const byId = new Map(sheet.lines.map((l) => [l.item_id, l]));
    if (!Array.isArray(body.lines)) throw bad('El conteo no es válido.');
    const seen = new Set<number>();
    const lines = (body.lines as Body[]).map((l) => {
      const it = byId.get(Number(l.item_id));
      if (!it) throw bad(`Un producto del conteo no está en ${sheet.location}.`);
      if (seen.has(it.item_id)) throw bad(`"${it.name}" está repetido en el conteo.`);
      seen.add(it.item_id);
      return { item_id: it.item_id, item_name: it.name, expected_m: it.qty_m, counted_m: toMilli(num(l.qty, `cantidad de ${it.name}`), unitFor(l.unit, it.unit, it.name)) };
    });
    if (!lines.length) throw bad('Escribe la cantidad de al menos un producto.');
    const at = opts.at ?? nowIso();
    const kind: CountKind = body.kind === undefined ? 'libre' : oneOf(body.kind, 'tipo de conteo', COUNT_KINDS);
    // Corregir la apertura o el cierre reemplaza el que estaba sin revisar (igual que el servidor).
    if (kind !== 'libre') {
      for (const x of this.state.counts) {
        if (x.location === sheet.location && x.kind === kind && x.local_date === dayOf(at) && x.status === 'pendiente') {
          Object.assign(x, { status: 'descartado', reviewed_by: user.id, reviewed_at: at });
        }
      }
    }
    const c: CountRec = {
      id: this.state.seq.count++,
      location: sheet.location,
      kind,
      status: 'pendiente',
      note: optStr(body.note, 300),
      counted_by: user.id,
      counted_at: at,
      local_date: dayOf(at),
      reviewed_by: null,
      reviewed_at: null,
      is_demo: (opts.isDemo ?? this.state.demoMode) ? 1 : 0,
      lines,
    };
    this.state.counts.push(c);
    if (can(user, 'kitchen.manage') && body.apply !== false) this.applyCount(user, c, at);
    return this.countView(c, true);
  }

  /** El último conteo (no descartado) de ese tipo, en esa ubicación y ese día. */
  private lastCount(location: Location, kind: CountKind, date: string) {
    const c = this.state.counts
      .filter((x) => x.location === location && (x.kind ?? 'libre') === kind && x.local_date === date && x.status !== 'descartado')
      .sort((a, b) => b.counted_at.localeCompare(a.counted_at))[0];
    if (!c) return null;
    return { id: c.id, counted_by_name: this.state.users.find((u) => u.id === c.counted_by)?.name ?? '—', counted_at: c.counted_at, status: c.status };
  }

  dayCountStatus(date = localDate()): DayCountStatus[] {
    const used = new Set(this.state.items.filter((i) => i.active).map((i) => i.location));
    return LOCATIONS.filter((l) => used.has(l)).map((location) => ({
      location,
      apertura: this.lastCount(location, 'apertura', date),
      cierre: this.lastCount(location, 'cierre', date),
    }));
  }

  /** «Caja vs cocina»: igual que en el servidor (server/services/counts.ts → reconciliation). */
  reconciliation(date: unknown): Reconciliation {
    if (typeof date !== 'string' || !isYmd(date)) throw bad('Fecha no válida.');
    const status = this.dayCountStatus(date);
    const lines: ReconciliationLine[] = [];
    for (const s of status) {
      if (!s.apertura || !s.cierre || s.cierre.counted_at <= s.apertura.counted_at) continue;
      const openRec = this.state.counts.find((c) => c.id === s.apertura!.id)!;
      const closeRec = this.state.counts.find((c) => c.id === s.cierre!.id)!;
      const close = new Map(closeRec.lines.map((l) => [l.item_id, l.counted_m]));
      const from = s.apertura.counted_at;
      const to = s.cierre.counted_at;
      const open = openRec.lines.map((l) => ({ l, it: this.item(l.item_id) })).sort((a, b) => a.it.sort_order - b.it.sort_order || a.it.name.localeCompare(b.it.name, 'es'));
      for (const { l, it } of open) {
        const closeM = close.get(l.item_id);
        if (closeM === undefined) continue;
        let entries = 0;
        let produced = 0;
        let used = 0;
        let waste = 0;
        let sales = 0;
        for (const m of this.state.movements) {
          if (m.item_id !== it.id || m.created_at < from || m.created_at >= to) continue;
          if (m.type === 'entrada' && m.delta_m > 0) entries += m.delta_m;
          else if (m.type === 'produccion') {
            if (m.delta_m > 0) produced += m.delta_m;
            else used -= m.delta_m;
          } else if (m.type === 'baja' && m.delta_m < 0) waste -= m.delta_m;
          else if (m.type === 'venta' && m.delta_m < 0) sales -= m.delta_m;
          else if (m.type === 'anulacion' && m.delta_m > 0) sales -= m.delta_m;
        }
        const real = realConsumption({ openM: l.counted_m, closeM, entriesM: entries, producedM: produced, usedForPrepM: used, wasteM: waste });
        lines.push({
          item_id: it.id,
          name: it.name,
          location: it.location,
          unit: it.unit,
          base_unit: it.base_unit,
          open_m: l.counted_m,
          entries_m: entries,
          produced_m: produced,
          used_m: used,
          waste_m: waste,
          close_m: closeM,
          real_m: real,
          sales_m: sales,
          diff_m: real - sales,
        });
      }
    }
    return { date, status, lines };
  }

  /** Hoja de inventario diario: igual que el servidor (server/services/counts.ts → inventorySheet). */
  inventorySheet(user: User, date: unknown): InventorySheet {
    if (typeof date !== 'string' || !isYmd(date)) throw bad('Fecha no válida.');
    const admin = can(user, 'kitchen.manage');
    const valuesOf = (id?: number) => {
      const c = id ? this.state.counts.find((x) => x.id === id) : undefined;
      return c ? new Map(c.lines.map((l) => [l.item_id, l.counted_m])) : null;
    };
    const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00-05:00`).toISOString();
    const sections = this.dayCountStatus(date).map((s) => {
      const open = valuesOf(s.apertura?.id);
      const close = valuesOf(s.cierre?.id);
      const prevClose = valuesOf(this.lastCount(s.location, 'cierre', addDays(date, -1))?.id);
      const from = s.apertura?.counted_at ?? dayStart(date);
      const to = s.cierre && s.cierre.counted_at > from ? s.cierre.counted_at : dayStart(addDays(date, 1));
      const lines = this.state.items
        .filter((i) => i.active && i.location === s.location)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'))
        .map((i) => {
          let entries = 0;
          let produced = 0;
          let sales = 0;
          for (const m of this.state.movements) {
            if (m.item_id !== i.id || m.created_at < from || m.created_at >= to) continue;
            if (m.type === 'entrada' && m.delta_m > 0) entries += m.delta_m;
            else if (m.type === 'produccion' && m.delta_m > 0) produced += m.delta_m;
            else if (m.type === 'venta' && m.delta_m < 0) sales -= m.delta_m;
            else if (m.type === 'anulacion' && m.delta_m > 0) sales -= m.delta_m;
          }
          const openM = open?.get(i.id) ?? null;
          const closeM = close?.get(i.id) ?? null;
          return {
            item_id: i.id,
            name: i.name,
            unit: i.unit,
            base_unit: i.base_unit,
            pack_size_m: i.pack_size_m,
            pack_label: i.pack_label,
            open_m: openM,
            entries_m: entries,
            produced_m: produced,
            close_m: closeM,
            consumption_m: openM !== null && closeM !== null ? openM + entries + produced - closeM : null,
            sales_m: admin ? sales : null,
            prev_close_m: prevClose?.get(i.id) ?? null,
          };
        });
      return { location: s.location, apertura: s.apertura, cierre: s.cierre, lines };
    });
    return { date, sections };
  }

  private applyCount(admin: User, c: CountRec, at: string) {
    for (const l of c.lines) {
      const diff = l.counted_m - l.expected_m;
      if (!diff) continue;
      const delta = Math.max(diff, -this.item(l.item_id).qty_m);
      if (delta) this.applyMovement({ itemId: l.item_id, delta, type: 'conteo', reason: `Conteo de ${c.location} #${c.id} (${diff > 0 ? 'sobraba' : 'faltaba'})`, user: admin, at, isDemo: !!c.is_demo });
    }
    Object.assign(c, { status: 'aplicado', reviewed_by: admin.id, reviewed_at: at });
  }

  reviewCount(admin: User, id: number, body: Body, opts: Opts = {}): Count {
    const c = this.state.counts.find((x) => x.id === id);
    if (!c) throw notFound('Conteo no encontrado.');
    if (c.status !== 'pendiente') throw conflict('Este conteo ya fue revisado.');
    const decision = oneOf(body.decision, 'decisión', ['aplicar', 'descartar'] as const);
    const at = opts.at ?? nowIso();
    if (decision === 'aplicar') this.applyCount(admin, c, at);
    else Object.assign(c, { status: 'descartado', reviewed_by: admin.id, reviewed_at: at });
    return this.countView(c, true);
  }

  // ---------- Hoja del día ----------

  private sheetRec(date: string): SheetRec | undefined {
    return this.state.daySheets[date];
  }

  private ensureSheet(date: string, isDemo?: boolean) {
    this.state.daySheets[date] ??= { status: 'abierta', note: '', validated_by_name: null, validated_at: null, is_demo: (isDemo ?? this.state.demoMode) ? 1 : 0 };
  }

  private checkSheetDate(date: unknown, today: string): string {
    if (typeof date !== 'string' || !isYmd(date)) throw bad('Fecha no válida.');
    if (date > today) throw bad('Todavía no se puede llenar la hoja de un día que no ha llegado.');
    return date;
  }

  private dayMoves(date: string): Map<number, DayMoves> {
    const from = dayStartIso(date);
    const to = dayStartIso(addDays(date, 1));
    const out = new Map<number, DayMoves>();
    for (const m of this.state.movements) {
      if (m.created_at < from || m.created_at >= to) continue;
      if (m.type !== 'entrada') continue;
      const d = out.get(m.item_id) ?? { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 };
      d.entries_m += m.delta_m;
      out.set(m.item_id, d);
    }
    const get = (id: number) => out.get(id) ?? (out.set(id, { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 }), out.get(id)!);
    for (const p of this.state.productions) {
      if (p.local_date !== date || p.status !== 'activa') continue;
      get(p.output_item_id).produced_m += p.output_m;
      for (const i of p.inputs) get(i.item_id).used_m += i.qty_m;
    }
    // Bajas del día en que se reportaron (lo que salió de la nevera), menos las rechazadas.
    for (const w of this.state.wastes) {
      if (w.local_date !== date || w.status === 'rechazada') continue;
      const d = out.get(w.item_id) ?? { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 };
      d.waste_m += w.qty_m;
      out.set(w.item_id, d);
    }
    return out;
  }

  private stockAt(itemId: number, iso: string): number {
    let best: Movement | null = null;
    for (const m of this.state.movements) {
      if (m.item_id !== itemId || m.created_at >= iso) continue;
      if (!best || m.created_at > best.created_at || (m.created_at === best.created_at && m.id > best.id)) best = m;
    }
    return best?.after_m ?? 0;
  }

  daySheet(date: unknown, today = localDate()): DaySheet {
    const d = this.checkSheetDate(date, today);
    const rec = this.sheetRec(d);
    const stored = new Map(this.state.sheetLines.filter((l) => l.local_date === d).map((l) => [l.item_id, l]));
    const moves = this.dayMoves(d);
    const sales = new Map<number, number>();
    const soldBy = new Map<number, SoldProduct>();
    for (const s of this.state.sales) {
      if (s.local_date !== d || s.status !== 'confirmada') continue;
      for (const c of s.consumption) sales.set(c.item_id, (sales.get(c.item_id) ?? 0) + c.total_m);
      for (const i of s.items) {
        const p = soldBy.get(i.product_id) ?? { product_id: i.product_id, product_name: i.product_name, qty: 0 };
        p.qty += i.qty;
        soldBy.set(i.product_id, p);
      }
    }
    // Último fin contado antes de esta fecha, por ingrediente.
    const prev = new Map<number, { date: string; m: number }>();
    for (const l of this.state.sheetLines) {
      if (l.local_date >= d || l.close_m === null) continue;
      const p = prev.get(l.item_id);
      if (!p || l.local_date > p.date) prev.set(l.item_id, { date: l.local_date, m: l.close_m });
    }
    const empty: DayMoves = { entries_m: 0, produced_m: 0, used_m: 0, waste_m: 0 };
    const lines = sortSheet(
      this.state.items
        .filter((i) => i.active || stored.has(i.id))
        .map((i) =>
          sheetLine(
            {
              item_id: i.id,
              name: i.name,
              location: i.location,
              kind: i.kind,
              unit: i.unit,
              base_unit: i.base_unit,
              pack_size_m: i.pack_size_m,
              pack_label: i.pack_label,
              sort_order: i.sort_order,
              stock_m: i.qty_m,
            },
            stored.get(i.id),
            moves.get(i.id) ?? empty,
            sales.get(i.id) ?? 0,
            prev.get(i.id)?.m ?? null,
          ),
        ),
      LOCATIONS,
    );
    const sold = [...soldBy.values()].sort((a, b) => b.qty - a.qty || a.product_name.localeCompare(b.product_name, 'es'));
    const status = rec?.status ?? 'abierta';
    return {
      date: d,
      status,
      validated_by_name: rec?.validated_by_name ?? null,
      validated_at: rec?.validated_at ?? null,
      note: rec?.note ?? '',
      editable: status === 'abierta',
      entries_editable: status === 'abierta' && d === today,
      lines,
      sold,
      sold_units: sold.reduce((s, p) => s + p.qty, 0),
      summary: summarize(lines),
    };
  }

  setCell(user: User, body: Body, opts: Opts = {}): DaySheetLine {
    const at = opts.at ?? nowIso();
    const today = dayOf(at);
    const date = this.checkSheetDate(body.date, today);
    const field = oneOf(body.field, 'casilla', SHEET_FIELDS);
    const it = this.item(Number(body.item_id));
    const raw = body.value_m;
    const value = raw === null || raw === undefined || raw === '' ? null : Math.round(num(raw, `cantidad de ${it.name}`));
    if (this.sheetRec(date)?.status === 'validada') throw conflict('Esta hoja ya fue validada. Para corregirla, el administrador debe volver a abrirla.');
    if (field === 'entry') {
      if (date !== today) throw bad('Lo que llegó solo se anota el mismo día.');
      if (!it.active) throw conflict(`"${it.name}" está desactivado.`);
      this.ensureSheet(date, opts.isDemo);
      const current = this.dayMoves(date).get(it.id)?.entries_m ?? 0;
      const delta = Math.max((value ?? 0) - current, -it.qty_m);
      if (delta !== 0) {
        this.applyMovement({
          itemId: it.id,
          delta,
          type: 'entrada',
          reason: delta > 0 ? 'Llegó (hoja del día)' : 'Corrección de lo que llegó (hoja del día)',
          user,
          at,
          isDemo: opts.isDemo,
        });
      }
      // Lo que llegó cierra los faltantes reportados de ese ingrediente.
      if (delta > 0) {
        for (const s of this.state.shortages) {
          if (s.item_id === it.id && (s.status === 'abierto' || s.status === 'pedido')) Object.assign(s, { status: 'recibido', updated_at: at });
        }
      }
    } else {
      this.ensureSheet(date, opts.isDemo);
      let line = this.state.sheetLines.find((l) => l.local_date === date && l.item_id === it.id);
      if (!line && value !== null) {
        line = { local_date: date, item_id: it.id, open_m: null, close_m: null, close_sys_m: null, adj_m: 0, updated_at: at, is_demo: (opts.isDemo ?? this.state.demoMode) ? 1 : 0 };
        this.state.sheetLines.push(line);
      }
      if (line) {
        line.updated_at = at;
        if (field === 'open') line.open_m = value;
        else {
          line.close_m = value;
          // Lo que decía el sistema al contar: al validar se ajusta contra ese momento.
          line.close_sys_m = value === null ? null : date === today ? it.qty_m : this.stockAt(it.id, dayStartIso(addDays(date, 1)));
        }
      }
    }
    const l = this.daySheet(date, today).lines.find((x) => x.item_id === it.id);
    if (!l) throw notFound('Ingrediente no encontrado.');
    return l;
  }

  fillOpen(body: Body, opts: Opts = {}): DaySheet {
    const at = opts.at ?? nowIso();
    const today = dayOf(at);
    const date = this.checkSheetDate(body.date, today);
    const source = oneOf(body.source ?? 'ayer', 'origen', ['ayer', 'sistema'] as const);
    if (this.sheetRec(date)?.status === 'validada') throw conflict('Esta hoja ya fue validada.');
    let filled = 0;
    for (const l of this.daySheet(date, today).lines) {
      if (l.open_m !== null) continue;
      const v = source === 'ayer' ? l.prev_close_m : l.stock_m;
      if (v === null) continue;
      const rec = this.state.sheetLines.find((x) => x.local_date === date && x.item_id === l.item_id);
      if (rec) Object.assign(rec, { open_m: v, updated_at: at });
      else this.state.sheetLines.push({ local_date: date, item_id: l.item_id, open_m: v, close_m: null, close_sys_m: null, adj_m: 0, updated_at: at, is_demo: this.state.demoMode ? 1 : 0 });
      filled++;
    }
    if (!filled) throw bad(source === 'ayer' ? 'No hay un fin del día anterior para copiar (o el inicio ya está lleno).' : 'El inicio ya está lleno.');
    this.ensureSheet(date);
    return this.daySheet(date, today);
  }

  validateDay(user: User, body: Body, opts: Opts = {}): DaySheet {
    const at = opts.at ?? nowIso();
    const today = dayOf(at);
    const date = this.checkSheetDate(body.date, today);
    if (this.sheetRec(date)?.status === 'validada') throw conflict('Esta hoja ya fue validada.');
    const lines = this.state.sheetLines.filter((l) => l.local_date === date && l.close_m !== null);
    if (!lines.length) throw bad('Primero escribe el Fin (lo que quedó al cerrar) de al menos un ingrediente.');
    this.ensureSheet(date, opts.isDemo);
    for (const l of lines) {
      if (l.close_sys_m === null) continue;
      const delta = Math.max(l.close_m! - l.close_sys_m, -this.item(l.item_id).qty_m);
      if (delta !== 0) {
        this.applyMovement({ itemId: l.item_id, delta, type: 'conteo', reason: `Hoja del ${date} (${delta > 0 ? 'sobraba' : 'faltaba'})`, user, at, isDemo: opts.isDemo });
      }
      l.adj_m = delta;
    }
    Object.assign(this.state.daySheets[date], { status: 'validada', note: optStr(body.note, 500), validated_by_name: user.name, validated_at: at });
    return this.daySheet(date, today);
  }

  reopenDay(user: User, body: Body): DaySheet {
    const at = nowIso();
    const today = dayOf(at);
    const date = this.checkSheetDate(body.date, today);
    if (this.sheetRec(date)?.status !== 'validada') throw conflict('Esta hoja no está validada.');
    for (const l of this.state.sheetLines) {
      if (l.local_date !== date || !l.adj_m) continue;
      const delta = Math.max(-l.adj_m, -this.item(l.item_id).qty_m);
      if (delta !== 0) this.applyMovement({ itemId: l.item_id, delta, type: 'conteo', reason: `Se volvió a abrir la hoja del ${date}`, user, at });
      l.adj_m = 0;
    }
    Object.assign(this.state.daySheets[date], { status: 'abierta', validated_by_name: null, validated_at: null });
    return this.daySheet(date, today);
  }

  sheetDays(from: string, to: string) {
    if (!isYmd(from) || !isYmd(to)) throw bad('Fecha no válida.');
    return Object.entries(this.state.daySheets)
      .filter(([d]) => d >= from && d <= to)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, r]) => {
        const lines = this.state.sheetLines.filter((l) => l.local_date === date);
        return {
          date,
          status: r.status,
          validated_at: r.validated_at,
          validated_by_name: r.validated_by_name,
          open_filled: lines.filter((l) => l.open_m !== null).length,
          close_filled: lines.filter((l) => l.close_m !== null).length,
        };
      });
  }

  addIngredient(user: User, body: Body): Item {
    const location = oneOf(body.location, 'lugar', LOCATIONS);
    const kind = body.kind === 'preparacion' ? 'preparacion' : 'insumo';
    const last = this.state.items.filter((i) => i.location === location).reduce((m, i) => Math.max(m, i.sort_order), 0);
    const category = typeof body.category === 'string' && body.category ? body.category : kind === 'preparacion' ? 'Productos preparados' : 'Ingredientes';
    return this.createItem(user, {
      name: body.name,
      category,
      unit: body.unit,
      qty: 0,
      min: body.min ?? 0,
      location,
      kind,
      sort_order: last + 10,
      pack_size: body.pack_size,
      pack_unit: body.pack_unit,
      pack_label: body.pack_label,
    });
  }

  /** Cambia la unidad base de un ingrediente y convierte todo lo guardado con el mismo factor. */
  private changeItemBase(id: number, unit: Unit, perUnit: unknown) {
    const it = this.item(id);
    const to = baseOf(unit);
    if (to === it.base_unit) return;
    const needsWeight = it.base_unit === 'unidad' || to === 'unidad';
    const per = needsWeight ? num(perUnit, `cuánto ${it.base_unit === 'ml' || to === 'ml' ? 'mide' : 'pesa'} una unidad`, { allowZero: false }) : 1;
    const f = baseChangeFactor(it.base_unit, to, per);
    const r = (n: number) => Math.round(n * f);
    const rp = (n: number) => Math.max(1, r(n));
    const rn = (n: number | null) => (n === null ? null : r(n));
    const small: Unit = to === 'g' ? 'g' : to === 'ml' ? 'ml' : 'unidad';
    Object.assign(it, { base_unit: to, unit, qty_m: r(it.qty_m), min_m: r(it.min_m), pack_size_m: r(it.pack_size_m), updated_at: nowIso() });
    it.status = stockStatus(it.qty_m, it.min_m);
    for (const p of this.state.products) for (const l of p.recipe) if (l.item_id === id) Object.assign(l, { qty_m: rp(l.qty_m), unit: small });
    for (const p of this.state.preparations) {
      for (const l of p.inputs) if (l.item_id === id) Object.assign(l, { qty_m: rp(l.qty_m), unit: small });
      if (p.output_item_id === id) {
        p.std_output_m = rp(p.std_output_m);
        for (const t of this.state.tasks) if (t.preparation_id === p.id && t.target_m !== null) t.target_m = r(t.target_m);
      }
    }
    for (const m of this.state.movements) if (m.item_id === id) Object.assign(m, { delta_m: r(m.delta_m), after_m: r(m.after_m), base_unit: to, unit });
    for (const s of this.state.sales) for (const c of s.consumption) if (c.item_id === id) Object.assign(c, { per_unit_m: r(c.per_unit_m), total_m: r(c.total_m), base_unit: to });
    for (const p of this.state.productions) {
      for (const l of p.inputs) if (l.item_id === id) l.qty_m = rp(l.qty_m);
      if (p.output_item_id === id) Object.assign(p, { output_m: rp(p.output_m), expected_m: r(p.expected_m), merma_util_m: r(p.merma_util_m), merma_inutil_m: r(p.merma_inutil_m) });
    }
    for (const w of this.state.wastes) if (w.item_id === id) Object.assign(w, { qty_m: rp(w.qty_m), unit: small });
    for (const c of this.state.counts) for (const l of c.lines) if (l.item_id === id) Object.assign(l, { expected_m: r(l.expected_m), counted_m: r(l.counted_m) });
    for (const l of this.state.sheetLines) {
      if (l.item_id === id) Object.assign(l, { open_m: rn(l.open_m), close_m: rn(l.close_m), close_sys_m: rn(l.close_sys_m), adj_m: r(l.adj_m) });
    }
  }

  editIngredient(id: number, body: Body): Item {
    const it = this.item(id);
    const wasActive = it.active;
    if (body.unit !== undefined) {
      if (!isUnit(body.unit)) throw bad('Unidad de medida no válida.');
      this.changeItemBase(id, body.unit, body.per_unit);
    }
    const updated = this.updateItem(id, {
      name: body.name,
      location: body.location,
      kind: body.kind,
      unit: body.unit,
      min: body.min,
      pack_size: body.pack_size,
      pack_unit: body.pack_unit,
      pack_label: body.pack_label,
      category: typeof body.category === 'string' && body.category ? body.category : undefined,
    });
    if (body.active === false && wasActive) return this.setItemActive(id, false);
    return updated;
  }

  // ---------- Plan de preparación ----------

  private taskView(t: TaskRec): PrepTask {
    const p = this.prep(t.preparation_id);
    const out = this.item(p.output_item_id);
    const pr = t.production_id ? this.state.productions.find((x) => x.id === t.production_id) : undefined;
    return {
      ...t,
      preparation_name: p.name,
      output_unit: out.unit,
      done_by_name: pr ? (this.state.users.find((u) => u.id === pr.user_id)?.name ?? '—') : null,
      done_at: pr?.created_at ?? null,
      done_output_m: pr?.output_m ?? null,
    };
  }

  tasksBetween(from: string, to: string): PrepTask[] {
    return this.state.tasks
      .filter((t) => t.local_date >= from && t.local_date <= to)
      .sort((a, b) => a.local_date.localeCompare(b.local_date) || a.id - b.id)
      .map((t) => this.taskView(t));
  }

  weekPlan(date?: string | null): WeekPlan {
    const d = date && isYmd(date) ? date : localDate();
    const from = weekStart(d);
    const to = weekEnd(d);
    return { from, to, tasks: this.tasksBetween(from, to) };
  }

  addTask(body: Body, opts: Opts = {}): PrepTask {
    if (typeof body.date !== 'string' || !isYmd(body.date)) throw bad('La fecha no es válida.');
    const p = this.state.preparations.find((x) => x.id === Number(body.preparation_id));
    if (!p) throw bad('Elige qué se va a preparar.');
    if (!p.active) throw bad(`"${p.name}" está desactivada.`);
    const out = this.item(p.output_item_id);
    let target: number | null = null;
    if (body.target_qty !== undefined && body.target_qty !== null && body.target_qty !== '') {
      target = toMilli(num(body.target_qty, 'cantidad objetivo', { allowZero: false }), unitFor(body.target_unit, out.unit, out.name));
    }
    const t: TaskRec = {
      id: this.state.seq.task++,
      local_date: body.date,
      preparation_id: p.id,
      target_m: target,
      note: optStr(body.note, 200),
      production_id: null,
      is_demo: (opts.isDemo ?? this.state.demoMode) ? 1 : 0,
    };
    this.state.tasks.push(t);
    return this.taskView(t);
  }

  deleteTask(id: number) {
    const t = this.state.tasks.find((x) => x.id === id);
    if (!t) throw notFound('Tarea no encontrada.');
    if (t.production_id) throw bad('Esta tarea ya se hizo; no se puede quitar del plan.');
    this.state.tasks = this.state.tasks.filter((x) => x.id !== id);
    return { ok: true };
  }

  copyPreviousWeek(date: unknown) {
    if (typeof date !== 'string' || !isYmd(date)) throw bad('La fecha no es válida.');
    const from = weekStart(date);
    const prev = this.state.tasks.filter((t) => t.local_date >= addDays(from, -7) && t.local_date <= addDays(from, -1));
    if (!prev.length) throw bad('La semana anterior no tiene plan para copiar.');
    let added = 0;
    for (const t of prev) {
      const day = addDays(t.local_date, 7);
      if (this.state.tasks.some((x) => x.local_date === day && x.preparation_id === t.preparation_id)) continue;
      this.state.tasks.push({ ...t, id: this.state.seq.task++, local_date: day, production_id: null, is_demo: this.state.demoMode ? 1 : 0 });
      added++;
    }
    return { added, ...this.weekPlan(date) };
  }

  kitchenToday(user: User): KitchenToday {
    const today = localDate();
    return {
      today,
      tasks: this.tasksBetween(today, today),
      productions: this.listProductions({ from: today, to: today, userId: user.id, limit: 50 }),
      wastes: this.listWastes(user, { from: today, to: today }).filter((w) => w.reported_by === user.id),
      shortages: this.listShortages('open'),
      counts: this.listCounts(user, {}).filter((c) => c.local_date === today && c.counted_by === user.id),
      dayCounts: this.dayCountStatus(today),
    };
  }

  // ---------- Reportes ----------

  private confirmedIn(from: string, to: string) {
    return this.state.sales.filter((s) => s.status === 'confirmada' && s.local_date >= from && s.local_date <= to);
  }
  private units(from: string, to: string) {
    return this.confirmedIn(from, to).reduce((s, x) => s + x.total_units, 0);
  }
  private byProduct(from: string, to: string) {
    const m = new Map<number, { product_id: number; name: string; units: number }>();
    for (const s of this.confirmedIn(from, to)) {
      for (const i of s.items) {
        const cur = m.get(i.product_id) ?? { product_id: i.product_id, name: this.state.products.find((p) => p.id === i.product_id)?.name ?? i.product_name, units: 0 };
        cur.units += i.qty;
        m.set(i.product_id, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  }

  dashboard(): Dashboard {
    const today = localDate();
    const week = { from: weekStart(today), to: today };
    const month = { from: monthStart(today), to: today };
    const active = this.state.items.filter((i) => i.active);
    const alerts = active
      .filter((i) => i.qty_m <= i.min_m)
      .map((i) => ({ id: i.id, name: i.name, category: i.category, base_unit: i.base_unit, unit: i.unit, qty_m: i.qty_m, min_m: i.min_m, status: stockStatus(i.qty_m, i.min_m) }))
      .sort((a, b) => a.qty_m / Math.max(a.min_m, 1) - b.qty_m / Math.max(b.min_m, 1));
    return {
      today,
      ranges: { week, month },
      units: { today: this.units(today, today), week: this.units(week.from, week.to), month: this.units(month.from, month.to) },
      stock: { total: active.length, low: alerts.filter((a) => a.status === 'bajo').length, out: alerts.filter((a) => a.status === 'agotado').length },
      recent: [...this.state.sales]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8)
        .map((s) => ({ id: s.id, created_at: s.created_at, total_units: s.total_units, status: s.status, is_demo: s.is_demo, user_name: s.user_name, items: s.items })),
      alerts,
      hasSales: this.state.sales.some((s) => s.status === 'confirmada'),
      kitchen: {
        pendingWastes: this.state.wastes.filter((w) => w.status === 'pendiente').length,
        openShortages: this.state.shortages.filter((s) => s.status === 'abierto' || s.status === 'pedido').length,
        pendingCounts: this.state.counts.filter((c) => c.status === 'pendiente').length,
        tasksToday: {
          total: this.state.tasks.filter((t) => t.local_date === today).length,
          done: this.state.tasks.filter((t) => t.local_date === today && t.production_id).length,
        },
        productionsWeek: this.state.productions.filter((p) => p.status === 'activa' && p.local_date >= week.from && p.local_date <= today).length,
        lowYield: this.listProductions({ from: addDays(today, -6), to: today, limit: 200 })
          .filter((p) => p.status === 'activa' && p.low)
          .slice(0, 5)
          .map((p) => ({ id: p.id, preparation_name: p.preparation_name, efficiency_pct: p.efficiency_pct, local_date: p.local_date, user_name: p.user_name })),
      },
    };
  }

  private range(kind: string, today = localDate()) {
    switch (kind) {
      case 'dia':
        return { from: today, to: today };
      case '7d':
        return { from: addDays(today, -6), to: today };
      case 'semana':
        return { from: weekStart(today), to: today };
      case '30d':
        return { from: addDays(today, -29), to: today };
      case 'mes':
        return { from: monthStart(today), to: today };
      default:
        throw bad('Período no válido.');
    }
  }

  charts(seriesKey: string, topKey: string): Charts {
    const s = this.range(seriesKey);
    const t = this.range(topKey);
    return {
      series: {
        range: s,
        data: daysBetween(s.from, s.to).map((d) => {
          const day = this.confirmedIn(d, d);
          return { date: d, units: day.reduce((n, x) => n + x.total_units, 0), sales: day.length };
        }),
      },
      top: { range: t, data: this.byProduct(t.from, t.to) },
    };
  }

  private periodRange(period: string, date: string) {
    if (!isYmd(date)) throw bad('Fecha no válida.');
    if (period === 'dia') return { range: { from: date, to: date }, prev: { from: addDays(date, -1), to: addDays(date, -1) } };
    if (period === 'semana') {
      const range = { from: weekStart(date), to: weekEnd(date) };
      return { range, prev: comparablePrev(range, { from: addDays(range.from, -7), to: addDays(range.to, -7) }, localDate()) };
    }
    if (period === 'mes') {
      const pm = prevMonthStart(date);
      const range = { from: monthStart(date), to: monthEnd(date) };
      return { range, prev: comparablePrev(range, { from: pm, to: monthEnd(pm) }, localDate()) };
    }
    throw bad('Período no válido.');
  }

  reports(period: string, date: string): PeriodReport {
    const { range, prev } = this.periodRange(period, date);
    const confirmed = this.confirmedIn(range.from, range.to);
    const cons = new Map<number, number>();
    for (const s of confirmed) for (const c of s.consumption) cons.set(c.item_id, (cons.get(c.item_id) ?? 0) + c.total_m);
    let evolution: PeriodReport['evolution'] = [];
    if (period === 'semana') evolution = daysBetween(range.from, range.to).map((d) => ({ label: d, from: d, to: d, units: this.units(d, d) }));
    else if (period === 'mes') {
      for (let start = range.from; start <= range.to; ) {
        const end = weekEnd(start) < range.to ? weekEnd(start) : range.to;
        evolution.push({ label: `${start}|${end}`, from: start, to: end, units: this.units(start, end) });
        start = addDays(end, 1);
      }
    }
    return {
      period: period as PeriodReport['period'],
      range,
      prev,
      total: confirmed.reduce((s, x) => s + x.total_units, 0),
      prevTotal: this.units(prev.from, prev.to),
      salesCount: confirmed.length,
      annulled: this.state.sales.filter((s) => s.status === 'anulada' && s.local_date >= range.from && s.local_date <= range.to).length,
      byProduct: this.byProduct(range.from, range.to),
      prevByProduct: this.byProduct(prev.from, prev.to),
      consumption: [...cons]
        .map(([item_id, total_m]) => {
          const it = this.item(item_id);
          return { item_id, name: it.name, base_unit: it.base_unit, unit: it.unit, total_m };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      evolution,
    };
  }

  kitchenReport(period: string, date: string): KitchenReport {
    const { range } = this.periodRange(period, date);
    const prods = this.listProductions({ from: range.from, to: range.to, limit: 500 }).filter((p) => p.status === 'activa');
    const byPrep = new Map<number, KitchenReport['productions'][number]>();
    for (const p of prods) {
      const g = byPrep.get(p.preparation_id) ?? { preparation_id: p.preparation_id, name: p.preparation_name, unit: p.output_unit, count: 0, output_m: 0, expected_m: 0, merma_m: 0, low: 0 };
      g.count++;
      g.output_m += p.output_m;
      g.expected_m += p.expected_m;
      g.merma_m += p.merma_inutil_m;
      if (p.low) g.low++;
      byPrep.set(p.preparation_id, g);
    }
    const wastes = new Map<string, KitchenReport['wastes'][number]>();
    for (const w of this.state.wastes) {
      if (w.status !== 'aprobada' || w.local_date < range.from || w.local_date > range.to) continue;
      const it = this.item(w.item_id);
      const key = `${w.item_id}|${w.reason}`;
      const g = wastes.get(key) ?? { item_id: it.id, name: it.name, unit: it.unit, base_unit: it.base_unit, reason: w.reason, count: 0, qty_m: 0 };
      g.count++;
      g.qty_m += w.qty_m;
      wastes.set(key, g);
    }
    const entries = new Map<number, KitchenReport['entries'][number]>();
    for (const m of this.state.movements) {
      if (m.type !== 'entrada') continue;
      const d = dayOf(m.created_at);
      if (d < range.from || d > range.to) continue;
      const it = this.item(m.item_id);
      const g = entries.get(it.id) ?? { item_id: it.id, name: it.name, unit: it.unit, base_unit: it.base_unit, count: 0, total_m: 0 };
      g.count++;
      g.total_m += m.delta_m;
      entries.set(it.id, g);
    }
    const diffs = new Map<number, KitchenReport['countDiffs'][number]>();
    for (const c of this.state.counts) {
      if (c.status !== 'aplicado' || c.local_date < range.from || c.local_date > range.to) continue;
      for (const l of c.lines) {
        if (l.counted_m === l.expected_m) continue;
        const it = this.item(l.item_id);
        const g = diffs.get(it.id) ?? { item_id: it.id, name: it.name, unit: it.unit, base_unit: it.base_unit, count: 0, diff_m: 0 };
        g.count++;
        g.diff_m += l.counted_m - l.expected_m;
        diffs.set(it.id, g);
      }
    }
    const wasteList = [...wastes.values()].sort((a, b) => b.qty_m - a.qty_m);
    return {
      period: period as KitchenReport['period'],
      range,
      productions: [...byPrep.values()].sort((a, b) => b.count - a.count),
      productionsCount: prods.length,
      wastes: wasteList,
      wastesCount: wasteList.reduce((s, w) => s + w.count, 0),
      entries: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
      countDiffs: [...diffs.values()].sort((a, b) => Math.abs(b.diff_m) - Math.abs(a.diff_m)),
    };
  }

  // ---------- Demostración y catálogo ----------

  demoStatus(): DemoStatus {
    const s = this.state;
    return {
      demoMode: s.demoMode,
      real: { items: s.items.filter((i) => !i.is_demo).length, products: s.products.filter((p) => !p.is_demo).length, sales: s.sales.filter((x) => !x.is_demo).length },
      demo: { items: s.items.filter((i) => i.is_demo).length, products: s.products.filter((p) => p.is_demo).length, sales: s.sales.filter((x) => x.is_demo).length },
    };
  }

  resetDemo() {
    const keepUsers = this.state.users.filter((u) => !u.is_demo);
    const current = this.state.currentUserId;
    this.state = buildDemoState(keepUsers);
    this.state.currentUserId = current;
    this.save();
  }

  clearDemo() {
    const s = this.state;
    const demoItems = new Set(s.items.filter((i) => i.is_demo).map((i) => i.id));
    s.tasks = s.tasks.filter((t) => !t.is_demo);
    s.productions = s.productions.filter((p) => !p.is_demo);
    s.wastes = s.wastes.filter((w) => !w.is_demo);
    s.shortages = s.shortages.filter((x) => !x.is_demo);
    s.counts = s.counts.filter((c) => !c.is_demo);
    s.sheetLines = s.sheetLines.filter((l) => !l.is_demo && !demoItems.has(l.item_id));
    s.daySheets = Object.fromEntries(Object.entries(s.daySheets).filter(([, r]) => !r.is_demo));
    s.preparations = s.preparations.filter((p) => !p.is_demo);
    s.movements = s.movements.filter((m) => !m.is_demo && !demoItems.has(m.item_id));
    s.sales = s.sales.filter((x) => !x.is_demo);
    s.products = s.products.filter((p) => !p.is_demo);
    s.items = s.items.filter((i) => !i.is_demo);
    s.users = s.users.filter((u) => !u.is_demo);
    s.demoMode = false;
    this.save();
  }

  loadCatalog(admin: User) {
    if (this.state.demoMode) throw conflict('Primero sal del modo demostración (Configuración → Salir del modo demo).');
    const id: Record<string, number> = {};
    let items = 0;
    CATALOG_ITEMS.forEach((c, idx) => {
      const found = this.state.items.find((i) => i.active && i.name.toLowerCase() === c.name.toLowerCase());
      if (found) {
        id[c.key] = found.id;
        return;
      }
      id[c.key] = this.createItem(admin, {
        name: c.name,
        category: c.category,
        unit: c.unit,
        qty: 0,
        min: c.min,
        location: c.location,
        kind: c.kind,
        sort_order: (idx + 1) * 10,
        pack_size: c.pack?.[0] ?? null,
        pack_unit: c.pack ? (c.unit === 'kg' ? 'g' : c.unit === 'l' ? 'ml' : c.unit) : undefined,
        pack_label: c.pack?.[1],
      }).id;
      items++;
    });
    let preparations = 0;
    for (const p of CATALOG_PREPARATIONS) {
      if (this.state.preparations.some((x) => x.active && x.name.toLowerCase() === p.name.toLowerCase())) continue;
      this.createPreparation(catalogPrepBody(p, id));
      preparations++;
    }
    let products = 0;
    for (const p of CATALOG_PRODUCTS) {
      if (this.state.products.some((x) => x.active && x.name.toLowerCase() === p.name.toLowerCase())) continue;
      this.createProduct({
        name: p.name,
        category: p.category,
        type: p.type,
        description: p.type === 'preparado' ? `${p.description} Receta sugerida: revisar cantidades.`.trim() : p.description,
        recipe: p.recipe.map(([k, qty, unit]) => ({ item_id: id[k], qty, unit })),
      });
      products++;
    }
    this.save();
    return { items, preparations, products };
  }
}

function catalogPrepBody(p: (typeof CATALOG_PREPARATIONS)[number], id: Record<string, number>): Body {
  return {
    name: p.name,
    mode: p.mode,
    output_item_id: id[p.output],
    std_output: p.stdOutput[0],
    std_output_unit: p.stdOutput[1],
    instructions: p.instructions,
    inputs: p.inputs.map(([k, qty, unit]) => ({ item_id: id[k], qty, unit })),
  };
}

// ---------- Demostración con el catálogo real de Pizza Diana ----------

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bogota = (ymd: string, h: number, m: number) => new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`).toISOString();

const WEEK_PLAN: Record<number, string[]> = {
  1: ['masa', 'cebolla_caramelizada', 'tomate_picado'],
  2: ['pechuga_desmechada', 'cebolla_picada'],
  3: ['cerdo_prep', 'pechuga_plancha'],
  4: ['tomate_picado', 'carne_molida_prep'],
  5: ['masa', 'cebolla_caramelizada', 'pechuga_desmechada'],
  6: ['tomate_picado', 'pechuga_plancha'],
  0: ['cebolla_picada', 'cerdo_prep'],
};

/**
 * Arma la demostración llamando a las MISMAS funciones que usa la aplicación
 * (ventas, preparaciones, bajas, conteos), con fechas pasadas.
 */
/**
 * Arranque en blanco: los tres usuarios de prueba, los productos de la hoja de papel (en su
 * orden y con existencia 0), las preparaciones y el menú con sus recetas. Sin ventas ni días
 * anteriores: la cocina llena la hoja desde cero.
 */
function buildBlankState(): State {
  const db = Object.create(BrowserDB.prototype) as BrowserDB;
  db.state = emptyState();
  const at = nowIso();
  const names: Record<Role, string> = { admin: 'Diana (Administradora)', caja: 'Laura (Caja)', cocina: 'Jefe de cocina' };
  db.state.users = DEMO_LOGINS.map((d, i) => ({
    id: i + 1,
    username: d.username,
    name: names[d.role],
    role: d.role,
    perms: [],
    active: true,
    is_demo: false,
    created_at: at,
    updated_at: at,
    password: d.password,
  }));
  db.state.seq.user = db.state.users.length + 1;
  db.loadCatalog(db.state.users[0]);
  return db.state;
}

function buildDemoState(keepUsers?: UserRec[]): State {
  const db = Object.create(BrowserDB.prototype) as BrowserDB;
  db.state = emptyState();
  const s = db.state;
  s.demoMode = true;
  const at0 = nowIso();
  const mk = (id: number, username: string, name: string, role: Role, pass?: string): UserRec => ({
    id,
    username,
    name,
    role,
    perms: [],
    active: true,
    is_demo: !pass,
    created_at: at0,
    updated_at: at0,
    ...(pass ? { password: pass } : {}),
  });
  if (keepUsers?.length) {
    s.users = keepUsers;
  } else {
    s.users = [mk(1, 'admin', 'Diana (Administradora)', 'admin', 'demo1234'), mk(2, 'caja', 'Laura (Caja)', 'caja', 'demo1234'), mk(3, 'cocina', 'Carlos (Cocina)', 'cocina', 'demo1234')];
  }
  s.seq.user = s.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;
  const admin = s.users.find((u) => u.role === 'admin') ?? s.users[0];
  const cashier = s.users.find((u) => u.role === 'caja') ?? admin;
  const cook1 = s.users.find((u) => u.role === 'cocina') ?? admin;
  const cook2 = mk(s.seq.user++, 'andres.demo', 'Andrés (DEMO)', 'cocina');
  s.users.push(cook2);
  const cooks = [cook1, cook1, cook2];
  const sellers = [cashier, cashier, cashier, admin];

  const rand = rng(20261015);
  const pick = <T,>(l: T[]) => l[Math.floor(rand() * l.length)];
  const now = new Date();
  const today = localDate(now);
  const DAYS = 28;
  const start = addDays(today, -DAYS);
  const t0 = bogota(start, 7, 0);
  const demo = { isDemo: true };
  const milliOf = (u: Unit) => (u === 'kg' || u === 'l' ? 1_000_000 : 1000);

  const itemId: Record<string, number> = {};
  CATALOG_ITEMS.forEach((c, idx) => {
    itemId[c.key] = db.createItem(
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
      { at: t0, ...demo },
    ).id;
  });
  const prepId: Record<string, number> = {};
  for (const p of CATALOG_PREPARATIONS) prepId[p.key] = db.createPreparation(catalogPrepBody(p, itemId), demo).id;
  const productId: Record<string, number> = {};
  for (const p of CATALOG_PRODUCTS) {
    productId[p.key] = db.createProduct(
      { name: p.name, category: p.category, type: p.type, description: p.description, recipe: p.recipe.map(([k, qty, unit]) => ({ item_id: itemId[k], qty, unit })) },
      { at: t0, ...demo },
    ).id;
  }
  const catalogByItem = new Map(CATALOG_ITEMS.map((c) => [itemId[c.key], c]));
  const prepByOutput = new Map(CATALOG_PREPARATIONS.map((p) => [itemId[p.output], p.key]));

  const buy = (id: number, missingM: number, at: string, reason: string) => {
    const c = catalogByItem.get(id)!;
    db.registerEntry(admin, id, { qty: Math.ceil((missingM + c.min * milliOf(c.unit)) / milliOf(c.unit)), unit: c.unit, reason }, { at, ...demo });
  };
  const produce = (key: string, at: string, cook: User) => {
    const p = db.prep(prepId[key]);
    const base = p.inputs[0];
    const baseQ = Math.round(base.qty_m * (p.mode === 'lote' ? 1 : 2 + Math.floor(rand() * 3)));
    const factor = baseQ / base.qty_m;
    for (const i of p.inputs) {
      const need = Math.round(i.qty_m * factor);
      const have = db.item(i.item_id).qty_m;
      if (have < need) buy(i.item_id, need - have, at, 'Compra urgente (DEMO)');
    }
    const eff = rand() < 0.06 ? 0.78 + rand() * 0.08 : 0.92 + rand() * 0.12;
    const out = db.item(p.output_item_id);
    const body: Body = { preparation_id: p.id, output_qty: Math.round(p.std_output_m * factor * eff) / 1000, output_unit: out.base_unit };
    if (p.mode === 'transformacion') {
      body.input_qty = baseQ / 1000;
      body.input_unit = db.item(base.item_id).base_unit;
      if (rand() < 0.3) body.merma_util_qty = Math.round((baseQ * 0.05) / 1000);
    } else {
      body.inputs = p.inputs.map((i) => ({ item_id: i.item_id, qty: Math.round(i.qty_m * factor) / 1000, unit: db.item(i.item_id).base_unit }));
    }
    db.registerProduction(cook, body, { at, ...demo });
  };

  const totalWeight = CATALOG_PRODUCTS.reduce((n, p) => n + p.weight, 0);
  const pickProduct = () => {
    let r = rand() * totalWeight;
    for (const p of CATALOG_PRODUCTS) if ((r -= p.weight) < 0) return p.key;
    return CATALOG_PRODUCTS[0].key;
  };
  const planFrom = addDays(weekStart(today), -7);
  let seq = 0;
  const saleIds: string[] = [];

  // Apertura y cierre de la última semana; al cerrar, unos productos se gastaron un poco más de lo vendido.
  const EXTRA_USE: Record<string, number> = { queso_mozzarella: 0.06, tocineta: 0.1, papas: 0.08, pepperoni: 0.07 };
  const soldSince = (id: number, from: string) => s.movements.filter((m) => m.item_id === id && m.type === 'venta' && m.created_at >= from).reduce((n, m) => n - m.delta_m, 0);
  const fillSheet = (day: string, field: 'open' | 'close', at: string, openedAt?: string) => {
    for (const c of CATALOG_ITEMS) {
      const it = db.item(itemId[c.key]);
      const extra = field === 'close' && openedAt ? Math.round(soldSince(it.id, openedAt) * (EXTRA_USE[c.key] ?? 0)) : 0;
      db.setCell(cook1, { date: day, item_id: it.id, field, value_m: Math.max(0, it.qty_m - extra) }, { at, ...demo });
    }
  };

  for (let i = 0; i <= DAYS; i++) {
    const day = addDays(start, i);
    const dow = new Date(day + 'T00:00:00Z').getUTCDay();
    const isToday = day === today;
    if (dow === 1 && i > 0) {
      for (const c of CATALOG_ITEMS) {
        if (c.kind !== 'insumo') continue;
        const cur = db.item(itemId[c.key]);
        const target = c.demoQty * milliOf(c.unit);
        if (cur.qty_m < target * 0.7) db.registerEntry(admin, cur.id, { qty: Math.ceil((target - cur.qty_m) / milliOf(c.unit)), unit: c.unit, reason: 'Compra semanal a proveedor (DEMO)' }, { at: bogota(day, 9, 0), ...demo });
      }
    }
    const withCounts = i >= DAYS - 7;
    if (withCounts && new Date(bogota(day, 8, 30)) <= now) fillSheet(day, 'open', bogota(day, 8, 30));
    const plan = WEEK_PLAN[dow];
    if (day >= planFrom) for (const key of plan) db.addTask({ date: day, preparation_id: prepId[key] }, demo);
    plan.forEach((key, idx) => {
      if (isToday && idx >= Math.ceil(plan.length / 2)) return;
      const at = bogota(day, 9 + idx, 10 + Math.floor(rand() * 40));
      if (new Date(at) <= now) produce(key, at, pick(cooks));
    });
    const weekend = dow === 5 || dow === 6 || dow === 0;
    const count = Math.round((weekend ? 12 : 7) + rand() * (weekend ? 8 : 5));
    const times = Array.from({ length: count }, () => 12 * 60 + Math.floor(rand() * 10 * 60)).sort((a, b) => a - b);
    for (const minute of times) {
      const at = bogota(day, Math.floor(minute / 60), minute % 60);
      if (new Date(at) > now) break;
      const lines = new Map<string, number>();
      const n = rand() < 0.5 ? 1 : rand() < 0.8 ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const key = pickProduct();
        lines.set(key, (lines.get(key) ?? 0) + (rand() < 0.75 ? 1 : 2));
      }
      const items = [...lines].map(([k, qty]) => ({ productId: productId[k], qty }));
      for (const sh of db.previewSale({ items }).shortages) {
        const prepKey = prepByOutput.get(sh.item_id);
        if (prepKey) {
          let guard = 0;
          while (db.item(sh.item_id).qty_m < sh.needed_m && guard++ < 5) produce(prepKey, at, pick(cooks));
        } else buy(sh.item_id, sh.short_m, at, 'Compra urgente (DEMO)');
      }
      saleIds.push(db.registerSale(pick(sellers), { requestId: `demo-${++seq}-${day}`, items }, { at, ...demo }).sale.id);
    }
    if (!isToday && rand() < 0.22) {
      const it = db.item(itemId[pick(['tomate', 'lechuga', 'pan_hamburguesa', 'masa', 'cebolla_caramelizada'])]);
      const qtyM = it.base_unit === 'unidad' ? Math.min(2000, Math.floor(it.qty_m / 1000) * 1000) : Math.min(it.qty_m, 150_000 + Math.floor(rand() * 250_000));
      if (qtyM > 0) {
        const w = db.reportWaste(pick(cooks), { item_id: it.id, qty: qtyM / 1000, unit: it.base_unit, reason: pick(['vencido', 'danado', 'mal_preparado', 'accidente']), note: 'DEMO' }, { at: bogota(day, 21, 30), ...demo });
        db.reviewWaste(admin, w.id, { decision: 'aprobar', note: 'Revisada con la foto' }, { at: bogota(day, 22, 0) });
      }
    }
    // Cierre del día, después de las bajas de la noche.
    if (withCounts && !isToday) {
      fillSheet(day, 'close', bogota(day, 23, 15), bogota(day, 8, 30));
      // El último día cerrado queda sin validar, para que se vea cómo se valida.
      if (i < DAYS - 1) db.validateDay(cook1, { date: day, note: '' }, { at: bogota(day, 23, 40), ...demo });
    }
  }
  for (const idx of [Math.floor(saleIds.length * 0.4), Math.floor(saleIds.length * 0.6)]) {
    const sale = s.sales.find((x) => x.id === saleIds[idx]);
    if (sale) db.annulSale(admin, sale.id, { reason: 'Registrada por error (DEMO)' }, { at: new Date(new Date(sale.created_at).getTime() + 600_000).toISOString() });
  }

  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const tomate = db.item(itemId.tomate);
  if (tomate.qty_m > 0) db.reportWaste(cook1, { item_id: tomate.id, qty: Math.min(400, tomate.qty_m / 1000), unit: 'g', reason: 'danado', note: 'Poca rotación, tenía moho (DEMO)', photo: DEMO_PHOTO }, { at: ago(80), ...demo });
  const masa = db.item(itemId.masa);
  if (masa.qty_m > 0) db.reportWaste(cook2, { item_id: masa.id, qty: Math.min(600, masa.qty_m / 1000), unit: 'g', reason: 'mal_preparado', note: 'Se pasó de fermentación (DEMO)' }, { at: ago(40), ...demo });
  db.reportShortage(cook1, { item_id: itemId.lechuga, level: 'agotado', note: 'No alcanza para la noche' }, { at: ago(120), ...demo });
  db.reportShortage(cook2, { item_id: itemId.levadura, level: 'poco', note: 'Queda para un solo lote de masa' }, { at: ago(70), ...demo });
  const pedido = db.reportShortage(cook1, { item_id: itemId.salsa_bbq, level: 'poco' }, { at: ago(60 * 26), ...demo });
  db.setShortageStatus(pedido.id, { status: 'pedido' });
  s.currentUserId = null;
  return s;
}

/** Ilustración liviana (SVG) que hace de «foto» en la baja de demostración. */
const DEMO_PHOTO =
  'data:image/svg+xml;base64,' +
  btoaSafe(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#e7dccb"/><circle cx="120" cy="105" r="52" fill="#c42d1a"/><circle cx="205" cy="112" r="44" fill="#a32314"/><circle cx="105" cy="88" r="14" fill="#6b7d3a" opacity=".85"/><circle cx="215" cy="98" r="11" fill="#6b7d3a" opacity=".8"/><circle cx="196" cy="128" r="8" fill="#556b2f" opacity=".7"/><text x="160" y="186" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#4a3d36">Foto de ejemplo (DEMO)</text></svg>',
  );

function btoaSafe(s: string): string {
  try {
    return btoa(s);
  } catch {
    return '';
  }
}

// ---------- Enrutador: replica las rutas y permisos del servidor ----------

export const browserDb = new BrowserDB();

const PUBLIC = new Set(['/session', '/setup', '/login', '/logout']);

export async function handleBrowserRequest<T>(method: string, path: string, body: Body = {}): Promise<T> {
  const out = await route(method, path, body ?? {});
  return out as T;
}

async function route(method: string, path: string, body: Body): Promise<unknown> {
  const db = browserDb;
  const [clean, queryStr] = path.split('?');
  const q = new URLSearchParams(queryStr ?? '');
  const qn = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const qs = (k: string) => q.get(k) || undefined;
  const GET = method === 'GET';
  const POST = method === 'POST';
  const PUT = method === 'PUT';

  if (clean === '/session') return db.session();
  if (clean === '/setup' && POST) return db.setup(body);
  if (clean === '/login' && POST) return db.login(body);
  if (clean === '/logout') return db.logout();
  if (PUBLIC.has(clean)) throw notFound('Ruta no encontrada.');

  const user = db.user();
  if (!user) throw new ApiError(401, 'Tu sesión terminó. Inicia sesión de nuevo.');
  const need = (a: Action) => {
    if (!can(user, a)) throw forbidden();
  };
  const m = (re: RegExp) => clean.match(re);
  // Cada cambio se guarda al final; si algo falla a mitad de camino, se recarga lo guardado.
  const write = <R>(fn: () => R): R => {
    const snapshot = JSON.stringify(db.state);
    try {
      const r = fn();
      db.save();
      return r;
    } catch (e) {
      db.state = JSON.parse(snapshot) as State;
      throw e;
    }
  };
  let mm: RegExpMatchArray | null;

  if (clean === '/me/password' && POST) return db.changeOwnPassword(user, body.current, body.next);

  // Inventario
  if (clean === '/items' && GET) return need('inventory.view'), db.listItems();
  if (clean === '/items' && POST) return need('inventory.edit'), write(() => db.createItem(user, body));
  if ((mm = m(/^\/items\/(\d+)$/)) && GET) return need('inventory.view'), db.item(Number(mm[1]));
  if ((mm = m(/^\/items\/(\d+)$/)) && PUT) return need('inventory.edit'), write(() => db.updateItem(Number(mm![1]), body));
  if ((mm = m(/^\/items\/(\d+)\/active$/))) return need('inventory.edit'), write(() => db.setItemActive(Number(mm![1]), body.active === true));
  if ((mm = m(/^\/items\/(\d+)\/entry$/))) return need('inventory.entry'), write(() => db.registerEntry(user, Number(mm![1]), body));
  if ((mm = m(/^\/items\/(\d+)\/adjust$/))) return need('inventory.adjust'), write(() => db.registerAdjust(user, Number(mm![1]), body));
  if (clean === '/movements') return need('inventory.view'), db.listMovements({ itemId: qn('itemId'), type: qs('type'), limit: qn('limit') });

  // Productos
  if (clean === '/products' && GET) return can(user, 'products.edit') ? db.listProducts() : db.listProducts().filter((p) => p.active);
  if (clean === '/products' && POST) return need('products.edit'), write(() => db.createProduct(body));
  if ((mm = m(/^\/products\/(\d+)$/)) && PUT) return need('products.edit'), write(() => db.updateProduct(Number(mm![1]), body));
  if ((mm = m(/^\/products\/(\d+)\/active$/))) return need('products.edit'), write(() => db.setProductActive(Number(mm![1]), body.active === true));

  // Ventas
  if (clean === '/sales/preview') return need('sales.create'), db.previewSale(body);
  if (clean === '/sales' && POST) return need('sales.create'), write(() => db.registerSale(user, body));
  if (clean === '/sales' && GET) return db.listSales(user, { from: qs('from'), to: qs('to'), productId: qn('productId'), userId: qn('userId'), status: qs('status'), limit: qn('limit') });
  if ((mm = m(/^\/sales\/([^/]+)\/annul$/)) && POST) return need('sales.annul'), write(() => db.annulSale(user, decodeURIComponent(mm![1]), body));
  if ((mm = m(/^\/sales\/([^/]+)$/)) && GET) return db.getSale(user, decodeURIComponent(mm[1]));

  // Reportes
  if (clean === '/dashboard') return need('reports.view'), db.dashboard();
  if (clean === '/charts') return need('reports.view'), db.charts(qs('series') ?? '7d', qs('top') ?? 'semana');
  if (clean === '/reports/kitchen') return need('reports.view'), db.kitchenReport(qs('period') ?? 'semana', qs('date') ?? localDate());
  if (clean === '/reports') return need('reports.view'), db.reports(qs('period') ?? 'dia', qs('date') ?? localDate());

  // Cocina
  if (clean === '/kitchen/today') return need('kitchen.report'), db.kitchenToday(user);
  if (clean === '/kitchen/items') return need('kitchen.report'), db.listItems().filter((i) => i.active);
  if (clean === '/preparations' && GET) return need('kitchen.use'), db.listPreparations();
  if (clean === '/preparations' && POST) return need('kitchen.manage'), write(() => db.createPreparation(body));
  if ((mm = m(/^\/preparations\/(\d+)$/)) && PUT) return need('kitchen.manage'), write(() => db.updatePreparation(Number(mm![1]), body));
  if ((mm = m(/^\/preparations\/(\d+)\/active$/))) return need('kitchen.manage'), write(() => db.setPreparationActive(Number(mm![1]), body.active === true));
  if (clean === '/productions' && GET) {
    need('kitchen.use');
    return db.listProductions({ from: qs('from'), to: qs('to'), preparationId: qn('preparationId'), userId: qn('userId'), limit: qn('limit') });
  }
  if (clean === '/productions' && POST) return need('kitchen.use'), write(() => db.registerProduction(user, body));
  if ((mm = m(/^\/productions\/(\d+)\/annul$/))) return need('kitchen.manage'), write(() => db.annulProduction(user, Number(mm![1]), body));
  if (clean === '/wastes' && GET) return need('kitchen.report'), db.listWastes(user, { status: qs('status'), from: qs('from'), to: qs('to'), limit: qn('limit') });
  if (clean === '/wastes' && POST) return need('kitchen.report'), write(() => db.reportWaste(user, body));
  if ((mm = m(/^\/wastes\/(\d+)\/photo$/))) return need('kitchen.report'), db.wastePhoto(user, Number(mm[1]));
  if ((mm = m(/^\/wastes\/(\d+)\/review$/))) return need('kitchen.manage'), write(() => db.reviewWaste(user, Number(mm![1]), body));
  if (clean === '/shortages' && GET) return need('kitchen.report'), db.listShortages(qs('scope') ?? 'open');
  if (clean === '/shortages' && POST) return need('kitchen.report'), write(() => db.reportShortage(user, body));
  if ((mm = m(/^\/shortages\/(\d+)\/status$/))) return need('kitchen.manage'), write(() => db.setShortageStatus(Number(mm![1]), body));
  if (clean === '/shopping-list') return need('kitchen.manage'), db.shoppingList();
  if (clean === '/counts/sheet') return need('kitchen.use'), db.countSheet(qs('location'));
  if (clean === '/sheets/inventory') return need('kitchen.use'), db.inventorySheet(user, qs('date') ?? localDate());
  if (clean === '/counts/day') return need('kitchen.use'), db.dayCountStatus(qs('date') ?? localDate());
  if (clean === '/reconciliation') return need('kitchen.manage'), db.reconciliation(qs('date') ?? localDate());
  if (clean === '/counts' && GET) return need('kitchen.use'), db.listCounts(user, { status: qs('status'), limit: qn('limit') });
  if (clean === '/counts' && POST) return need('kitchen.use'), write(() => db.submitCount(user, body));
  if ((mm = m(/^\/counts\/(\d+)\/review$/))) return need('kitchen.manage'), write(() => db.reviewCount(user, Number(mm![1]), body));
  if ((mm = m(/^\/counts\/(\d+)$/))) return need('kitchen.use'), db.getCount(user, Number(mm[1]));
  if (clean === '/day-sheet' && GET) return need('sheet.use'), db.daySheet(qs('date') ?? localDate());
  if (clean === '/day-sheet/days') return need('sheet.use'), db.sheetDays(qs('from') ?? '', qs('to') ?? '');
  if (clean === '/day-sheet/cell' && POST) return need('sheet.use'), write(() => db.setCell(user, body));
  if (clean === '/day-sheet/fill-open' && POST) return need('sheet.use'), write(() => db.fillOpen(body));
  if (clean === '/day-sheet/validate' && POST) return need('sheet.use'), write(() => db.validateDay(user, body));
  if (clean === '/day-sheet/reopen' && POST) return need('sheet.reopen'), write(() => db.reopenDay(user, body));
  if (clean === '/day-sheet/items' && POST) return need('sheet.use'), write(() => db.addIngredient(user, body));
  if ((mm = m(/^\/day-sheet\/items\/(\d+)$/)) && PUT) return need('sheet.use'), write(() => db.editIngredient(Number(mm![1]), body));
  if (clean === '/prep-plan' && GET) return need('kitchen.use'), db.weekPlan(qs('date'));
  if (clean === '/prep-plan' && POST) return need('kitchen.manage'), write(() => db.addTask(body));
  if (clean === '/prep-plan/copy-previous') return need('kitchen.manage'), write(() => db.copyPreviousWeek(body.date));
  if ((mm = m(/^\/prep-plan\/(\d+)\/delete$/))) return need('kitchen.manage'), write(() => db.deleteTask(Number(mm![1])));

  // Usuarios
  if (clean === '/users' && GET) {
    if (!can(user, 'users.manage') && !can(user, 'sales.viewAll')) throw forbidden('No tienes permiso.');
    const list = db.listUsers();
    return can(user, 'users.manage') ? list : list.map((u) => ({ id: u.id, name: u.name }));
  }
  if (clean === '/users' && POST) return need('users.manage'), db.createUser(body);
  if ((mm = m(/^\/users\/(\d+)\/password$/))) return need('users.manage'), db.resetPassword(Number(mm[1]), body.password);
  if ((mm = m(/^\/users\/(\d+)$/)) && PUT) return need('users.manage'), db.updateUser(user, Number(mm[1]), body);

  // Configuración
  if (clean === '/settings/demo') return need('settings.manage'), db.demoStatus();
  if (clean === '/settings/demo/load' || clean === '/settings/demo/reset') {
    need('settings.manage');
    const real = db.demoStatus().real;
    if (clean.endsWith('load') && real.items + real.products + real.sales > 0) {
      throw conflict('Ya hay información real. Para no mezclarla con datos ficticios, la demostración solo se puede cargar en un sistema vacío.');
    }
    db.resetDemo();
    return db.demoStatus();
  }
  if (clean === '/settings/demo/clear') return need('settings.manage'), db.clearDemo(), db.demoStatus();
  if (clean === '/settings/catalog') return need('settings.manage'), write(() => db.loadCatalog(user));

  throw notFound('Ruta no encontrada.');
}
