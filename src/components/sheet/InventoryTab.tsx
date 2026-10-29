// Pestaña «Inventario» de la hoja del día: la misma hoja de papel de la cocina.
//   PRODUCTO | INIC · PAQUETE + USO | ENTRADA | FIN · PAQUETE + USO | CONSUMO
// con una franja gris por nevera. Lo escrito queda en «tinta» azul y se guarda solo.
// En el celular se elige qué columna se está llenando (no caben las tres).
import { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Server } from 'lucide-react';
import { api } from '../../lib/api';
import type { DaySheet, DaySheetLine, SheetField } from '../../../shared/daySheet.ts';
import { LOCATIONS, type Location } from '../../../shared/kitchen.ts';
import { useToast } from '../toast';
import { cx } from '../ui';
import { Paper, SECTION, TD, TH } from '../kitchen/Sheets';
import { QtyCell } from './QtyCell';
import { IngredientModal, type IngredientBase } from './IngredientModal';
import { packDescription, qtyText, signedText } from './qty';

const COLUMN: Record<SheetField, { head: string; sub: string; help: string }> = {
  open: { head: 'Inic', sub: 'paquete + uso', help: 'Al abrir: lo que hay en cada nevera.' },
  entry: { head: 'Entrada', sub: 'lo que llegó', help: 'Lo que llegó hoy del proveedor. Entra al inventario de una vez.' },
  close: { head: 'Fin', sub: 'paquete + uso', help: 'Al cerrar: lo que quedó. El consumo se calcula solo.' },
};

/** Como se escribe en la hoja: «12.10.26». */
const paperDate = (ymd: string) => `${Number(ymd.slice(8, 10))}.${ymd.slice(5, 7)}.${ymd.slice(2, 4)}`;

function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function defaultColumn(sheet: DaySheet): SheetField {
  const { items, open_filled, close_filled } = sheet.summary;
  if (close_filled > 0) return 'close';
  return open_filled >= Math.ceil(items * 0.6) ? 'close' : 'open';
}

/** Lo preparado, lo usado en preparaciones y las bajas: una nota pequeña bajo el producto. */
function moveNote(l: DaySheetLine): string {
  const parts: string[] = [];
  if (l.produced_m) parts.push(`preparado ${signedText(l.produced_m, l)}`);
  if (l.used_m) parts.push(`en preparaciones ${signedText(-l.used_m, l)}`);
  if (l.waste_m) parts.push(`bajas ${signedText(-l.waste_m, l)}`);
  return parts.join(' · ');
}

