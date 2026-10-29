// Pestaña «Inventario» de la hoja del día: literalmente la hoja de papel de la cocina.
//   PRODUCTO | INIC - paquete + uso | ENTRADA | FIN - paquete + uso | CONSUMO
// con una franja gris por nevera. Cada casilla se llena escribiendo como a mano
// («3 paq + 385», «542 grs»); solo el consumo lo saca el sistema.
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import type { DaySheet, DaySheetLine, SheetField } from '../../../shared/daySheet.ts';
import { LOCATIONS, type Location } from '../../../shared/kitchen.ts';
import { useToast } from '../toast';
import { cx } from '../ui';
import { Paper, SECTION, TD, TH } from '../kitchen/Sheets';
import { PaperCell } from './PaperCell';
import { IngredientModal, type IngredientBase } from './IngredientModal';
import { packDescription, qtyText, signedText } from './qty';

/** Como se escribe la fecha en la hoja: «12.10.26». */
const paperDate = (ymd: string) => `${Number(ymd.slice(8, 10))}.${ymd.slice(5, 7)}.${ymd.slice(2, 4)}`;

/** Lo preparado, lo usado en preparaciones y las bajas: una nota pequeña bajo el producto. */
function moveNote(l: DaySheetLine): string {
  const parts: string[] = [];
  if (l.produced_m) parts.push(`preparado ${signedText(l.produced_m, l)}`);
  if (l.used_m) parts.push(`en preparaciones ${signedText(-l.used_m, l)}`);
  if (l.waste_m) parts.push(`bajas ${signedText(-l.waste_m, l)}`);
  return parts.join(' · ');
}

const FIELDS: SheetField[] = ['open', 'entry', 'close'];

export function InventoryTab({ sheet, lines, onLine }: { sheet: DaySheet; lines: DaySheetLine[]; onLine: (l: DaySheetLine) => void }) {
  const toast = useToast();
  const [modal, setModal] = useState<{ ingredient?: IngredientBase; location?: Location } | null>(null);
  const editable = sheet.editable;

  const save = (l: DaySheetLine, field: SheetField) => async (milli: number | null) => {
    try {
      onLine(await api.post<DaySheetLine>('/day-sheet/cell', { date: sheet.date, item_id: l.item_id, field, value_m: milli }));
    } catch (e) {
      toast.fail(e);
      throw e;
    }
  };

  const sections = LOCATIONS.map((loc) => ({ loc, lines: lines.filter((l) => l.location === loc) })).filter((s) => s.lines.length);

  const cell = (l: DaySheetLine, field: SheetField) => {
    const value = field === 'open' ? l.open_m : field === 'close' ? l.close_m : l.entries_m || null;
    const can = field === 'entry' ? sheet.entries_editable : editable;
    if (!can) return <span className="block px-1.5 py-2 text-center text-[15px] font-semibold text-[#1f3f8f] tabular-nums">{qtyText(value, l)}</span>;
    const name = field === 'open' ? 'inicio' : field === 'close' ? 'fin' : 'entrada';
    return <PaperCell value={value} measure={l} col={field} label={`${l.name}: ${name}`} onSave={save(l, field)} />;
  };

  // Columna del producto fija al deslizar la hoja de lado en el celular.
  const sticky = 'sticky left-0 z-10 bg-white';

  return (
    <div>
      <Paper
        title="Inventario diario"
        subtitle={`Fecha: ${paperDate(sheet.date)}`}
        actions={
          editable && (
            <button className="btn-secondary btn-sm" onClick={() => setModal({})}>
              <Plus className="size-4" /> Agregar producto
            </button>
          )
        }
      >
        <p className="mb-1 text-right text-[11px] font-semibold text-ink-500 md:hidden print:hidden">Deslice la hoja →</p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={cx(TH, 'sticky left-0 z-10 w-[30%]')}>Producto</th>
                <th className={TH}>
                  Inic <span className="font-bold normal-case">- paquete + uso</span>
                </th>
                <th className={cx(TH, 'w-[13%]')}>Entrada</th>
                <th className={TH}>
                  Fin <span className="font-bold normal-case">- paquete + uso</span>
                </th>
                <th className={cx(TH, 'w-[15%] bg-ink-900 text-white')}>Consumo</th>
              </tr>
            </thead>
            <tbody>
              {sections.map(({ loc, lines: ls }) => {
                // Debajo de la franja la hoja dice cómo se cuenta esa nevera.
                const sub = ls.some((l) => l.pack_size_m > 0) ? 'inic - paquete + uso' : ls.every((l) => l.base_unit === 'unidad') ? 'unidades' : 'unidades + gms';
                return (
                  <SectionRows
                    key={loc}
                    loc={loc}
                    sub={sub}
                    lines={ls}
                    editable={editable}
                    sticky={sticky}
                    cell={cell}
                    onEdit={(l) => setModal({ ingredient: l })}
                    onAdd={() => setModal({ location: loc })}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-ink-500">
          Se escribe como en la hoja: <b>3 paq + 385</b> (paquetes cerrados + lo que queda del abierto), <b>542 grs</b>, <b>1,085 kg</b>, <b>24 und</b>. Se guarda solo al pasar a otra
          casilla; <b>Enter</b> baja al siguiente. Consumo = inicio + entrada + preparado − lo usado en preparaciones − bajas − fin.
          {!sheet.entries_editable && editable && ' La entrada solo se anota el mismo día.'}
        </p>
      </Paper>

      {modal && <IngredientModal ingredient={modal.ingredient} defaultLocation={modal.location} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
    </div>
  );
}

function SectionRows({
  loc,
  sub,
  lines,
  editable,
  sticky,
  cell,
  onEdit,
  onAdd,
}: {
  loc: Location;
  sub: string;
  lines: DaySheetLine[];
  editable: boolean;
  sticky: string;
  cell: (l: DaySheetLine, f: SheetField) => React.ReactNode;
  onEdit: (l: DaySheetLine) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <tr>
        <td className={cx(SECTION, 'sticky left-0 z-10')}>{loc}</td>
        <td className="border border-ink-900 bg-[#efefef] px-2 py-1 text-center text-[11px] font-bold text-ink-700">{sub}</td>
        <td colSpan={3} className="border border-ink-900 bg-[#efefef]" />
      </tr>
      {lines.map((l) => {
        const note = moveNote(l);
        const consumption = l.consumption_m === null ? '' : `${qtyText(Math.abs(l.consumption_m), l) || '0'}${l.consumption_m < 0 ? ' de más' : ''}`;
        return (
          <tr key={l.item_id}>
            <td className={cx(TD, sticky, 'py-1')}>
              <div className="flex items-center gap-1">
                <span className="font-semibold">{l.name}</span>
                {editable && (
                  <button
                    className="rounded p-0.5 text-ink-400 hover:bg-cream-200 hover:text-ink-900 print:hidden"
                    onClick={() => onEdit(l)}
                    aria-label={`Editar ${l.name}`}
                    title="Cambiar unidad, paquete o lugar"
                  >
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
            {FIELDS.map((f) => (
              <td key={f} className={cx(TD, 'p-0')}>
                {cell(l, f)}
              </td>
            ))}
            <td className={cx(TD, 'text-center font-bold text-[#1f3f8f] tabular-nums')}>{consumption}</td>
          </tr>
        );
      })}
      {editable && (
        <tr className="print:hidden">
          <td colSpan={5} className={cx(TD, 'py-1')}>
            <button className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 hover:text-ink-900" onClick={onAdd}>
              <Plus className="size-3.5" /> agregar producto en {loc.toLowerCase()}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
