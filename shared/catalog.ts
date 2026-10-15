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
  /** Solo DEMO: tamaño del paquete en g/ml/und y su nombre. En lo real lo configura el administrador. */
  demoPack?: [size: number, label: string];
}

export const CATALOG_ITEMS: CatalogItem[] = [
  // ---- Congelador ----
  { key: 'queso_montanita', name: 'Queso montañita', category: 'Lácteos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.4 },
  { key: 'chorizo_santacruz', name: 'Chorizo Santa Cruz', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 3.385, demoPack: [1000, 'paquete'] },
  { key: 'jamon', name: 'Jamón', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1.5, demoQty: 4.4, demoPack: [500, 'paquete'] },
  { key: 'salchicha_manguera', name: 'Salchicha manguera', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2 },
  { key: 'pepperoni', name: 'Pepperoni', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.77, demoPack: [500, 'paquete'] },
  { key: 'chorizo_parrillada', name: 'Chorizo parrillada', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2.24 },
  { key: 'salami', name: 'Salami', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.248 },
  { key: 'salchicha_zenu', name: 'Salchicha Zenú', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 2 },
  { key: 'tocineta', name: 'Tocineta', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.172 },
  { key: 'salchicha_mini', name: 'Salchicha mini', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.4 },
  { key: 'maiz', name: 'Maíz tierno', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 1.27 },
  { key: 'papas', name: 'Papas a la francesa', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 3, demoQty: 9 },
  { key: 'pechuga_cruda', name: 'Pechuga cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 2, demoQty: 10.85 },
  { key: 'carne_molida', name: 'Carne molida cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 3 },
  { key: 'cerdo_crudo', name: 'Cerdo crudo', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, demoQty: 5.18 },
  { key: 'carne_hamb_gde', name: 'Carne de hamburguesa grande', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 25 },
  { key: 'carne_hamb_peq', name: 'Carne de hamburguesa pequeña', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, demoQty: 24 },
  // ---- Nevera negra (lo que prepara la cocina y las salsas) ----
  { key: 'masa', name: 'Masa de pizza', category: 'Masas y panes', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 3, demoQty: 9.2 },
  { key: 'pechuga_desmechada', name: 'Pechuga desmechada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8, demoQty: 1.7 },
  { key: 'pechuga_plancha', name: 'Pechuga a la plancha', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8, demoQty: 1.085 },
  { key: 'carne_molida_prep', name: 'Carne molida preparada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5, demoQty: 0.9 },
  { key: 'cerdo_prep', name: 'Cerdo preparado', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5, demoQty: 1.04 },
  { key: 'cebolla_caramelizada', name: 'Cebolla caramelizada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 340 },
  { key: 'cebolla_picada', name: 'Cebolla picada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 650 },
  { key: 'tomate_picado', name: 'Tomate picado', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300, demoQty: 520 },
  { key: 'salsa_tomate', name: 'Salsa de tomate', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, demoQty: 1800 },
  { key: 'salsa_pina', name: 'Salsa de piña', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, demoQty: 1181 },
  { key: 'salsa_pizza', name: 'Salsa de pizza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 1000, demoQty: 2753 },
  { key: 'salsa_mostaza', name: 'Salsa mostaza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 500, demoQty: 1995 },
  { key: 'salsa_ajo', name: 'Salsa de ajo', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 200, demoQty: 265 },
  { key: 'salsa_bbq', name: 'Salsa BBQ', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, demoQty: 470 },
  { key: 'mayonesa', name: 'Mayonesa', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 1000, demoQty: 3000 },
  { key: 'pina_trocitos', name: 'Piña en trocitos', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 400, demoQty: 2560 },
  { key: 'adobo', name: 'Adobo para carnes', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, demoQty: 855 },
  // ---- Nevera Coca-Cola ----
  { key: 'tomate', name: 'Tomate', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1, demoQty: 1.8 },
  { key: 'cebolla', name: 'Cebolla', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1.5, demoQty: 4.575 },
  { key: 'pimenton', name: 'Pimentón', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0.5, demoQty: 0.79 },
  { key: 'lechuga', name: 'Lechuga crespa', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 300, demoQty: 240 },
  { key: 'queso_mozzarella', name: 'Queso mozzarella', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 3, demoQty: 8.5 },
  { key: 'levadura', name: 'Levadura fresca', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 100, demoQty: 450 },
  { key: 'vino', name: 'Vino de cocina', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'ml', kind: 'insumo', min: 300, demoQty: 605 },
  { key: 'gaseosa', name: 'Gaseosa 400 ml', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 24, demoQty: 60 },
  // ---- Bodega seca ----
  { key: 'harina', name: 'Harina de trigo 0000', category: 'Abarrotes', location: 'Bodega seca', unit: 'kg', kind: 'insumo', min: 15, demoQty: 42 },
  { key: 'sal', name: 'Sal', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, demoQty: 2500 },
  { key: 'aceite', name: 'Aceite de girasol', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 1000, demoQty: 4000 },
  { key: 'azucar', name: 'Azúcar', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, demoQty: 2000 },
  { key: 'pan_hamburguesa', name: 'Pan de hamburguesa', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 40 },
  { key: 'pan_perro', name: 'Pan de perro', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, demoQty: 30 },
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

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    key: 'pizza_hawaiana', name: 'Pizza hawaiana', category: 'Pizzas', type: 'preparado', weight: 18,
    description: 'Jamón, piña y queso.',
    recipe: [['masa', 280, 'g'], ['salsa_pizza', 80, 'ml'], ['queso_mozzarella', 180, 'g'], ['jamon', 80, 'g'], ['pina_trocitos', 70, 'g'], ['caja_pizza', 1, 'unidad']],
  },
  {
    key: 'pizza_pepperoni', name: 'Pizza de pepperoni', category: 'Pizzas', type: 'preparado', weight: 14,
    description: 'Pepperoni y queso.',
    recipe: [['masa', 280, 'g'], ['salsa_pizza', 80, 'ml'], ['queso_mozzarella', 180, 'g'], ['pepperoni', 70, 'g'], ['caja_pizza', 1, 'unidad']],
  },
  {
    key: 'pizza_pollo', name: 'Pizza de pollo con maíz', category: 'Pizzas', type: 'preparado', weight: 10,
    description: 'Pechuga desmechada, maíz tierno y queso.',
    recipe: [['masa', 280, 'g'], ['salsa_pizza', 80, 'ml'], ['queso_mozzarella', 170, 'g'], ['pechuga_desmechada', 90, 'g'], ['maiz', 40, 'g'], ['caja_pizza', 1, 'unidad']],
  },
  {
    key: 'pizza_carnes', name: 'Pizza de carnes', category: 'Pizzas', type: 'preparado', weight: 9,
    description: 'Pepperoni, chorizo, tocineta y carne molida.',
    recipe: [
      ['masa', 280, 'g'], ['salsa_pizza', 80, 'ml'], ['queso_mozzarella', 170, 'g'], ['pepperoni', 35, 'g'], ['chorizo_santacruz', 35, 'g'],
      ['tocineta', 30, 'g'], ['carne_molida_prep', 40, 'g'], ['caja_pizza', 1, 'unidad'],
    ],
  },
  {
    key: 'hamburguesa', name: 'Hamburguesa sencilla', category: 'Hamburguesas', type: 'preparado', weight: 16,
    description: 'Carne grande, lechuga, tomate y cebolla caramelizada.',
    recipe: [['pan_hamburguesa', 1, 'unidad'], ['carne_hamb_gde', 1, 'unidad'], ['lechuga', 20, 'g'], ['tomate_picado', 30, 'g'], ['cebolla_caramelizada', 30, 'g'], ['salsa_pina', 20, 'g'], ['papas', 150, 'g']],
  },
  {
    key: 'hamburguesa_especial', name: 'Hamburguesa especial', category: 'Hamburguesas', type: 'preparado', weight: 9,
    description: 'Con tocineta, queso y doble cebolla caramelizada.',
    recipe: [
      ['pan_hamburguesa', 1, 'unidad'], ['carne_hamb_gde', 1, 'unidad'], ['tocineta', 30, 'g'], ['queso_montanita', 40, 'g'], ['lechuga', 20, 'g'],
      ['tomate_picado', 30, 'g'], ['cebolla_caramelizada', 60, 'g'], ['salsa_bbq', 20, 'g'], ['papas', 150, 'g'],
    ],
  },
  {
    key: 'perro', name: 'Perro caliente', category: 'Perros', type: 'preparado', weight: 8,
    description: 'Salchicha Zenú, cebolla picada y salsas.',
    recipe: [['pan_perro', 1, 'unidad'], ['salchicha_zenu', 70, 'g'], ['cebolla_picada', 20, 'g'], ['salsa_pina', 15, 'g'], ['mayonesa', 15, 'g']],
  },
  {
    key: 'salchipapa', name: 'Salchipapa', category: 'Salchipapas', type: 'preparado', weight: 14,
    description: 'Papas a la francesa con salchicha y salsas.',
    recipe: [['papas', 250, 'g'], ['salchicha_manguera', 100, 'g'], ['salsa_ajo', 20, 'g'], ['salsa_tomate', 20, 'g']],
  },
  {
    key: 'picada', name: 'Picada personal', category: 'Picadas', type: 'preparado', weight: 7,
    description: 'Cerdo, chorizo, pechuga a la plancha y papas.',
    recipe: [['papas', 200, 'g'], ['cerdo_prep', 100, 'g'], ['chorizo_parrillada', 80, 'g'], ['pechuga_plancha', 100, 'g'], ['salchicha_mini', 50, 'g'], ['salsa_ajo', 20, 'g']],
  },
  { key: 'gaseosa', name: 'Gaseosa 400 ml', category: 'Bebidas', type: 'directo', weight: 16, description: '', recipe: [['gaseosa', 1, 'unidad']] },
];
