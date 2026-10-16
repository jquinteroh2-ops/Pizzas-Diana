import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Pizza,
  ReceiptText,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  FlaskConical,
  ChefHat,
  CalendarCheck,
  Trophy,
  ClipboardList,
  Scale,
  Wheat,
  Trash2,
  History,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from './Logo';
import { cx } from './ui';
import { navigate, useApp, type Action, type RouteName } from '../lib/app';
import { ROLE_LABELS } from '../../shared/permissions.ts';

type NavGroup = 'hojas' | 'principal' | 'mas';

interface NavItem {
  name: RouteName;
  label: string;
  icon: LucideIcon;
  need?: Action;
  group: NavGroup;
}

// Todo el sistema funciona como las hojas de papel de Pizza Diana: lo primero del menú
// son las hojas; lo demás queda en «Más». El orden importa: la primera sección
// permitida es la pantalla de inicio (administrador y cocina → Inventario diario,
// caja → Registrar venta).
export const NAV: NavItem[] = [
  { name: 'hoja-inventario', label: 'Inventario diario', icon: ClipboardList, need: 'kitchen.use', group: 'hojas' },
  { name: 'hoja-ventas', label: 'Ventas del día', icon: ReceiptText, need: 'reports.view', group: 'hojas' },
  { name: 'hoja-merma', label: 'Merma', icon: Scale, need: 'kitchen.use', group: 'hojas' },
  { name: 'hoja-masa', label: 'Masa de pizza', icon: Wheat, need: 'kitchen.use', group: 'hojas' },
  { name: 'hoja-bajas', label: 'Bajas', icon: Trash2, need: 'kitchen.use', group: 'hojas' },
  { name: 'vender', label: 'Registrar venta', icon: ShoppingBag, need: 'sales.create', group: 'principal' },
  { name: 'cocina', label: 'Cocina', icon: ChefHat, need: 'kitchen.report', group: 'principal' },
  { name: 'historial', label: 'Historial de ventas', icon: History, need: 'sales.create', group: 'principal' },
  { name: 'inicio', label: 'Tablero', icon: LayoutDashboard, need: 'reports.view', group: 'mas' },
  { name: 'mas-vendidos', label: 'Más vendidos', icon: Trophy, need: 'reports.view', group: 'mas' },
  { name: 'reportes', label: 'Reportes', icon: BarChart3, need: 'reports.view', group: 'mas' },
  { name: 'plan', label: 'Plan de preparación', icon: CalendarCheck, need: 'kitchen.use', group: 'mas' },
  { name: 'inventario', label: 'Inventario', icon: Package, need: 'inventory.view', group: 'mas' },
  { name: 'productos', label: 'Productos y recetas', icon: Pizza, need: 'products.edit', group: 'mas' },
  { name: 'usuarios', label: 'Usuarios', icon: Users, need: 'users.manage', group: 'mas' },
  { name: 'configuracion', label: 'Configuración', icon: Settings, need: 'settings.manage', group: 'mas' },
];

export function allowedNav(can: (a: Action) => boolean) {
  return NAV.filter((n) => !n.need || can(n.need));
}

/** Algunas secciones cambian de nombre o de lugar según quién entra. */
function navView(n: NavItem, can: (a: Action) => boolean): { label: string; group: NavGroup } {
  if (n.name === 'cocina') {
    if (can('kitchen.manage')) return { label: 'Cocina (control)', group: 'mas' };
    if (can('kitchen.use')) return { label: 'Hoy en cocina', group: 'principal' };
    return { label: 'Faltantes y bajas', group: 'principal' };
  }
  // El administrador no vende a diario: el historial va en «Más».
  if (n.name === 'historial' && can('kitchen.manage')) return { label: n.label, group: 'mas' };
  return { label: n.label, group: n.group };
}

