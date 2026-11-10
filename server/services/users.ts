import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { type DB, nowIso } from '../db.ts';
import { AppError, bad, conflict, forbidden, notFound, oneOf, str } from '../errors.ts';
import { can as canShared, EXTRA_PERMS, ROLES, type Action, type ExtraPerm, type Role } from '../../shared/permissions.ts';

export { EXTRA_PERMS, type Action, type ExtraPerm, type Role };
export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  perms: ExtraPerm[];
  active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: Role;
  perms: string;
  pass_hash: string | null;
  active: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    perms: JSON.parse(r.perms) as ExtraPerm[],
    active: !!r.active,
    is_demo: !!r.is_demo,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Matriz de permisos. Se usa en el servidor en cada ruta (no solo en la interfaz). */
export function can(user: User, action: Action): boolean {
  return canShared(user, action);
}

export function assertCan(user: User, action: Action): void {
  if (!can(user, action)) throw forbidden();
}

// ---------- Contraseñas (scrypt con sal aleatoria; nunca texto plano) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

function validPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres.');
  if (v.length > 200) throw bad('La contraseña es demasiado larga.');
  return v;
}

function validUsername(v: unknown): string {
  const u = str(v, 'usuario', { min: 3, max: 40 }).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(u)) throw bad('El usuario solo puede tener letras sin tilde, números, punto, guion y guion bajo.');
  return u;
}

function validPerms(v: unknown): ExtraPerm[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw bad('Permisos no válidos.');
  const out = new Set<ExtraPerm>();
  for (const p of v) out.add(oneOf(p, 'permiso', EXTRA_PERMS));
  return [...out];
}

// ---------- Sesiones ----------

const SESSION_HOURS = 12;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(db: DB, userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
  await db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  return token;
}

export async function userFromToken(db: DB, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(sha256(token), nowIso()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export async function destroySession(db: DB, token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// ---------- Casos de uso ----------

export async function loginUsers(db: DB): Promise<number> {
  return (await db.prepare('SELECT COUNT(*) n FROM users WHERE pass_hash IS NOT NULL').get() as { n: number }).n;
}

export async function needsSetup(db: DB): Promise<boolean> {
  return await loginUsers(db) === 0;
}

/** Primer arranque: crear el administrador. Solo funciona si aún no existe ningún usuario. */
export async function setupAdmin(db: DB, body: Record<string, unknown>): Promise<User> {
  if (!await needsSetup(db)) throw forbidden('El sistema ya tiene un administrador configurado.');
  return await insertUser(db, { ...body, role: 'admin' }, false);
}

export async function authenticate(db: DB, username: unknown, password: unknown): Promise<User> {
  const fail = new AppError(401, 'Usuario o contraseña incorrectos.');
  if (typeof username !== 'string' || typeof password !== 'string') throw fail;
  const row = await db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase()) as UserRow | undefined;
  // Se verifica igual aunque el usuario no exista, para no revelar cuáles existen por el tiempo de respuesta.
  const ok = verifyPassword(password, row?.pass_hash ?? 'scrypt$00$' + '00'.repeat(64));
  if (!row || !ok) throw fail;
  if (!row.active) throw new AppError(401, 'Este usuario está desactivado. Habla con el administrador.');
  return toUser(row);
}

async function insertUser(db: DB, body: Record<string, unknown>, isDemo: boolean): Promise<User> {
  const username = validUsername(body.username);
  const name = str(body.name, 'nombre', { max: 80 });
  const role = oneOf(body.role, 'rol', ROLES);
  const perms = role === 'admin' ? [] : validPerms(body.perms);
  const pass = validPassword(body.password);
  if (await db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw conflict('Ese nombre de usuario ya existe.');
  const now = nowIso();
  const r = await db
    .prepare('INSERT INTO users(username, name, role, perms, pass_hash, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(username, name, role, JSON.stringify(perms), hashPassword(pass), isDemo ? 1 : 0, now, now);
  return await getUser(db, Number(r.lastInsertRowid));
}

export async function getUser(db: DB, id: number): Promise<User> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw notFound('Usuario no encontrado.');
  return toUser(row);
}

export async function listUsers(db: DB): Promise<(User & { can_login: boolean })[]> {
  const rows = await db.prepare('SELECT * FROM users ORDER BY active DESC, role, name').all() as unknown as UserRow[];
  return rows.map((r) => ({ ...toUser(r), can_login: r.pass_hash !== null }));
}

export async function createUser(db: DB, body: Record<string, unknown>): Promise<User> {
  return await insertUser(db, body, false);
}

async function activeAdmins(db: DB): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND pass_hash IS NOT NULL").get() as { n: number }).n;
}

export async function updateUser(db: DB, actor: User, id: number, body: Record<string, unknown>): Promise<User> {
  const current = await getUser(db, id);
  const name = body.name === undefined ? current.name : str(body.name, 'nombre', { max: 80 });
  const role = body.role === undefined ? current.role : oneOf(body.role, 'rol', ROLES);
  const perms = role === 'admin' ? [] : body.perms === undefined ? current.perms : validPerms(body.perms);
  const active = body.active === undefined ? current.active : body.active === true;

  const losesAdmin = current.role === 'admin' && current.active && (role !== 'admin' || !active);
  if (losesAdmin && await activeAdmins(db) <= 1) throw conflict('Debe quedar al menos un administrador activo.');
  if (actor.id === id && !active) throw conflict('No puedes desactivar tu propio usuario.');

  await db.prepare('UPDATE users SET name=?, role=?, perms=?, active=?, updated_at=? WHERE id=?').run(
    name,
    role,
    JSON.stringify(perms),
    active ? 1 : 0,
    nowIso(),
    id,
  );
  if (!active) await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  return await getUser(db, id);
}

export async function resetPassword(db: DB, id: number, password: unknown): Promise<void> {
  const user = await getUser(db, id);
  if (user.is_demo) throw conflict('Los usuarios DEMO no pueden iniciar sesión.');
  await db.prepare('UPDATE users SET pass_hash=?, updated_at=? WHERE id=?').run(hashPassword(validPassword(password)), nowIso(), id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
}

export async function changeOwnPassword(db: DB, user: User, current: unknown, next: unknown): Promise<void> {
  const row = await db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(user.id) as { pass_hash: string | null };
  if (typeof current !== 'string' || !verifyPassword(current, row.pass_hash)) throw bad('La contraseña actual no es correcta.');
  await db.prepare('UPDATE users SET pass_hash=?, updated_at=? WHERE id=?').run(hashPassword(validPassword(next)), nowIso(), user.id);
}

/** Usuario de relleno para los datos DEMO: no tiene contraseña, así que no puede entrar. */
export async function insertDemoUser(db: DB, username: string, name: string, role: Role): Promise<number> {
  const now = nowIso();
  const r = await db
    .prepare("INSERT INTO users(username, name, role, perms, pass_hash, is_demo, created_at, updated_at) VALUES (?,?,?,'[]',NULL,1,?,?)")
    .run(username, name, role, now, now);
  return Number(r.lastInsertRowid);
}
