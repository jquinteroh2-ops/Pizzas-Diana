// Error de negocio con código HTTP y detalles opcionales para la interfaz.
export class AppError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg: string, details?: unknown) => new AppError(400, msg, details);
export const forbidden = (msg = 'No tienes permiso para realizar esta acción.') => new AppError(403, msg);
export const notFound = (msg = 'Registro no encontrado.') => new AppError(404, msg);
export const conflict = (msg: string, details?: unknown) => new AppError(409, msg, details);

// Validadores pequeños y explícitos para los datos que llegan del cliente.
export function str(v: unknown, field: string, { min = 1, max = 120 } = {}): string {
  if (typeof v !== 'string') throw bad(`El campo "${field}" es obligatorio.`);
  const s = v.trim();
  if (s.length < min) throw bad(min <= 1 ? `El campo "${field}" es obligatorio.` : `"${field}" debe tener al menos ${min} caracteres.`);
  if (s.length > max) throw bad(`"${field}" no puede superar ${max} caracteres.`);
  return s;
}

export function optStr(v: unknown, field: string, max = 500): string {
  if (v === undefined || v === null || v === '') return '';
  return str(v, field, { min: 0, max });
}

export function num(v: unknown, field: string, { min = 0, allowZero = true, max = 1e9 } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`"${field}" debe ser un número válido.`);
  if (n < min) throw bad(`"${field}" no puede ser negativo.`);
  if (!allowZero && n === 0) throw bad(`"${field}" debe ser mayor que cero.`);
  if (n > max) throw bad(`"${field}" es demasiado grande.`);
  return n;
}

export function int(v: unknown, field: string, min = 1, max = 100_000): number {
  const n = num(v, field, { min, max });
  if (!Number.isInteger(n)) throw bad(`"${field}" debe ser un número entero.`);
  return n;
}

export function oneOf<T extends string>(v: unknown, field: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) throw bad(`Valor no válido para "${field}".`);
  return v as T;
}