const MORE_KEY = 'pd_menu_mas';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w)) // «Diana (Administradora)» → «DA», sin el paréntesis
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function Layout({ current, children }: { current: RouteName; children: ReactNode }) {
  const { user, can, logout, session } = useApp();
  const [open, setOpen] = useState(false);
  const items = allowedNav(can).map((n) => ({ ...n, ...navView(n, can) }));
  const inMore = items.some((n) => n.group === 'mas' && n.name === current);
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento: solo se recuerda mientras la página esté abierta.
    }
  };
  // En el celular, la barra inferior muestra las 4 primeras secciones (las hojas, en cocina).
  const bottom = items.filter((i) => i.group !== 'mas').slice(0, 4);

  const go = (n: RouteName) => {
    setOpen(false);
    navigate(n);
  };

  const navButton = (n: (typeof items)[number]) => {
    const active = n.name === current;
    const Icon = n.icon;
    return (
      <button
        key={n.name}
        onClick={() => go(n.name)}
        className={cx(
          'group flex items-center gap-3 rounded-xl px-3.5 py-2 text-left text-sm font-medium transition-all',
          active ? 'bg-white/[0.09] text-white shadow-inner' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
        )}
        aria-current={active ? 'page' : undefined}
      >
        <span className={cx('grid size-8 place-items-center rounded-lg transition-colors', active ? 'bg-brand-600 text-white' : 'bg-white/[0.04] text-white/70 group-hover:text-white')}>
          <Icon className="size-[18px]" />
        </span>
        {n.label}
      </button>
    );
  };

  const groupTitle = (t: string) => <p className="mt-3 mb-1 px-3.5 text-[11px] font-bold tracking-wider text-white/35 uppercase first:mt-0">{t}</p>;
  const sheets = items.filter((n) => n.group === 'hojas');
  const main = items.filter((n) => n.group === 'principal');
  const more = items.filter((n) => n.group === 'mas');
  const showMore = moreOpen || inMore;

  const navList = (
    <nav className="flex flex-col gap-0.5">
      {sheets.length > 0 && groupTitle('Hojas')}
      {sheets.map(navButton)}
      {main.length > 0 && sheets.length > 0 && groupTitle('Caja y cocina')}
      {main.map(navButton)}
      {more.length > 0 && (
        <>
          <button
            onClick={toggleMore}
            className="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2 text-left text-[11px] font-bold tracking-wider text-white/45 uppercase hover:text-white/80"
            aria-expanded={showMore}
          >
            Más
            <ChevronDown className={cx('size-4 transition-transform', showMore && 'rotate-180')} />
          </button>
          {showMore && more.map(navButton)}
        </>
      )}
    </nav>
  );

  const userBox = (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-crust-300 text-sm font-bold text-ink-900">{initials(user.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        <p className="text-xs text-white/50">{ROLE_LABELS[user.role]}</p>
      </div>
      <button onClick={logout} className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );

  const sidebarBg = 'bg-[radial-gradient(120%_60%_at_0%_0%,#3a221a_0%,#231a16_55%)]';

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-8 p-5 lg:flex print:hidden', sidebarBg)}>
        <div className="px-2 pt-2">
          <Logo light />
        </div>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        {userBox}
      </aside>

      {/* Barra superior (tablet y celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-300/60 bg-cream-100/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Logo compact />
        <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="size-6" />
        </button>
      </header>

      {/* Menú deslizable en celular */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className={cx('absolute inset-y-0 right-0 flex w-[82%] max-w-xs animate-fade-up flex-col gap-6 p-5', sidebarBg)}>
            <div className="flex items-center justify-between">
              <Logo light compact />
              <button className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navList}</div>
            {userBox}
          </div>
        </div>
      )}

      <main className="pb-24 lg:pb-10 lg:pl-72 print:p-0">
        {session.demoMode && (
          <div className="flex items-center justify-center gap-2 bg-violet-700 px-4 py-2 text-center text-xs font-medium text-white print:hidden">
            <FlaskConical className="size-4 shrink-0" />
            <span>
              <b>Modo demostración:</b> los datos son ficticios y todo lo que registres se marcará como DEMO.
              {can('settings.manage') && (
                <>
                  {' '}
                  <button className="underline underline-offset-2" onClick={() => navigate('configuracion')}>
                    Gestionar
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>

      {/* Navegación inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid print:hidden border-t border-cream-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
        {bottom.map((n) => {
          const Icon = n.icon;
          const active = n.name === current;
          return (
            <button key={n.name} onClick={() => go(n.name)} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', active ? 'text-brand-600' : 'text-ink-500')}>
              <Icon className="size-5" />
              {n.label.split(' ')[0]}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
