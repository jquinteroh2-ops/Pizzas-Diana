// Catálogo de Pizza Diana tomado de sus hojas de inventario en papel (congelador,
// nevera negra y nevera Coca-Cola, hoja de masa y hoja de merma).
// Lo usan "Cargar catálogo Pizza Diana" (existencias en 0) y los datos DEMO.
// Las cantidades por plato de las recetas son SUGERIDAS: el administrador debe
// revisarlas con el dueño en Productos y recetas.
import type { Unit } from './units.ts';
import type { ItemKind, Location, PrepMode } from './kitchen.ts';

export interface CatalogItem {
  key: string;
  name: string;
  category: string;
  location: Location;
  unit: Unit;
  kind: ItemKind;
  /** Mínimo de alerta, en `unit`. */
  min: number;
  /** Existencia para la DEMO, en `unit`. */
  demoQty: number;
  /** Presentación como en la hoja (paquete, bolsón): tamaño en g/ml/und y nombre. Aproximado: la cocina lo corrige. */
  pack?: [size: number, label: string];
}

export const CATALOG_ITEMS: CatalogItem[] = [
  // ---- Congelador: como en la hoja de papel ----
  { key: 'queso_montanita', name: 'Queso montañita', category: 'Lácteos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.4 },
  { key: 'chorizo_santacruz', name: 'Chorizo Santa Cruz', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 3.385, pack: [1000, 'paquete'] },
  { key: 'jamon', name: 'Jamón', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1.5, demoQty: 4.4, pack: [500, 'paquete'] },
  { key: 'salchicha_manguera', name: 'Salchicha manguera', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 30, pack: [10, 'paquete'] },
  { key: 'pepperoni', name: 'Pepperoni', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.77, pack: [500, 'paquete'] },
  { key: 'chorizo_parrillada', name: 'Chorizo parrillada', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 32, pack: [6, 'paquete'] },
  { key: 'salami', name: 'Salami', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.248, pack: [500, 'paquete'] },
  { key: 'salchicha_zenu', name: 'Salchicha Zenú', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 8, demoQty: 24, pack: [8, 'paquete'] },
  { key: 'tocineta', name: 'Tocineta', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.172, pack: [500, 'paquete'] },
  { key: 'salchicha_mini', name: 'Salchicha mini', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 25, pack: [10, 'paquete'] },
  { key: 'maiz', name: 'Maíz tierno', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.27, pack: [500, 'paquete'] },
  { key: 'papas', name: 'Papas a la francesa', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 3, demoQty: 9 },
  { key: 'pechuga_cruda', name: 'Pechuga cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 2, demoQty: 10.85 },
  { key: 'carne_molida', name: 'Carne molida cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 3 },
  { key: 'cerdo_crudo', name: 'Cerdo crudo', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 5.18 },
  { key: 'carne_hamb_gde', name: 'Carne de hamburguesa grande', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 25 },
  { key: 'carne_hamb_peq', name: 'Carne de hamburguesa pequeña', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 24 },
  // ---- Nevera negra: como en la hoja de papel ----
  { key: 'pechuga_desmechada', name: 'Pechuga desmechada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8, demoQty: 1.7 },
  { key: 'pechuga_plancha', name: 'Pechuga a la plancha', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8, demoQty: 1.085 },
  { key: 'carne_molida_prep', name: 'Carne molida preparada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5, demoQty: 0.9 },
  { key: 'cerdo_prep', name: 'Cerdo preparado', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5, demoQty: 1.04 },
  { key: 'salsa_tomate', name: 'Salsa de tomate', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, demoQty: 1800, pack: [1000, 'bolsón'] },
  { key: 'salsa_pina', name: 'Salsa de piña', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, demoQty: 1181, pack: [1000, 'bolsón'] },
  { key: 'salsa_pizza', name: 'Salsa de pizza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 1000, demoQty: 2753 },
  { key: 'pasta_pizza', name: 'Pasta de pizza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 0, demoQty: 1000 },
  { key: 'salsa_mostaza', name: 'Salsa mostaza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 500, demoQty: 1995 },
  { key: 'pina_trocitos', name: 'Piña en trocitos', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 400, demoQty: 2560 },
  { key: 'adobo', name: 'Adobo para carnes', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, demoQty: 855 },
  { key: 'cebolla_caramelizada', name: 'Cebolla caramelizada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 340 },
  { key: 'salsa_bbq', name: 'Salsa BBQ', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, demoQty: 470 },
  // ---- Nevera Coca-Cola: como en la hoja de papel ----
  { key: 'tomate', name: 'Tomate', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1, demoQty: 1.8 },
  { key: 'cebolla', name: 'Cebolla', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1.5, demoQty: 4.575 },
  { key: 'pimenton', name: 'Pimentón', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 0.79 },
  { key: 'mayonesa', name: 'Mayonesa', category: 'Salsas y aderezos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 1000, demoQty: 3000, pack: [1000, 'bolsón'] },
  { key: 'salsa_ajo', name: 'Salsa de ajo', category: 'Salsas y aderezos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 200, demoQty: 265 },
  { key: 'vino', name: 'Vino de cocina', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'ml', kind: 'insumo', min: 300, demoQty: 605 },
  { key: 'lechuga', name: 'Lechuga crespa', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 300, demoQty: 240 },
  // ---- Lo que no está en la hoja de papel pero usan las recetas (queda al final de cada lugar) ----
  { key: 'chorizo_santarrosano', name: 'Chorizo santarrosano', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.5 },
  { key: 'chorizo_espanol', name: 'Chorizo español', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1 },
  { key: 'butifarra', name: 'Butifarra', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 40 },
  { key: 'cabano', name: 'Cábano', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1 },
  { key: 'masa', name: 'Masa de pizza', category: 'Masas y panes', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 3, demoQty: 9.2 },
  { key: 'cebolla_picada', name: 'Cebolla picada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 650 },
  { key: 'tomate_picado', name: 'Tomate picado', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 520 },
  { key: 'salsa_casa', name: 'Salsa de la casa', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 1000, demoQty: 3000 },
  { key: 'salsa_ahumada', name: 'Salsa ahumada', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 300, demoQty: 900 },
  { key: 'salsa_ranchera', name: 'Salsa ranchera', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 300, demoQty: 800 },
  { key: 'salsa_pesto', name: 'Salsa de pesto', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, demoQty: 700 },
  { key: 'vinagreta', name: 'Vinagreta de la casa', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 300, demoQty: 800 },
  { key: 'pepinillos', name: 'Pepinillos', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 200, demoQty: 500 },
  { key: 'pimenton_encurtido', name: 'Pimentón encurtido', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 200, demoQty: 400 },
  { key: 'queso_mozzarella', name: 'Queso mozzarella', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 3, demoQty: 8.5 },
  { key: 'queso_costeno', name: 'Queso costeño', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.5 },
  { key: 'queso_cheddar', name: 'Queso cheddar (tajadas)', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 20, demoQty: 60 },
  { key: 'queso_parmesano', name: 'Queso parmesano', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 200, demoQty: 600 },
  { key: 'champinones', name: 'Champiñones', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 500, demoQty: 1500 },
  { key: 'ajo', name: 'Ajo', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 100, demoQty: 300 },
  { key: 'uchuvas', name: 'Uchuvas', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 200, demoQty: 500 },
  { key: 'levadura', name: 'Levadura fresca', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 100, demoQty: 450 },
  { key: 'leche', name: 'Leche', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'l', kind: 'insumo', min: 2, demoQty: 6 },
  { key: 'limon', name: 'Limón', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.5 },
  { key: 'postobon_125', name: 'Postobón 1,25 L', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6, demoQty: 12 },
  { key: 'cocacola_15', name: 'Coca-Cola 1,5 L', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6, demoQty: 12 },
  { key: 'hit_litro', name: 'Hit litro', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6, demoQty: 10 },
  { key: 'eco_litro', name: 'Eco litro', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6, demoQty: 10 },
  { key: 'cocacola_pet', name: 'Coca-Cola Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 30 },
  { key: 'postobon_pet', name: 'Postobón Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 30 },
  { key: 'hit_pet', name: 'Hit Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 24 },
  { key: 'agua_pet', name: 'Agua Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 24 },
  { key: 'harina', name: 'Harina de trigo 0000', category: 'Abarrotes', location: 'Bodega seca', unit: 'kg', kind: 'insumo', min: 15, demoQty: 42 },
  { key: 'sal', name: 'Sal', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, demoQty: 2500 },
  { key: 'aceite', name: 'Aceite de girasol', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 1000, demoQty: 4000 },
  { key: 'azucar', name: 'Azúcar', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, demoQty: 2000 },
  { key: 'pan_hamburguesa', name: 'Pan de hamburguesa', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 40 },
  { key: 'pan_perro', name: 'Pan de perro', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 30 },
  { key: 'pulpa_fruta', name: 'Pulpa de fruta', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 3 },
  { key: 'crema_coco', name: 'Crema de coco', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 400, demoQty: 1200 },
  { key: 'cerezas', name: 'Cerezas en almíbar', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 200, demoQty: 600 },
  { key: 'pan_suave', name: 'Pan suave pequeño', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 30 },
  { key: 'aceitunas', name: 'Aceitunas', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 200, demoQty: 600 },
  { key: 'oregano', name: 'Orégano', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 50, demoQty: 150 },
  { key: 'bocadillo', name: 'Bocadillo', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, demoQty: 1500 },
  { key: 'cebolla_crispi', name: 'Cebolla crispi', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 300, demoQty: 800 },
  { key: 'papa_ripio', name: 'Papa ripio', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 300, demoQty: 800 },
  { key: 'caja_pizza', name: 'Caja para pizza', category: 'Empaques', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 30, demoQty: 120 },
];

export interface CatalogPreparation {
  key: string;
  name: string;
  output: string;
  mode: PrepMode;
  /** Ingredientes del lote estándar: [clave, cantidad, unidad]. El primero es el ingrediente base. */
  inputs: [key: string, qty: number, unit: Unit][];
  /** Lo que rinde el lote estándar, en la unidad de la salida. */
  stdOutput: [qty: number, unit: Unit];
  instructions: string;
}

export const CATALOG_PREPARATIONS: CatalogPreparation[] = [
  {
    key: 'masa',
    name: 'Masa de pizza',
    output: 'masa',
    mode: 'lote',
    inputs: [
      ['harina', 5000, 'g'],
      ['levadura', 30, 'g'],
      ['sal', 25, 'g'],
      ['aceite', 60, 'ml'],
      ['azucar', 10, 'g'],
    ],
    stdOutput: [7.715, 'kg'],
    instructions: 'Receta estándar de la hoja «Masa de pizza». Agua: 500 ml por cada kg de harina (no se descuenta del inventario).',
  },
  {
    key: 'cebolla_caramelizada',
    name: 'Cebolla caramelizada',
    output: 'cebolla_caramelizada',
    mode: 'transformacion',
    inputs: [['cebolla', 1000, 'g']],
    stdOutput: [450, 'g'],
    instructions: 'Pelar, cortar en pluma y cocinar a fuego lento. La cebolla pierde mucha agua: rinde cerca de la mitad.',
  },
  {
    key: 'cebolla_picada',
    name: 'Cebolla picada',
    output: 'cebolla_picada',
    mode: 'transformacion',
    inputs: [['cebolla', 1000, 'g']],
    stdOutput: [850, 'g'],
    instructions: 'Pelar y picar. La cáscara y las puntas son la merma.',
  },
  {
    key: 'tomate_picado',
    name: 'Tomate picado',
    output: 'tomate_picado',
    mode: 'transformacion',
    inputs: [['tomate', 1000, 'g']],
    stdOutput: [850, 'g'],
    instructions: 'Lavar, quitar el tallo y picar.',
  },
  {
    key: 'pechuga_desmechada',
    name: 'Pechuga desmechada',
    output: 'pechuga_desmechada',
    mode: 'transformacion',
    inputs: [['pechuga_cruda', 1000, 'g']],
    stdOutput: [650, 'g'],
    instructions: 'Cocinar la pechuga, dejar enfriar y desmechar.',
  },
  {
    key: 'pechuga_plancha',
    name: 'Pechuga a la plancha',
    output: 'pechuga_plancha',
    mode: 'transformacion',
    inputs: [['pechuga_cruda', 1000, 'g']],
    stdOutput: [750, 'g'],
    instructions: 'Porcionar, adobar y asar a la plancha.',
  },
  {
    key: 'cerdo_prep',
    name: 'Cerdo preparado',
    output: 'cerdo_prep',
    mode: 'transformacion',
    inputs: [['cerdo_crudo', 1000, 'g']],
    stdOutput: [700, 'g'],
    instructions: 'Limpiar, porcionar y cocinar con adobo.',
  },
  {
    key: 'carne_molida_prep',
    name: 'Carne molida preparada',
    output: 'carne_molida_prep',
    mode: 'transformacion',
    inputs: [['carne_molida', 1000, 'g']],
    stdOutput: [800, 'g'],
    instructions: 'Sofreír la carne con sus condimentos.',
  },
];

export interface CatalogProduct {
  key: string;
  name: string;
  category: string;
  type: 'preparado' | 'directo';
  description: string;
  recipe: [key: string, qty: number, unit: Unit][];
  /** Peso relativo de ventas para la DEMO. */
  weight: number;
}

type Line = [key: string, qty: number, unit: Unit];

/** Multiplica las cantidades de una receta; las unidades sueltas (panes, tajadas, cajas) se redondean. */
const scale = (lines: Line[], f: number): Line[] =>
  lines.map(([k, q, u]) => [k, u === 'unidad' ? Math.max(1, Math.round(q * f)) : Math.round(q * f), u]);

/** Una receta no puede repetir un ingrediente: suma las líneas iguales (p. ej. la doble mozzarella). */
const merge = (lines: Line[]): Line[] => {
  const byKey = new Map<string, Line>();
  for (const [k, q, u] of lines) {
    const prev = byKey.get(k);
    byKey.set(k, prev ? [k, prev[1] + q, u] : [k, q, u]);
  }
  return [...byKey.values()];
};

// ---- Pizzas: un producto por tamaño, como en la carta (personal, small, medium, familiar) ----
// Los ingredientes de cada sabor están escritos para una MEDIUM; `factor` los ajusta a cada tamaño.
const PIZZA_SIZES: { name: string; key: string; masa: number; salsa: number; queso: number; factor: number; weight: number }[] = [
  { name: 'personal', key: 'p', masa: 150, salsa: 40, queso: 90, factor: 0.4, weight: 1 },
  { name: 'small', key: 's', masa: 250, salsa: 60, queso: 140, factor: 0.6, weight: 1 },
  { name: 'medium', key: 'm', masa: 400, salsa: 100, queso: 220, factor: 1, weight: 1.6 },
  { name: 'familiar', key: 'f', masa: 650, salsa: 160, queso: 350, factor: 1.6, weight: 1.2 },
];

const PIZZAS: { key: string; name: string; line: string; description: string; toppings: Line[]; weight: number }[] = [
  // Tradición
  { key: 'salami', name: 'Salami', line: 'Tradición', description: 'Mozzarella y salami.', weight: 4, toppings: [['salami', 90, 'g']] },
  { key: 'pepperoni', name: 'Pepperoni', line: 'Tradición', description: 'Mozzarella y pepperoni.', weight: 8, toppings: [['pepperoni', 80, 'g']] },
  { key: 'chorizo', name: 'Chorizo', line: 'Tradición', description: 'Mozzarella y chorizo.', weight: 4, toppings: [['chorizo_santacruz', 90, 'g']] },
  { key: 'jamon_queso', name: 'Jamón y queso', line: 'Tradición', description: 'Mozzarella y jamón ahumado.', weight: 6, toppings: [['jamon', 100, 'g']] },
  { key: 'hawaiana', name: 'Hawaiana', line: 'Tradición', description: 'Mozzarella, jamón ahumado y piña.', weight: 10, toppings: [['jamon', 90, 'g'], ['pina_trocitos', 90, 'g']] },
  { key: 'pollo_champi', name: 'Pollo champiñones', line: 'Tradición', description: 'Mozzarella, pollo y champiñones.', weight: 6, toppings: [['pechuga_desmechada', 100, 'g'], ['champinones', 60, 'g']] },
  {
    key: 'pollo_vegetales', name: 'Pollo vegetales', line: 'Tradición', description: 'Mozzarella, pollo, tomate, ajo, cebolla y pimentón.', weight: 3,
    toppings: [['pechuga_desmechada', 90, 'g'], ['tomate', 40, 'g'], ['ajo', 5, 'g'], ['cebolla', 30, 'g'], ['pimenton', 30, 'g']],
  },
  { key: 'margarita', name: 'Margarita', line: 'Tradición', description: 'Mozzarella, orégano y salsa de pesto.', weight: 2, toppings: [['oregano', 2, 'g'], ['salsa_pesto', 25, 'g']] },
  { key: 'solo_mozzarella', name: 'Solo mozzarella', line: 'Tradición', description: 'Doble mozzarella.', weight: 2, toppings: [['queso_mozzarella', 60, 'g']] },
  // Green Ndiana
  {
    key: 'pollo_fusion', name: 'Pollo fusión', line: 'Green Ndiana', description: 'Mozzarella, pollo, ranchera, pesto y jamón ahumado.', weight: 3,
    toppings: [['pechuga_desmechada', 80, 'g'], ['salsa_ranchera', 25, 'ml'], ['salsa_pesto', 20, 'g'], ['jamon', 60, 'g']],
  },
  { key: 'pollo_pesto', name: 'Pollo al pesto', line: 'Green Ndiana', description: 'Mozzarella, pollo, tomate y salsa de pesto.', weight: 3, toppings: [['pechuga_desmechada', 100, 'g'], ['tomate', 40, 'g'], ['salsa_pesto', 30, 'g']] },
  {
    key: 'vegetariana', name: 'Vegetariana', line: 'Green Ndiana', description: 'Pimentón, cebolla, ajo, champiñones, piña y aceitunas.', weight: 2,
    toppings: [['pimenton', 30, 'g'], ['cebolla', 30, 'g'], ['ajo', 5, 'g'], ['champinones', 50, 'g'], ['pina_trocitos', 50, 'g'], ['aceitunas', 25, 'g']],
  },
  {
    key: 'napolitana', name: 'Napolitana', line: 'Green Ndiana', description: 'Mozzarella, tomate y pesto, chorizo y pollo.', weight: 2,
    toppings: [['tomate', 50, 'g'], ['salsa_pesto', 20, 'g'], ['chorizo_santacruz', 60, 'g'], ['pechuga_desmechada', 60, 'g']],
  },
  {
    key: 'pollo_chorizo_jamon', name: 'Pollo, chorizo y jamón', line: 'Green Ndiana', description: 'Mozzarella, chorizo santarrosano, pesto, pollo y jamón ahumado.', weight: 3,
    toppings: [['chorizo_santarrosano', 60, 'g'], ['salsa_pesto', 20, 'g'], ['pechuga_desmechada', 60, 'g'], ['jamon', 60, 'g']],
  },
  // Exclusive Ndiana
  {
    key: 'del_campo', name: 'Del campo especial', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo, tocineta, maíz tierno, parmesano y cebolla caramelizada.', weight: 3,
    toppings: [['pechuga_desmechada', 70, 'g'], ['tocineta', 40, 'g'], ['maiz', 40, 'g'], ['queso_parmesano', 15, 'g'], ['cebolla_caramelizada', 40, 'g']],
  },
  {
    key: 'cartagenera', name: 'Cartagenera', line: 'Exclusive Ndiana', description: 'Mozzarella, chorizo, butifarra, maíz y ajo.', weight: 4,
    toppings: [['chorizo_santacruz', 60, 'g'], ['butifarra', 2, 'unidad'], ['maiz', 40, 'g'], ['ajo', 5, 'g']],
  },
  {
    key: 'carnavalera', name: 'Carnavalera', line: 'Exclusive Ndiana', description: 'Mozzarella, jamón, salami, cábano, tomate, cebolla y pimentón finamente picados.', weight: 2,
    toppings: [['jamon', 40, 'g'], ['salami', 40, 'g'], ['cabano', 40, 'g'], ['tomate', 30, 'g'], ['cebolla', 30, 'g'], ['pimenton', 30, 'g']],
  },
  {
    key: 'pollo_barbacoa', name: 'Pollo barbacoa', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo, carne, jamón, salsa BBQ y salsa ahumada.', weight: 3,
    toppings: [['pechuga_desmechada', 70, 'g'], ['carne_molida_prep', 60, 'g'], ['jamon', 40, 'g'], ['salsa_bbq', 30, 'g'], ['salsa_ahumada', 20, 'ml']],
  },
  { key: 'pollo_dulce', name: 'Pollo dulce', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo y cebolla caramelizada.', weight: 3, toppings: [['pechuga_desmechada', 90, 'g'], ['cebolla_caramelizada', 50, 'g']] },
  {
    key: 'mediterranea', name: 'Mediterránea', line: 'Exclusive Ndiana', description: 'Mozzarella, pimentón encurtido, aceitunas, tomate y salsa de pesto.', weight: 2,
    toppings: [['pimenton_encurtido', 40, 'g'], ['aceitunas', 30, 'g'], ['tomate', 40, 'g'], ['salsa_pesto', 20, 'g']],
  },
  // Bacon Ndiana
  {
    key: 'tocineta_pina', name: 'Tocineta y piña en almíbar', line: 'Bacon Ndiana', description: 'Mozzarella, tocineta, jamón ahumado y piña caramelizada.', weight: 3,
    toppings: [['tocineta', 50, 'g'], ['jamon', 50, 'g'], ['pina_trocitos', 70, 'g']],
  },
  { key: 'campesina', name: 'Campesina', line: 'Bacon Ndiana', description: 'Mozzarella, maíz tierno y tocineta ahumada.', weight: 3, toppings: [['maiz', 50, 'g'], ['tocineta', 60, 'g']] },
  { key: 'pollo_tocineta', name: 'Pollo tocineta', line: 'Bacon Ndiana', description: 'Mozzarella, pollo y tocineta.', weight: 3, toppings: [['pechuga_desmechada', 80, 'g'], ['tocineta', 50, 'g']] },
  {
    key: 'tocineta_cebolla', name: 'Tocineta y cebolla caramelizada', line: 'Bacon Ndiana', description: 'Mozzarella, tocineta y cebolla caramelizada.', weight: 3,
    toppings: [['tocineta', 60, 'g'], ['cebolla_caramelizada', 60, 'g']],
  },
  // Candy Ndiana
  { key: 'bocadillo_parmesano', name: 'Bocadillo parmesano', line: 'Candy Ndiana', description: 'Mozzarella, parmesano y bocadillo.', weight: 2, toppings: [['queso_parmesano', 20, 'g'], ['bocadillo', 100, 'g']] },
  {
    key: 'bocadillo_tocineta', name: 'Bocadillo tocineta', line: 'Candy Ndiana', description: 'Mozzarella, bocadillo, parmesano y tocineta.', weight: 2,
    toppings: [['bocadillo', 90, 'g'], ['queso_parmesano', 15, 'g'], ['tocineta', 50, 'g']],
  },
  // Red Ndiana
  {
    key: 'chorizo_espanol', name: 'Chorizo español y santarrosano', line: 'Red Ndiana', description: 'Mozzarella, chorizo santarrosano, pesto y chorizo español.', weight: 2,
    toppings: [['chorizo_santarrosano', 60, 'g'], ['salsa_pesto', 20, 'g'], ['chorizo_espanol', 60, 'g']],
  },
  {
    key: 'salami_champi', name: 'Salami champiñones', line: 'Red Ndiana', description: 'Mozzarella, salami, champiñones y tocineta.', weight: 2,
    toppings: [['salami', 60, 'g'], ['champinones', 50, 'g'], ['tocineta', 40, 'g']],
  },
];

const pizzaProducts: CatalogProduct[] = PIZZAS.flatMap((p) =>
  PIZZA_SIZES.map((s) => ({
    key: `pizza_${p.key}_${s.key}`,
    name: `Pizza ${p.name} ${s.name}`,
    category: 'Pizzas',
    type: 'preparado' as const,
    weight: Math.round(p.weight * s.weight * 10) / 10,
    description: `${p.line}: ${p.description}`,
    recipe: merge([['masa', s.masa, 'g'], ['salsa_pizza', s.salsa, 'ml'], ['queso_mozzarella', s.queso, 'g'], ...scale(p.toppings, s.factor), ['caja_pizza', 1, 'unidad']]),
  })),
);

// ---- Picadas y salchipapas: por número de personas, como en la carta ----
// La receta base es para UNA persona; en los tamaños grandes rinde un poco menos por persona.
const forPeople = (
  key: string,
  name: string,
  category: string,
  description: string,
  base: Line[],
  sizes: [people: number, factor: number, weight: number, units?: Record<string, number>][],
): CatalogProduct[] =>
  sizes.map(([people, factor, weight, units]) => ({
    key: `${key}_${people}`,
    name: `${name} para ${people}`,
    category,
    type: 'preparado' as const,
    weight,
    description,
    // Las carnes frías (chorizo, butifarra, salchicha) van por unidades fijas según el tamaño.
    recipe: scale(base, factor).map(([k, q, u]): Line => (units && k in units ? [k, units[k], 'unidad'] : [k, q, u])),
  }));

const ENSALADA: Line[] = [['lechuga', 30, 'g'], ['tomate', 50, 'g'], ['uchuvas', 20, 'g'], ['vinagreta', 20, 'ml']];
const ENSALADA_BAMBINO: Line[] = [['lechuga', 15, 'g'], ['tomate', 25, 'g'], ['vinagreta', 10, 'ml']];

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  ...pizzaProducts,
  // ---- Hamburguesas (la carne puede ser picante o normal) ----
  {
    key: 'hamb_costena', name: 'Hamburguesa Costeña dulce', category: 'Hamburguesas', type: 'preparado', weight: 8,
    description: 'Pan brioche, salsa de la casa, lechuga, tomate, queso costeño, tocineta, carne casera y cebolla caramelizada.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['lechuga', 20, 'g'], ['tomate', 40, 'g'], ['queso_costeno', 50, 'g'],
      ['tocineta', 30, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['cebolla_caramelizada', 40, 'g'],
    ],
  },
  {
    key: 'hamb_grille', name: 'Hamburguesa Grille', category: 'Hamburguesas', type: 'preparado', weight: 6,
    description: 'Pan brioche, salsa de la casa, lechuga, tomate, cheddar, tocineta, carne casera, cebolla salteada con champiñones y mozzarella.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['lechuga', 20, 'g'], ['tomate', 40, 'g'], ['queso_cheddar', 1, 'unidad'], ['tocineta', 30, 'g'],
      ['carne_hamb_gde', 1, 'unidad'], ['cebolla_picada', 40, 'g'], ['champinones', 40, 'g'], ['queso_mozzarella', 40, 'g'],
    ],
  },
  {
    key: 'hamb_paisa', name: 'Hamburguesa Burger paisa', category: 'Hamburguesas', type: 'preparado', weight: 6,
    description: 'Pan brioche, salsa de la casa, cebolla crispi, carne, chorizo, cheddar, tomate, cebolla, lechuga y mozzarella.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['cebolla_crispi', 20, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['chorizo_parrillada', 1, 'unidad'],
      ['queso_cheddar', 1, 'unidad'], ['tomate', 40, 'g'], ['cebolla_picada', 20, 'g'], ['lechuga', 20, 'g'], ['queso_mozzarella', 40, 'g'],
    ],
  },
  {
    key: 'hamb_smash', name: 'Hamburguesa Smash', category: 'Hamburguesas', type: 'preparado', weight: 7,
    description: 'Pan brioche, salsa de la casa, pepinillo, 2 carnes con cebolla salteada y doble mozzarella.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['pepinillos', 20, 'g'], ['carne_hamb_peq', 2, 'unidad'], ['cebolla_picada', 40, 'g'],
      ['queso_mozzarella', 70, 'g'],
    ],
  },
  {
    key: 'hamb_tradicional', name: 'Hamburguesa Tradicional', category: 'Hamburguesas', type: 'preparado', weight: 9,
    description: 'Pan brioche, salsa de la casa, jamón ahumado, carne de la casa, cheddar, tocineta, lechuga, cebolla caramelizada y tomate.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['jamon', 40, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['queso_cheddar', 1, 'unidad'],
      ['tocineta', 30, 'g'], ['lechuga', 20, 'g'], ['cebolla_caramelizada', 40, 'g'], ['tomate', 40, 'g'],
    ],
  },
  {
    key: 'hamb_pollo', name: 'Hamburguesa de pollo', category: 'Hamburguesas', type: 'preparado', weight: 6,
    description: 'Pan brioche, salsa de la casa, pechuga, tocineta, mozzarella, tomate, cebolla y lechuga.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['pechuga_plancha', 150, 'g'], ['tocineta', 30, 'g'], ['queso_mozzarella', 40, 'g'],
      ['tomate', 40, 'g'], ['cebolla_picada', 20, 'g'], ['lechuga', 20, 'g'],
    ],
  },
  {
    key: 'hamb_bambina', name: 'Hamburguesa bambina', category: 'Hamburguesas', type: 'preparado', weight: 5,
    description: 'Pan suave, carne casera, tomate, cebolla, lechuga, mozzarella y salsas.',
    recipe: [
      ['pan_suave', 1, 'unidad'], ['carne_hamb_peq', 1, 'unidad'], ['tomate', 20, 'g'], ['cebolla_picada', 15, 'g'], ['lechuga', 10, 'g'],
      ['queso_mozzarella', 25, 'g'], ['salsa_casa', 15, 'ml'],
    ],
  },
  // ---- Perros ----
  {
    key: 'perro_chorizo_diana', name: 'Perro Chorizo Diana', category: 'Perros', type: 'preparado', weight: 6,
    description: 'Pan brioche, salsa de la casa, chorizo parrillada, lechuga, cebolla caramelizada, cheddar, mozzarella, cebolla crispi y tocineta.',
    recipe: [
      ['pan_perro', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['chorizo_parrillada', 1, 'unidad'], ['lechuga', 15, 'g'], ['cebolla_caramelizada', 30, 'g'],
      ['queso_cheddar', 1, 'unidad'], ['queso_mozzarella', 40, 'g'], ['cebolla_crispi', 15, 'g'], ['tocineta', 25, 'g'],
    ],
  },
  {
    key: 'perro_super', name: 'Perro Super', category: 'Perros', type: 'preparado', weight: 7,
    description: 'Pan brioche, salsa de la casa, salchicha long Zenú, lechuga, cebolla caramelizada, mozzarella y cebolla crispi.',
    recipe: [
      ['pan_perro', 1, 'unidad'], ['salsa_casa', 25, 'ml'], ['salchicha_zenu', 1, 'unidad'], ['lechuga', 15, 'g'], ['cebolla_caramelizada', 30, 'g'],
      ['queso_mozzarella', 40, 'g'], ['cebolla_crispi', 15, 'g'],
    ],
  },
  {
    key: 'bambinoperro', name: 'Bambinoperro', category: 'Perros', type: 'preparado', weight: 5,
    description: 'Pan suave, salchicha, tomate, cebolla, lechuga y mozzarella.',
    recipe: [['pan_suave', 1, 'unidad'], ['salchicha_mini', 1, 'unidad'], ['tomate', 15, 'g'], ['cebolla_picada', 15, 'g'], ['lechuga', 10, 'g'], ['queso_mozzarella', 25, 'g']],
  },
  // ---- Asados especiales ----
  {
    key: 'asado_pechuga', name: 'Asado de pechuga', category: 'Asados', type: 'preparado', weight: 6,
    description: 'Papas francesas, 300 g de pechuga y ensalada (tomate, lechuga crespa, uchuvas y vinagreta de la casa).',
    recipe: [['papas', 200, 'g'], ['pechuga_plancha', 300, 'g'], ...ENSALADA],
  },
  {
    key: 'asado_cerdo', name: 'Asado de cerdo', category: 'Asados', type: 'preparado', weight: 5,
    description: 'Papas francesas, 300 g de cerdo y ensalada (tomate, lechuga crespa, uchuvas y vinagreta de la casa).',
    recipe: [['papas', 200, 'g'], ['cerdo_prep', 300, 'g'], ...ENSALADA],
  },
  {
    key: 'asado_bambino_pechuga', name: 'Asado bambino de pechuga', category: 'Asados', type: 'preparado', weight: 3,
    description: 'Papa francesa, pechuga y ensalada.',
    recipe: [['papas', 120, 'g'], ['pechuga_plancha', 150, 'g'], ...ENSALADA_BAMBINO],
  },
  {
    key: 'asado_bambino_cerdo', name: 'Asado bambino de cerdo', category: 'Asados', type: 'preparado', weight: 3,
    description: 'Papa francesa, cerdo y ensalada.',
    recipe: [['papas', 120, 'g'], ['cerdo_prep', 150, 'g'], ...ENSALADA_BAMBINO],
  },
  // ---- Exclusive fast food ----
  {
    key: 'chori_papa', name: 'Chori papa artesanal', category: 'Picadas', type: 'preparado', weight: 6,
    description: 'Papa francesa, salsa ahumada, chorizo casero salteado con cebollas, mozzarella y maíz.',
    recipe: [
      ['papas', 300, 'g'], ['salsa_ahumada', 30, 'ml'], ['chorizo_parrillada', 2, 'unidad'], ['cebolla_picada', 40, 'g'], ['queso_mozzarella', 60, 'g'], ['maiz', 40, 'g'],
    ],
  },
  ...forPeople(
    'picadita_mix',
    'Picadita mix',
    'Picadas',
    'Papas, salsa de la casa, lechuga, pollo, chorizo, butifarra y queso (mozzarella o costeño, a elección).',
    [['papas', 200, 'g'], ['salsa_casa', 25, 'ml'], ['lechuga', 15, 'g'], ['pechuga_plancha', 80, 'g'], ['chorizo_parrillada', 1, 'unidad'], ['butifarra', 1, 'unidad'], ['queso_mozzarella', 50, 'g']],
    // Como dijo el dueño: la de 2 personas lleva 2 butifarras y 1 chorizo; la de 4, 2 chorizos y 2 butifarras (la de 1: por confirmar).
    [
      [1, 1, 5, { chorizo_parrillada: 1, butifarra: 1 }],
      [2, 1.9, 4, { chorizo_parrillada: 1, butifarra: 2 }],
      [4, 3.2, 2, { chorizo_parrillada: 2, butifarra: 2 }],
    ],
  ),
  ...forPeople(
    'salchipapa',
    'Salchipapa tradicional',
    'Salchipapas',
    'Papas a la francesa, salsa de la casa, salchicha y mozzarella.',
    [['papas', 250, 'g'], ['salsa_casa', 30, 'ml'], ['salchicha_manguera', 1, 'unidad'], ['queso_mozzarella', 50, 'g']],
    // Para 1 persona, 1 salchicha; para 2, 2 salchichas.
    [
      [1, 1, 10, { salchicha_manguera: 1 }],
      [2, 1.75, 5, { salchicha_manguera: 2 }],
    ],
  ),
  ...forPeople(
    'picadita_casa',
    'Picadita de la casa',
    'Picadas',
    'Papas, salsas de la casa, lechuga, pollo, cerdo, chorizo artesanal salteado con cebolla, maíz y papa ripio.',
    [
      ['papas', 150, 'g'], ['salsa_casa', 20, 'ml'], ['lechuga', 15, 'g'], ['pechuga_plancha', 70, 'g'], ['cerdo_prep', 70, 'g'], ['chorizo_parrillada', 0.5, 'unidad'],
      ['cebolla_picada', 20, 'g'], ['maiz', 20, 'g'], ['papa_ripio', 15, 'g'],
    ],
    [[3, 3, 2], [4, 4, 2], [6, 6, 1]],
  ),
  // ---- Bebidas ----
  {
    key: 'jugo_agua', name: 'Jugo natural en agua', category: 'Bebidas', type: 'preparado', weight: 6,
    description: 'Pulpa de fruta en agua.',
    recipe: [['pulpa_fruta', 150, 'g'], ['azucar', 20, 'g']],
  },
  {
    key: 'jugo_leche', name: 'Jugo natural en leche', category: 'Bebidas', type: 'preparado', weight: 5,
    description: 'Pulpa de fruta en leche.',
    recipe: [['pulpa_fruta', 150, 'g'], ['leche', 250, 'ml'], ['azucar', 20, 'g']],
  },
  { key: 'limonada', name: 'Limonada natural', category: 'Bebidas', type: 'preparado', weight: 5, description: 'Limón, azúcar y hielo.', recipe: [['limon', 80, 'g'], ['azucar', 30, 'g']] },
  {
    key: 'limonada_coco', name: 'Limonada de coco', category: 'Bebidas', type: 'preparado', weight: 4,
    description: 'Limón, crema de coco y hielo.',
    recipe: [['limon', 60, 'g'], ['crema_coco', 60, 'ml'], ['azucar', 20, 'g']],
  },
  {
    key: 'limonada_cerezada', name: 'Limonada cerezada', category: 'Bebidas', type: 'preparado', weight: 3,
    description: 'Limón, cerezas en almíbar y hielo.',
    recipe: [['limon', 70, 'g'], ['cerezas', 30, 'g'], ['azucar', 25, 'g']],
  },
  ...(
    [
      ['postobon_125', 4],
      ['cocacola_15', 5],
      ['hit_litro', 3],
      ['eco_litro', 2],
      ['cocacola_pet', 9],
      ['postobon_pet', 6],
      ['hit_pet', 4],
      ['agua_pet', 3],
    ] as const
  ).map(([key, weight]) => {
    const item = CATALOG_ITEMS.find((i) => i.key === key)!;
    return { key, name: item.name, category: 'Bebidas', type: 'directo' as const, weight, description: '', recipe: [[key, 1, 'unidad']] as Line[] };
  }),
  // ---- Adicionales: se agregan a la venta junto con el plato ----
  ...(
    [
      ['ad_maiz_perro', 'Adicional maíz (perro)', [['maiz', 20, 'g']]],
      ['ad_maiz_salchi', 'Adicional maíz (salchipapa y picada)', [['maiz', 50, 'g']]],
      ['ad_gratinado', 'Adicional gratinado (asado)', [['queso_mozzarella', 60, 'g']]],
      ['ad_queso_salchi', 'Adicional queso extra (salchipapa y picada)', [['queso_mozzarella', 70, 'g']]],
      ['ad_carne_hamb', 'Adicional carne extra (hamburguesa)', [['carne_hamb_gde', 1, 'unidad']]],
      ['ad_tocineta_perro', 'Adicional tocineta extra (perro y hamburguesa)', [['tocineta', 15, 'g']]],
      ['ad_tocineta_salchi', 'Adicional tocineta (salchipapa)', [['tocineta', 25, 'g']]],
      ['ad_tocineta_picada', 'Adicional tocineta (picada)', [['tocineta', 50, 'g']]],
      ['ad_papas', 'Adicional papas francesas', [['papas', 200, 'g']]],
    ] as [string, string, Line[]][]
  ).map(([key, name, recipe]) => ({ key, name, category: 'Adicionales', type: 'preparado' as const, weight: 2, description: '', recipe })),
  // Adicionales de pizza, por tamaño (cantidades de una MEDIUM ajustadas como las pizzas).
  ...(
    [
      ['borde', 'borde de queso', [['queso_mozzarella', 120, 'g']]],
      ['maiz', 'maíz', [['maiz', 50, 'g']]],
      ['tocineta', 'tocineta', [['tocineta', 50, 'g']]],
      ['queso', 'queso extra', [['queso_mozzarella', 100, 'g']]],
    ] as [string, string, Line[]][]
  ).flatMap(([key, name, recipe]) =>
    PIZZA_SIZES.map((s) => ({
      key: `ad_pizza_${key}_${s.key}`,
      name: `Adicional pizza ${name} ${s.name}`,
      category: 'Adicionales',
      type: 'preparado' as const,
      weight: 1,
      description: `Para una pizza ${s.name}.`,
      recipe: scale(recipe, s.factor),
    })),
  ),
];
