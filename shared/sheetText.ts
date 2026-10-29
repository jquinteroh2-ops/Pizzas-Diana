// Lo que se escribe en una casilla de la hoja, como a mano: «3 paq + 385», «542 grs», «2 und».
// Lo usan la interfaz y las pruebas.
import type { BaseUnit, Unit } from './units.ts';

export interface SheetMeasure {
  unit: Unit;
  base_unit: BaseUnit;
  pack_size_m: number;
  pack_label: string;
}

const small = (b: BaseUnit): Unit => (b === 'g' ? 'g' : b === 'ml' ? 'ml' : 'unidad');

const PACK_WORDS = /^(p|pq|pqt|pag|pags|paq|paqs|paquete|paquetes|bol|bolsa|bolsas|bolson|bolsón|bolsones|bloque|bloques|caja|cajas|tarro|tarros)$/;
const UNIT_WORDS: Record<string, Unit> = {
  g: 'g', gr: 'g', grs: 'g', gm: 'g', gms: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', mls: 'ml', mililitro: 'ml', mililitros: 'ml',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  u: 'unidad', und: 'unidad', unds: 'unidad', un: 'unidad', unid: 'unidad', unidad: 'unidad', unidades: 'unidad',
};

/**
 * Lee lo que se escribió en una casilla, como en el papel:
 * «3 paq + 385», «3p+385 grs», «2 paq», «542 grs», «1,085 kg», «1085», «2 und».
 * Devuelve milésimas de la unidad base; null si está vacía; NaN si no se entiende.
 */
export function parseSheetText(text: string, m: SheetMeasure): number | null {
  const t = text.trim().toLowerCase();
  if (!t || t === '-' || t === '—') return null;
  const parts = t.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) return NaN;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const mt = parts[i].match(/^(\d+(?:[.,]\d+)?)\s*([a-zñó]*)\.?$/);
    if (!mt) return NaN;
    const n = Number(mt[1].replace(',', '.'));
    const word = mt[2];
    const asPack = m.pack_size_m > 0 && (PACK_WORDS.test(word) || word === (m.pack_label || 'paquete').toLowerCase() || (!word && parts.length === 2 && i === 0));
    if (asPack) {
      total += Math.round(n * m.pack_size_m);
      continue;
    }
    if (word && PACK_WORDS.test(word)) return NaN; // dice «paquete» pero este producto no viene en paquete
    const unit = word ? UNIT_WORDS[word] : (m.pack_size_m > 0 ? small(m.base_unit) : m.unit);
    if (!unit) return NaN;
    const ok = m.base_unit === 'unidad' ? unit === 'unidad' : m.base_unit === 'ml' ? unit === 'ml' || unit === 'l' || unit === 'g' || unit === 'kg' : unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l';
    if (!ok) return NaN;
    // Entre g y ml se toma 1 ml = 1 g (salsas).
    const base = unit === 'kg' || unit === 'l' ? 1_000_000 : 1000;
    total += Math.round(n * base);
  }
  return total;
}