export function InventoryTab({
  sheet,
  lines,
  onLine,
  onSheet,
}: {
  sheet: DaySheet;
  lines: DaySheetLine[];
  onLine: (l: DaySheetLine) => void;
  onSheet: (s: DaySheet) => void;
}) {
  const toast = useToast();
  const wide = useWide();
  const [col, setCol] = useState<SheetField>(() => defaultColumn(sheet));
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ ingredient?: IngredientBase; location?: Location } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = sheet.editable;
  const cols: SheetField[] = wide ? ['open', 'entry', 'close'] : [col];

  const save = (l: DaySheetLine, field: SheetField) => async (milli: number | null) => {
    try {
      const line = await api.post<DaySheetLine>('/day-sheet/cell', { date: sheet.date, item_id: l.item_id, field, value_m: milli });
      onLine(line);
    } catch (e) {
      toast.fail(e);
      throw e;
    }
  };

  const fill = async (source: 'ayer' | 'sistema') => {
    setBusy(true);
    try {
      const s = await api.post<DaySheet>('/day-sheet/fill-open', { date: sheet.date, source });
      onSheet(s);
      const n = s.summary.open_filled - sheet.summary.open_filled;
      toast.success('Inicio llenado', `${n} producto${n === 1 ? '' : 's'}. Revisa y corrige lo que no coincida.`);
    } catch (e) {
      toast.fail(e);
    } finally {
      setBusy(false);
    }
  };

  const term = q.trim().toLowerCase();
  const sections = useMemo(() => {
    const shown = term ? lines.filter((l) => l.name.toLowerCase().includes(term)) : lines;
    return LOCATIONS.map((loc) => ({ loc, lines: shown.filter((l) => l.location === loc) })).filter((s) => s.lines.length);
  }, [lines, term]);

  const missingOpen = lines.filter((l) => l.open_m === null);
  const canCopy = editable && missingOpen.some((l) => l.prev_close_m !== null);
  const s = sheet.summary;

  const cell = (l: DaySheetLine, field: SheetField) => {
    const value = field === 'open' ? l.open_m : field === 'close' ? l.close_m : l.entries_m || null;
    const can = field === 'entry' ? sheet.entries_editable : editable;
    if (!can) return <span className="font-semibold text-[#1f3f8f] tabular-nums">{qtyText(value, l)}</span>;
    return (
      <QtyCell
        paper
        big={!wide}
        value={value}
        measure={l}
        col={field}
        label={`${l.name}: ${field === 'open' ? 'inicio' : field === 'close' ? 'fin' : 'entrada'}`}
        onSave={save(l, field)}
      />
    );
  };

  // En el celular no cabe la columna de consumo: va debajo de la casilla.
  const nCols = (wide ? 2 : 1) + cols.length;

  return (
    <div>
      <Paper
        title="Inventario diario"
        subtitle={`Fecha: ${paperDate(sheet.date)}`}
        nav={
          <div className="relative w-56 max-w-full">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400" />
            <input className="input py-1.5 pl-8 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" />
          </div>
        }
        actions={
          editable && (
            <>
              {missingOpen.length > 0 && canCopy && (
                <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void fill('ayer')} title="El inicio de hoy es lo que quedó al cerrar ayer">
                  <Copy className="size-4" /> Copiar el fin de ayer
                </button>
              )}
              {missingOpen.length > 0 && (
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void fill('sistema')} title="Llena el inicio que falta con lo que lleva el sistema">
                  <Server className="size-4" /> Inicio según el sistema
                </button>
              )}
              <button className="btn-secondary btn-sm" onClick={() => setModal({})}>
                <Plus className="size-4" /> Agregar producto
              </button>
            </>
          )
        }
        note={
          <>
            Inic {s.open_filled}/{s.items} · Fin {s.close_filled}/{s.items}
          </>
        }
      >
        {/* Celular: qué columna se llena (como pasar la hoja de una columna a otra) */}
        {!wide && (
          <div className="mb-3 print:hidden">
            <div className="grid grid-cols-3 border border-ink-900">
              {(['open', 'entry', 'close'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCol(f)}
                  className={cx('border-ink-900 py-2 text-xs font-extrabold tracking-wide uppercase not-last:border-r', col === f ? 'bg-ink-900 text-white' : 'bg-[#d9d9d9] text-ink-900')}
                >
                  {COLUMN[f].head}
                  <span className="block text-[10px] font-semibold tracking-normal normal-case opacity-80">{COLUMN[f].sub}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-500">{COLUMN[col].help}</p>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cx(TH, 'w-[30%] md:w-[28%]')}>Producto</th>
              {cols.map((f) => (
                <th key={f} className={TH}>
                  {COLUMN[f].head}
                  {f !== 'entry' && <span className="font-bold normal-case"> - {COLUMN[f].sub}</span>}
                </th>
              ))}
              {wide && <th className={cx(TH, 'w-[16%] bg-ink-900 text-white')}>Consumo</th>}
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 && (
              <tr>
                <td colSpan={nCols} className={cx(TD, 'py-6 text-center text-ink-500')}>
                  No hay productos con ese nombre.
                </td>
              </tr>
            )}
            {sections.map(({ loc, lines: ls }) => (
              <SectionRows key={loc} loc={loc} lines={ls} cols={cols} nCols={nCols} wide={wide} editable={editable} cell={cell} onEdit={(l) => setModal({ ingredient: l })} onAdd={() => setModal({ location: loc })} />
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[11px] text-ink-500">
          <b>Consumo</b> = inicio + entrada + preparado − lo usado en preparaciones − bajas − fin. Con paquete se escribe como en la hoja: paquetes cerrados + lo que queda del
          abierto. Se guarda solo; <b>Enter</b> baja al siguiente.
          {!sheet.entries_editable && editable && ' La entrada solo se anota el mismo día.'}
        </p>
      </Paper>

      {modal && <IngredientModal ingredient={modal.ingredient} defaultLocation={modal.location} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
    </div>
  );
}

function SectionRows({
  loc,
  lines,
  cols,
  nCols,
  wide,
  editable,
  cell,
  onEdit,
  onAdd,
}: {
  loc: Location;
  lines: DaySheetLine[];
  cols: SheetField[];
  nCols: number;
  wide: boolean;
  editable: boolean;
  cell: (l: DaySheetLine, f: SheetField) => React.ReactNode;
  onEdit: (l: DaySheetLine) => void;
  onAdd: () => void;
}) {
  // Debajo de la franja de cada nevera la hoja dice cómo se cuenta (paquete + uso o unidades + gramos).
  const sub = lines.some((l) => l.pack_size_m > 0) ? 'paquete + uso' : lines.every((l) => l.base_unit === 'unidad') ? 'unidades' : 'unidades + gms';
  return (
    <>
      <tr className="print:break-inside-avoid">
        <td className={SECTION}>{loc}</td>
        <td colSpan={nCols - 1} className="border border-ink-900 bg-[#efefef] px-2 py-1 text-center text-[11px] font-bold text-ink-700">
          {sub}
        </td>
      </tr>
      {lines.map((l) => {
        const note = moveNote(l);
        const consumption = l.consumption_m === null ? '' : `${qtyText(Math.abs(l.consumption_m), l) || '0'}${l.consumption_m < 0 ? ' de más' : ''}`;
        const hint = l.close_m === null && l.expected_close_m !== null ? `Debería quedar ≈ ${qtyText(Math.max(0, l.expected_close_m), l) || '0'}` : undefined;
        return (
          <tr key={l.item_id} className="align-middle">
            <td className={cx(TD, 'py-1')}>
              <div className="flex items-center gap-1">
                <span className="font-semibold">{l.name}</span>
                {editable && (
                  <button className="rounded p-0.5 text-ink-400 hover:bg-cream-200 hover:text-ink-900 print:hidden" onClick={() => onEdit(l)} aria-label={`Editar ${l.name}`} title="Cambiar unidad, paquete o lugar">
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
              {(l.pack_size_m > 0 || note) && (
                <span className="block text-[10.5px] leading-tight text-ink-500">
                  {l.pack_size_m > 0 && packDescription(l)}
                  {l.pack_size_m > 0 && note && ' · '}
                  {note}
                </span>
              )}
            </td>
            {cols.map((f) => (
              <td key={f} className={cx(TD, 'px-1 py-1 text-center')} title={f === 'close' ? hint : undefined}>
                {cell(l, f)}
                {!wide && consumption && <span className="mt-0.5 block text-[11px] text-ink-500">consumo <b className="text-[#1f3f8f]">{consumption}</b></span>}
              </td>
            ))}
            {wide && <td className={cx(TD, 'text-center font-bold text-[#1f3f8f] tabular-nums')}>{consumption}</td>}
          </tr>
        );
      })}
      {editable && (
        <tr className="print:hidden">
          <td colSpan={nCols} className={cx(TD, 'py-1')}>
            <button className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 hover:text-ink-900" onClick={onAdd}>
              <Plus className="size-3.5" /> agregar producto en {loc.toLowerCase()}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
