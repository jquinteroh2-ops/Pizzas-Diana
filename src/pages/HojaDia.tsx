// La hoja del día: una por fecha y todo en un solo lugar, como las hojas de papel de la cocina.
// Inventario (inicio, llegó, fin y consumo) · Preparaciones · Bajas · Pedido · Validar con la caja.
// La usan la jefa de cocina y el administrador.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChefHat, ChevronLeft, ChevronRight, ClipboardList, ShieldCheck, ShoppingBasket, Trash2, type LucideIcon } from 'lucide-react';
import { navigate, useApi, useHashRoute } from '../lib/app';
import { summarize, type DaySheet, type DaySheetLine } from '../../shared/daySheet.ts';
import { addDays, isYmd, localDate, longDate, shortDateDow } from '../../shared/dates.ts';
import { Badge, ErrorBox, Loading, cx } from '../components/ui';
import { FlowHost, type Flow } from '../components/kitchen/FlowHost';
import { BajasSheet } from '../components/kitchen/Sheets';
import { InventoryTab } from '../components/sheet/InventoryTab';
import { ValidateTab } from '../components/sheet/ValidateTab';
import { OrderTab, PrepTab } from '../components/sheet/OtherTabs';

const TABS = ['inventario', 'preparaciones', 'bajas', 'pedido', 'validar'] as const;
type Tab = (typeof TABS)[number];
const TAB_INFO: Record<Tab, { label: string; icon: LucideIcon }> = {
  inventario: { label: 'Inventario', icon: ClipboardList },
  preparaciones: { label: 'Preparaciones', icon: ChefHat },
  bajas: { label: 'Bajas', icon: Trash2 },
  pedido: { label: 'Pedido', icon: ShoppingBasket },
  validar: { label: 'Validar con caja', icon: ShieldCheck },
};

export default function HojaDia() {
  const route = useHashRoute();
  const today = localDate();
  const pDate = route.params.get('fecha');
  const pTab = route.params.get('tab') as Tab | null;
  const date = pDate && isYmd(pDate) && pDate <= today ? pDate : today;
  const tab: Tab = pTab && TABS.includes(pTab) ? pTab : 'inventario';
  const go = (next: { fecha?: string; tab?: Tab }) => {
    const f = next.fecha ?? date;
    const t = next.tab ?? tab;
    navigate('hoja', { ...(f !== today ? { fecha: f } : {}), ...(t !== 'inventario' ? { tab: t } : {}) });
  };

  const res = useApi<DaySheet>(`/day-sheet?date=${date}`, [date]);
  const [local, setLocal] = useState<{ from: DaySheet | null; sheet: DaySheet | null; lines: DaySheetLine[] }>({ from: null, sheet: null, lines: [] });
  const [flow, setFlow] = useState<Flow | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  // En el celular la barra de pestañas se desliza: la pestaña abierta siempre queda a la vista.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  // Lo que llega del servidor reemplaza la copia local; cada casilla guardada la actualiza sin recargar todo.
  if (res.data && res.data !== local.from) setLocal({ from: res.data, sheet: res.data, lines: res.data.lines });
  const lines = local.lines;
  const current = local.sheet && local.sheet.date === date ? local.sheet : null;
  const live = useMemo(() => (current ? { ...current, lines, summary: summarize(lines) } : null), [current, lines]);
  const onLine = (l: DaySheetLine) => setLocal((st) => ({ ...st, lines: st.lines.map((x) => (x.item_id === l.item_id ? l : x)) }));
  const onSheet = (sh: DaySheet) => setLocal((st) => ({ ...st, sheet: sh, lines: sh.lines }));

  const s = live?.summary;
  const badge: Partial<Record<Tab, string>> = s
    ? {
        inventario: s.close_filled ? `${s.close_filled}/${s.items}` : `${s.open_filled}/${s.items}`,
        validar: live.status === 'validada' ? '✓' : s.to_review ? String(s.to_review) : undefined,
      }
    : {};

  return (
    <div>
      {/* Encabezado: la fecha manda, como en el papel */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-ink-500 uppercase">Hoja del día</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 first-letter:uppercase sm:text-[2.1rem]">
            {date === today ? 'Hoy, ' : ''}
            {longDate(date)}
          </h1>
          {live && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
              {live.status === 'validada' ? (
                <Badge tone="green">
                  <ShieldCheck className="size-3.5" /> Validada por {live.validated_by_name}
                </Badge>
              ) : (
                <Badge tone="amber">Abierta</Badge>
              )}
              <span>
                Inicio {s!.open_filled}/{s!.items} · Fin {s!.close_filled}/{s!.items} · {live.sold_units} platos vendidos
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button className="btn-secondary px-2.5" onClick={() => go({ fecha: addDays(date, -1) })} aria-label="Día anterior">
            <ChevronLeft className="size-5" />
          </button>
          <label className="btn-secondary relative cursor-pointer">
            <CalendarDays className="size-4" />
            <span className="capitalize">{date === today ? 'Hoy' : shortDateDow(date)}</span>
            <input
              type="date"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={date}
              max={today}
              onChange={(e) => e.target.value && go({ fecha: e.target.value })}
              aria-label="Elegir fecha"
            />
          </label>
          <button className="btn-secondary px-2.5" onClick={() => go({ fecha: addDays(date, 1) })} disabled={date >= today} aria-label="Día siguiente">
            <ChevronRight className="size-5" />
          </button>
          {date !== today && (
            <button className="btn-ghost" onClick={() => go({ fecha: today })}>
              Ir a hoy
            </button>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <nav ref={tabsRef} className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] print:hidden" aria-label="Partes de la hoja">
        <div className="flex min-w-max gap-1 border-b border-cream-300">
          {TABS.map((t) => {
            const Icon = TAB_INFO[t].icon;
            const active = t === tab;
            return (
              <button
                key={t}
                onClick={() => go({ tab: t })}
                className={cx(
                  '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  active ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-4" />
                {TAB_INFO[t].label}
                {badge[t] && (
                  <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-ink-900 text-white' : 'bg-cream-200 text-ink-700')}>{badge[t]}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {res.error && !live ? (
        <ErrorBox message={res.error} onRetry={res.reload} />
      ) : !live ? (
        <Loading text="Abriendo la hoja…" />
      ) : (
        <div key={`${date}-${tab}`} className="animate-fade-in">
          {live.status === 'validada' && tab !== 'validar' && (
            <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden">
              Esta hoja ya se validó: se puede consultar pero no cambiar. Para corregirla, el administrador la vuelve a abrir en «Validar con caja».
            </p>
          )}
          {tab === 'inventario' && <InventoryTab sheet={live} lines={lines} onLine={onLine} />}
          {tab === 'preparaciones' && <PrepTab />}
          {tab === 'bajas' && <BajasSheet />}
          {tab === 'pedido' && <OrderTab onFlow={setFlow} />}
          {tab === 'validar' && <ValidateTab sheet={live} lines={lines} onSheet={onSheet} />}
        </div>
      )}
      <FlowHost flow={flow} onClose={() => setFlow(null)} />
    </div>
  );
}
