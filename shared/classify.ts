// El sistema organiza solo: con el nombre de un ingrediente nuevo adivina dónde se guarda,
// en qué categoría va y en qué unidad se cuenta. Es una sugerencia: quien lo agrega la puede cambiar.
import type { Location } from './kitchen.ts';
import type { Unit } from './units.ts';

export interface Guess {
  location: Location;
  category: string;
  unit: Unit;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Reglas en orden: gana la primera que coincide (lo más específico va primero).
const RULES: [RegExp, Guess][] = [
  [/salsa|mayonesa|mostaza|ketchup|pesto|aderezo|vinagreta|bbq|ranchera|adobo|pasta pomodoro/, { location: 'Nevera negra', category: 'Salsas y aderezos', unit: 'g' }],
  [/desmechad|plancha|preparad|caramelizad|picad[oa]|cocid|guisad|sofrit/, { location: 'Nevera negra', category: 'Productos preparados', unit: 'g' }],
  [/masa/, { location: 'Nevera negra', category: 'Masas y panes', unit: 'kg' }],
  [/salchicha|chorizo|butifarra|longaniza|carne de hamburguesa|hamburguesa/, { location: 'Congelador', category: 'Carnes y embutidos', unit: 'unidad' }],
  [/pechuga|pollo|cerdo|res\b|carne|costilla|jamon|tocineta|salami|pepperoni|peperoni|cabano|tocino/, { location: 'Congelador', category: 'Carnes y embutidos', unit: 'kg' }],
  [/papa(s)? (a la )?francesa|papa congelada|maiz|congelad/, { location: 'Congelador', category: 'Verduras y frutas', unit: 'kg' }],
  [/tajada|cheddar|holandes|sabana/, { location: 'Nevera Coca-Cola', category: 'Lácteos', unit: 'unidad' }],
  [/queso|mozzarella|leche|crema|suero|mantequilla|yogur/, { location: 'Nevera Coca-Cola', category: 'Lácteos', unit: 'g' }],
  [/gaseosa|coca|postobon|hit\b|agua|jugo de caja|cerveza|pet\b|litro/, { location: 'Nevera Coca-Cola', category: 'Bebidas', unit: 'unidad' }],
  [/cilantro|perejil|albahaca|lechuga|apio|cebollin|cebolla larga/, { location: 'Nevera Coca-Cola', category: 'Verduras y frutas', unit: 'g' }],
  [/tomate|cebolla|pimenton|zanahoria|pepino|champi|aguacate|limon|naranja|pina|maracuya|mango|fresa|fruta|ajo/, { location: 'Nevera Coca-Cola', category: 'Verduras y frutas', unit: 'kg' }],
  [/platano|huevo/, { location: 'Bodega seca', category: 'Verduras y frutas', unit: 'unidad' }],
  [/pan\b|pan de|pan mini|arepa|tortilla/, { location: 'Bodega seca', category: 'Masas y panes', unit: 'unidad' }],
  [/caja|bandeja|vaso|servilleta|bolsa|aluminio|tenedor|palillo|plato|empaque|desechable|tarrito|porta/, { location: 'Otro', category: 'Empaques', unit: 'unidad' }],
  [/aceite|vinagre|vino/, { location: 'Bodega seca', category: 'Abarrotes', unit: 'ml' }],
  [/harina|azucar|sal\b|levadura|arroz|oregano|comino|pimienta|paprika|laurel|sazon|condiment|especia|ripio|aceituna|bocadillo|cereza/, { location: 'Bodega seca', category: 'Abarrotes', unit: 'g' }],
];

/** Lo que el sistema sugiere para un ingrediente nuevo según su nombre (null si no sabe). */
export function guessItem(name: string): Guess | null {
  const n = norm(name);
  if (n.trim().length < 3) return null;
  for (const [re, g] of RULES) if (re.test(n)) return g;
  return null;
}
