// Cada hoja de Pizza Diana es una página del menú, con los atajos de siempre arriba
// (preparar, avisar un faltante, dar de baja) para no tener que ir a otra pantalla.
import { useState, type ReactNode } from 'react';
import { ChefHat, Megaphone, Scissors, Trash2 } from 'lucide-react';
import { useApp } from '../lib/app';
import { FlowHost, type Flow } from '../components/kitchen/FlowHost';
import { BajasSheet, BebidasSheet, EntradasSheet, InventoryDaySheet, MasaSheet, MermaSheet, PorcionadoSheet, VentasSheet } from '../components/kitchen/Sheets';

function SheetPage({ children }: { children: (onFlow: (f: Flow) => void) => ReactNode }) {
  const { can } = useApp();
  const [flow, setFlow] = useState<Flow | null>(null);
  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
        {can('kitchen.use') && (
          <button className="btn-primary btn-sm" onClick={() => setFlow({ kind: 'preparar' })}>
            <ChefHat className="size-4" /> Preparar
          </button>
        )}
        {can('kitchen.use') && (
          <button className="btn-secondary btn-sm" onClick={() => setFlow({ kind: 'porcionar' })}>
            <Scissors className="size-4" /> Porcionar
          </button>
        )}
        {can('kitchen.report') && (
          <>
            <button className="btn-secondary btn-sm" onClick={() => setFlow({ kind: 'faltante' })}>
              <Megaphone className="size-4" /> Falta algo
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setFlow({ kind: 'baja' })}>
              <Trash2 className="size-4" /> Dar de baja
            </button>
          </>
        )}
      </div>
      {children(setFlow)}
      <FlowHost flow={flow} onClose={() => setFlow(null)} />
    </>
  );
}

export function HojaInventario() {
  return <SheetPage>{() => <InventoryDaySheet />}</SheetPage>;
}

export function HojaVentas() {
  return <SheetPage>{() => <VentasSheet />}</SheetPage>;
}

export function HojaMerma() {
  return <SheetPage>{(onFlow) => <MermaSheet onFlow={onFlow} />}</SheetPage>;
}

export function HojaMasa() {
  return <SheetPage>{(onFlow) => <MasaSheet onFlow={onFlow} />}</SheetPage>;
}

export function HojaBajas() {
  return <SheetPage>{(onFlow) => <BajasSheet onFlow={onFlow} />}</SheetPage>;
}

export function HojaEntradas() {
  return <SheetPage>{() => <EntradasSheet />}</SheetPage>;
}

export function HojaPorcionado() {
  return <SheetPage>{(onFlow) => <PorcionadoSheet onFlow={onFlow} />}</SheetPage>;
}

export function HojaBebidas() {
  return <SheetPage>{() => <BebidasSheet />}</SheetPage>;
}
