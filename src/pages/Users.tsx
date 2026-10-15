import { useState, type FormEvent } from 'react';
import { Plus, Pencil, KeyRound, Loader2, ShieldCheck, ChefHat, ShoppingBag, Users as UsersIcon, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useApp } from '../lib/app';
import type { ExtraPerm, Role, User } from '../lib/types';
import { useToast } from '../components/toast';
import { PageHeader, Loading, ErrorBox, EmptyState, Badge, DemoTag, Modal, Field, cx } from '../components/ui';
import { formatDateTime } from '../../shared/dates.ts';
import { ROLE_LABELS } from '../../shared/permissions.ts';

const PERMS: { value: ExtraPerm; label: string; hint: string; roles: Role[] }[] = [
  { value: 'entradas', label: 'Registrar entradas de mercancía', hint: 'Puede sumar lo que llega del proveedor. No puede hacer ajustes.', roles: ['caja', 'cocina'] },
  { value: 'reportes', label: 'Ver tablero y reportes', hint: 'Accede a las estadísticas de ventas y de cocina.', roles: ['caja', 'cocina'] },
  { value: 'historial_completo', label: 'Ver historial de todos', hint: 'Si no, solo ve las ventas que registró.', roles: ['caja'] },
];

// Al crear o cambiar la clave de OTRA persona, el navegador no debe ofrecer guardarla ni generarla:
// la guardaría como si fuera la del administrador. Además, el generador de contraseñas del
// navegador puede cerrar Brave en este formulario.
const NO_PASSWORD_MANAGER = {
  autoComplete: 'off',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const;

const ROLE_INFO: Record<Role, { icon: LucideIcon; text: string; tone: string }> = {
  admin: { icon: ShieldCheck, text: 'Ve y controla todo: inventario, cocina, recetas, autorizaciones, estadísticas y usuarios.', tone: 'bg-brand-600 text-white' },
  caja: { icon: ShoppingBag, text: 'Registra las ventas y avisa faltantes y bajas. No cambia recetas ni existencias.', tone: 'bg-crust-300 text-ink-900' },
  cocina: { icon: ChefHat, text: 'Ve el inventario, registra lo que prepara, cuenta neveras y avisa faltantes y bajas. No vende ni ve estadísticas.', tone: 'bg-emerald-600 text-white' },
};

export default function UsersPage() {
  const users = useApi<User[]>('/users');
  const [edit, setEdit] = useState<{ user?: User } | null>(null);
  const [pwd, setPwd] = useState<User | null>(null);

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Quién puede entrar al sistema y qué puede hacer."
        actions={
          <button className="btn-primary" onClick={() => setEdit({})}>
            <Plus className="size-4" /> Nuevo usuario
          </button>
        }
      />
      {users.error ? (
        <ErrorBox message={users.error} onRetry={users.reload} />
      ) : !users.data ? (
        <Loading />
      ) : users.data.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Sin usuarios" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {users.data.map((u) => (
            <article key={u.id} className={cx('card p-5', !u.active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <RoleIcon role={u.role} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-ink-900">{u.name}</h3>
                  <p className="text-sm text-ink-500">@{u.username}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={u.role === 'admin' ? 'red' : u.role === 'cocina' ? 'green' : 'amber'}>{ROLE_LABELS[u.role]}</Badge>
                    {!u.active && <Badge tone="dark">Desactivado</Badge>}
                    {u.is_demo && <DemoTag />}
                    {u.is_demo && <Badge>Sin acceso</Badge>}
                  </div>
                </div>
              </div>
              {u.role !== 'admin' && u.perms.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-ink-500">
                  {u.perms.map((p) => (
                    <li key={p}>+ {PERMS.find((x) => x.value === p)?.label}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-400">Creado {formatDateTime(u.created_at)}</p>
              {!u.is_demo && (
                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary btn-sm flex-1" onClick={() => setEdit({ user: u })}>
                    <Pencil className="size-4" /> Editar
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setPwd(u)}>
                    <KeyRound className="size-4" /> Contraseña
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {edit && <UserForm user={edit.user} onClose={() => setEdit(null)} />}
      {pwd && <PasswordForm user={pwd} onClose={() => setPwd(null)} />}
    </>
  );
}

function RoleIcon({ role }: { role: Role }) {
  const r = ROLE_INFO[role];
  const Icon = r.icon;
  return (
    <span className={cx('grid size-11 shrink-0 place-items-center rounded-full', r.tone)}>
      <Icon className="size-5" />
    </span>
  );
}

function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const { bump, user: me, reloadSession } = useApp();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'cocina');
  const [perms, setPerms] = useState<ExtraPerm[]>(user?.perms ?? []);
  const [active, setActive] = useState(user?.active ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (user) {
        await api.put(`/users/${user.id}`, { name, role, perms, active });
        if (user.id === me.id) await reloadSession();
      } else {
        await api.post('/users', { name, username, password, role, perms });
      }
      toast.success(user ? 'Usuario actualizado' : 'Usuario creado', name);
      bump();
      onClose();
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Editar usuario' : 'Nuevo usuario'}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="user-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Nombre">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </Field>
        {!user && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usuario" hint="Sin espacios ni tildes.">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" autoCapitalize="none" {...NO_PASSWORD_MANAGER} />
            </Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres.">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} {...NO_PASSWORD_MANAGER} />
            </Field>
          </div>
        )}
        <div>
          <span className="label">Rol</span>
          <div className="grid gap-2">
            {(['cocina', 'caja', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setPerms((ps) => ps.filter((p) => PERMS.find((x) => x.value === p)?.roles.includes(r)));
                }}
                className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left transition-all', role === r ? 'border-ink-900 ring-1 ring-ink-900' : 'border-cream-300 hover:border-ink-400/50')}
                aria-pressed={role === r}
              >
                <RoleIcon role={r} />
                <span>
                  <span className="block text-sm font-semibold text-ink-900">{ROLE_LABELS[r]}</span>
                  <span className="block text-xs text-ink-500">{ROLE_INFO[r].text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        {role !== 'admin' && (
          <fieldset className="space-y-2 rounded-2xl bg-cream-50 p-4">
            <legend className="sr-only">Permisos adicionales</legend>
            <p className="text-sm font-semibold text-ink-700">Permisos adicionales</p>
            {PERMS.filter((p) => p.roles.includes(role)).map((p) => (
              <label key={p.value} className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-brand-600"
                  checked={perms.includes(p.value)}
                  onChange={(e) => setPerms((ps) => (e.target.checked ? [...ps, p.value] : ps.filter((x) => x !== p.value)))}
                />
                <span>
                  <span className="block text-sm font-medium text-ink-900">{p.label}</span>
                  <span className="block text-xs text-ink-500">{p.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {user && (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Usuario activo (si lo desactivas, no podrá iniciar sesión)
          </label>
        )}
      </form>
    </Modal>
  );
}

function PasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/password`, { password });
      toast.success('Contraseña cambiada', `${user.name} deberá iniciar sesión de nuevo.`);
      onClose();
    } catch (err) {
      toast.fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Cambiar contraseña"
      subtitle={user.name}
      footer={
        <>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="pwd-form" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <form id="pwd-form" onSubmit={submit}>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} {...NO_PASSWORD_MANAGER} />
        </Field>
      </form>
    </Modal>
  );
}
