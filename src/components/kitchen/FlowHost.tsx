import { PrepareFlow } from './PrepareFlow';
import { ShortageFlow, WasteFlow } from './ReportFlows';
import { CountFlow } from './CountFlow';
import type { CountKind } from '../../../shared/kitchen.ts';

export type Flow = { kind: 'preparar'; prepId?: number } | { kind: 'faltante' } | { kind: 'baja' } | { kind: 'conteo'; countKind?: CountKind };

/** Abre el flujo de cocina elegido (preparar, faltante, baja o conteo). */
export function FlowHost({ flow, onClose }: { flow: Flow | null; onClose: () => void }) {
  if (!flow) return null;
  if (flow.kind === 'preparar') return <PrepareFlow onClose={onClose} preparationId={flow.prepId} />;
  if (flow.kind === 'faltante') return <ShortageFlow onClose={onClose} />;
  if (flow.kind === 'baja') return <WasteFlow onClose={onClose} />;
  return <CountFlow onClose={onClose} initialKind={flow.countKind} />;
}
