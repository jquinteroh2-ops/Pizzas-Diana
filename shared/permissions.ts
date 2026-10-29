// Roles y matriz de permisos. La usan el servidor (seguridad real), el simulador
// del navegador y la interfaz (solo para mostrar u ocultar opciones).

export const ROLES = ['admin', 'caja', 'cocina'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  caja: 'Caja',
  cocina: 'Jefe de cocina',
};

// Permisos extra que el administrador puede conceder a caja o cocina.
export const EXTRA_PERMS = ['entradas', 'reportes', 'historial_completo'] as const;
export type ExtraPerm = (typeof EXTRA_PERMS)[number];

export type Action =
  | 'users.manage'
  | 'settings.manage'
  | 'inventory.view'
  | 'inventory.edit'
  | 'inventory.adjust'
  | 'inventory.entry'
  | 'products.edit'
  | 'sales.create'
  | 'sales.annul'
  | 'sales.viewAll'
  | 'reports.view'
  /** Preparar, contar neveras y ver el plan del día. */
  | 'kitchen.use'
  /** Reportar faltantes y bajas (cualquier usuario). */
  | 'kitchen.report'
  /** Preparaciones, plan semanal, autorizar bajas y conteos, lista de compras. */
  | 'kitchen.manage'
  /** La hoja del día: contar inicio y fin, anotar lo que llegó, agregar ingredientes y validar con la caja. */
  | 'sheet.use'
  /** Volver a abrir una hoja ya validada (solo el administrador). */
  | 'sheet.reopen';

export function can(user: { role: Role; perms: readonly string[] } | null | undefined, action: Action): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  switch (action) {
    case 'sales.create':
      return user.role === 'caja';
    case 'inventory.view':
      return user.role === 'cocina' || user.perms.includes('entradas');
    case 'inventory.entry':
      // La jefa de cocina anota lo que llega.
      return user.role === 'cocina' || user.perms.includes('entradas');
    case 'reports.view':
      return user.perms.includes('reportes');
    case 'sales.viewAll':
      return user.perms.includes('historial_completo');
    case 'kitchen.use':
    case 'sheet.use':
      return user.role === 'cocina';
    case 'kitchen.report':
      return true;
    default:
      return false;
  }
}
