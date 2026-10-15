// Utilidades de las pantallas de cocina (sin componentes).
import { Snowflake, Refrigerator, Warehouse, Box, type LucideIcon } from 'lucide-react';
import type { BaseUnit, Unit } from '../../../shared/units.ts';
import type { Location } from '../../../shared/kitchen.ts';

export const LOCATION_ICONS: Record<Location, LucideIcon> = {
  Congelador: Snowflake,
  'Nevera negra': Refrigerator,
  'Nevera Coca-Cola': Refrigerator,
  'Bodega seca': Warehouse,
  Otro: Box,
};

/** Acepta coma o punto decimal, como se escribe en Colombia. */
export function parseQty(v: string): number {
  return Number(v.replace(',', '.'));
}

export function validQty(v: string, allowZero = false): boolean {
  if (v.trim() === '') return false;
  const n = parseQty(v);
  return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0);
}

/** Unidad pequeña para pesar en la cocina: g en lugar de kg, ml en lugar de l. */
export function smallUnit(base: BaseUnit): Unit {
  return base === 'g' ? 'g' : base === 'ml' ? 'ml' : 'unidad';
}

/**
 * Reduce la foto del celular (que puede pesar 5 MB) a un JPEG de ~100 KB:
 * suficiente para ver el producto dañado y liviano para guardarlo.
 */
export async function compressPhoto(file: File, maxSide = 960, quality = 0.62): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la foto.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Color según qué tan cerca quedó del rendimiento estándar. */
export function efficiencyTone(pct: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct >= 95) return 'green';
  if (pct >= 90) return 'amber';
  return 'red';
}
