import { useState, type FormEvent } from 'react';
import { Lock, User as UserIcon, Loader2, ShieldCheck, Package, BarChart3, ShoppingBag } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Session } from '../lib/types';
import { Logo, PizzaMark } from '../components/Logo';
import { Field } from '../components/ui';

const CURRENT_YEAR = new Date().getFullYear();

export default function Login({ session, onDone }: { session: Session; onDone: () => Promise<void> }) {
  const setup = session.needsSetup;
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      if (setup) await api.post('/setup', { username, name, password });
      else await api.post('/login', { username, password });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca */}
      <div className="relative hidden overflow-hidden bg-[radial-gradient(110%_80%_at_10%_10%,#4a2418_0%,#231a16_60%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -bottom-32 opacity-[0.13]">
          <PizzaMark className="size-[34rem] rotate-12" />
        </div>
        <Logo light />
        <div className="relative max-w-md">
          <p className="font-display text-5xl leading-[1.05] font-semibold italic">
            Cada porción,
            <br />
            <span className="text-crust-300">bajo control.</span>
          </p>
          <p className="mt-5 text-base text-white/65">
            Registra lo que vendes y el inventario se descuenta solo, según la receta de cada pizza.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-white/80">
            {[
              [ShoppingBag, 'Ventas por cantidades en segundos'],
              [Package, 'Ingredientes descontados automáticamente'],
              [BarChart3, 'Reportes diarios, semanales y mensuales'],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof Package;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/10">
                    <I className="size-[18px] text-crust-300" />
                  </span>
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {CURRENT_YEAR} Pizza Diana</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">{setup ? 'Configuración inicial' : 'Bienvenido'}</h1>
          <p className="mt-2 text-sm text-ink-500">
            {setup
              ? 'Es la primera vez que se usa el sistema. Crea la cuenta del administrador de Pizza Diana.'
              : 'Ingresa con tu usuario para registrar ventas y consultar el inventario.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {setup && (
              <Field label="Nombre completo">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ej. Diana Pérez" />
              </Field>
            )}
            <Field label="Usuario" hint={setup ? 'Sin espacios ni tildes. Ej. diana' : undefined}>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                />
              </div>
            </Field>
            <Field label="Contraseña" hint={setup ? 'Mínimo 8 caracteres.' : undefined}>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-10"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  minLength={setup ? 8 : undefined}
                  required
                />
              </div>
            </Field>
            {setup && (
              <Field label="Repite la contraseña">
                <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
              </Field>
            )}

            {error && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800" role="alert">{error}</p>}

            <button className="btn-primary w-full py-3" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {setup ? 'Crear administrador y entrar' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="mt-8 flex items-center gap-2 text-xs text-ink-500">
            <ShieldCheck className="size-4 text-emerald-700" /> Contraseñas cifradas · sesión protegida
          </p>
        </div>
      </div>
    </div>
  );
}
