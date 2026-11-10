// Catálogo de Pizza Diana: los productos de sus hojas de inventario en papel (congelador,
// nevera negra y nevera Coca-Cola, hoja de masa y hoja de merma), lo que compra al
// proveedor («probeedor 1.xlsx», con cómo viene cada cosa) y el menú con las recetas
// de «recetas 1.xlsx» (ver recipes.ts). Lo usa «Cargar catálogo Pizza Diana»
// (todo con existencia 0, listo para el primer conteo). Sin precios ni costos.
import type { Unit } from './units.ts';
import type { ItemKind, Location, PrepMode } from './kitchen.ts';
import { FAST_EXTRAS, FAST_RECIPES, PIZZA_2X1_RECIPES, PIZZA_EXTRAS, PIZZA_RECIPES, type RecipeLine } from './recipes.ts';

export interface CatalogItem {
  key: string;
  name: string;
  category: string;
  location: Location;
  unit: Unit;
  kind: ItemKind;
  /** Mínimo de alerta, en `unit`. */
  min: number;
  /** Cómo viene (hoja de papel o lista del proveedor): tamaño en g/ml/und y nombre. La cocina lo corrige si cambia. */
  pack?: [size: number, label: string];
}

export const CATALOG_ITEMS: CatalogItem[] = [
  // ---- Congelador: como en la hoja de papel ----
  { key: 'queso_montanita', name: 'Queso montañita', category: 'Lácteos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'chorizo_santacruz', name: 'Chorizo Santa Cruz', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, pack: [1000, 'paquete'] },
  { key: 'jamon', name: 'Jamón', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1.5, pack: [500, 'paquete'] },
  { key: 'salchicha_manguera', name: 'Salchicha manguera', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, pack: [10, 'paquete'] },
  { key: 'pepperoni', name: 'Pepperoni', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1, pack: [500, 'paquete'] },
  { key: 'chorizo_parrillada', name: 'Chorizo parrillada', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, pack: [5, 'paquete'] },
  { key: 'salami', name: 'Salami', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, pack: [500, 'paquete'] },
  { key: 'salchicha_zenu', name: 'Salchicha Zenú', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 8, pack: [8, 'paquete'] },
  { key: 'tocineta', name: 'Tocineta', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, pack: [1000, 'paquete'] },
  { key: 'salchicha_mini', name: 'Salchicha mini (bambino)', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10, pack: [26, 'paquete'] },
  { key: 'maiz', name: 'Maíz tierno', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, pack: [1000, 'paquete'] },
  { key: 'papas', name: 'Papas a la francesa', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 3, pack: [2500, 'bolsa'] },
  { key: 'pechuga_cruda', name: 'Pechuga cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 2 },
  { key: 'carne_molida', name: 'Carne molida cruda', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'cerdo_crudo', name: 'Cerdo crudo', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'carne_hamb_gde', name: 'Carne de hamburguesa grande', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10 },
  { key: 'carne_hamb_peq', name: 'Carne de hamburguesa pequeña', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 10 },
  // ---- Nevera negra: como en la hoja de papel ----
  { key: 'pechuga_desmechada', name: 'Pechuga desmechada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8 },
  { key: 'pechuga_plancha', name: 'Pechuga a la plancha', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.8 },
  { key: 'carne_molida_prep', name: 'Carne molida preparada', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5 },
  { key: 'cerdo_prep', name: 'Cerdo preparado', category: 'Carnes y embutidos', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 0.5 },
  { key: 'salsa_tomate', name: 'Salsa de tomate', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, pack: [1000, 'bolsón'] },
  { key: 'salsa_pina', name: 'Salsa de piña', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 500, pack: [1000, 'bolsón'] },
  { key: 'salsa_pizza', name: 'Salsa de pizza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 1000 },
  { key: 'pasta_pizza', name: 'Pasta de pizza (pomodoro)', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 0, pack: [4000, 'galón'] },
  { key: 'salsa_mostaza', name: 'Salsa mostaza', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 500 },
  { key: 'pina_trocitos', name: 'Piña en trocitos', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 400 },
  { key: 'adobo', name: 'Adobo para carnes', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300 },
  { key: 'cebolla_caramelizada', name: 'Cebolla caramelizada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300 },
  { key: 'salsa_bbq', name: 'Salsa BBQ', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, pack: [4000, 'galón'] },
  // ---- Nevera Coca-Cola: como en la hoja de papel ----
  { key: 'tomate', name: 'Tomate', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'cebolla', name: 'Cebolla', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1.5 },
  { key: 'pimenton', name: 'Pimentón', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0.5 },
  { key: 'mayonesa', name: 'Mayonesa', category: 'Salsas y aderezos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 1000, pack: [1000, 'bolsón'] },
  { key: 'salsa_ajo', name: 'Salsa de ajo', category: 'Salsas y aderezos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 200 },
  { key: 'vino', name: 'Vino de cocina', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'ml', kind: 'insumo', min: 300 },
  { key: 'lechuga', name: 'Lechuga crespa', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 300 },
  // ---- Lo que no está en la hoja de papel pero usan las recetas (queda al final de cada lugar) ----
  { key: 'chorizo_santarrosano', name: 'Chorizo santarrosano', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5 },
  { key: 'chorizo_espanol', name: 'Chorizo español', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5 },
  { key: 'butifarra', name: 'Butifarra', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5, pack: [1000, 'paquete'] },
  { key: 'chorizo_artesanal', name: 'Chorizo artesanal', category: 'Carnes y embutidos', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 0.5 },
  { key: 'longaniza', name: 'Longaniza', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 0, pack: [20, 'paquete'] },
  { key: 'salchicha_americana', name: 'Salchicha super americana', category: 'Carnes y embutidos', location: 'Congelador', unit: 'unidad', kind: 'insumo', min: 0, pack: [8, 'paquete'] },
  { key: 'masa', name: 'Masa de pizza', category: 'Masas y panes', location: 'Nevera negra', unit: 'kg', kind: 'preparacion', min: 3 },
  { key: 'cebolla_picada', name: 'Cebolla picada', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300 },
  { key: 'tomate_picado', name: 'Tomate picado', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'preparacion', min: 300 },
  { key: 'salsa_casa', name: 'Salsa de la casa', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 1000 },
  { key: 'salsa_ahumada', name: 'Salsa ahumada', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 300 },
  { key: 'salsa_ranchera', name: 'Salsa ranchera', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'ml', kind: 'insumo', min: 300 },
  { key: 'salsa_pesto', name: 'Salsa de pesto', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 300, pack: [250, 'frasco'] },
  { key: 'salsa_cheddar', name: 'Salsa de cheddar', category: 'Salsas y aderezos', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'pepinillos', name: 'Pepinillos', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 200, pack: [500, 'frasco'] },
  { key: 'pimenton_encurtido', name: 'Pimentón encurtido', category: 'Verduras y frutas', location: 'Nevera negra', unit: 'g', kind: 'insumo', min: 200, pack: [250, 'frasco'] },
  { key: 'queso_mozzarella', name: 'Queso mozzarella', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 3 },
  { key: 'queso_costeno', name: 'Queso costeño', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'queso_cheddar', name: 'Queso cheddar (tajadas)', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 16, pack: [16, 'paquete'] },
  { key: 'queso_parmesano', name: 'Queso parmesano', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 200, pack: [40, 'sobre'] },
  { key: 'champinones', name: 'Champiñones', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 500, pack: [250, 'bandeja'] },
  { key: 'ajo', name: 'Ajo', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 100 },
  { key: 'queso_holandes', name: 'Queso holandés (tajadas)', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 0, pack: [15, 'paquete'] },
  { key: 'queso_sabana', name: 'Queso sabana (tajadas)', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 0, pack: [12, 'paquete'] },
  { key: 'crema_leche', name: 'Crema de leche', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0, pack: [200, 'caja'] },
  { key: 'suero', name: 'Suero costeño', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0, pack: [200, 'bolsa'] },
  { key: 'cebolla_roja', name: 'Cebolla roja', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0 },
  { key: 'cebolla_larga', name: 'Cebolla larga', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'apio', name: 'Apio', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'perejil', name: 'Perejil', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'cilantro', name: 'Cilantro (mazo)', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 0 },
  { key: 'albahaca', name: 'Albahaca fresca', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'lechuga_batavia', name: 'Lechuga batavia', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 0 },
  { key: 'zanahoria', name: 'Zanahoria', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0 },
  { key: 'pina', name: 'Piña entera', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0 },
  { key: 'maracuya', name: 'Maracuyá', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 0 },
  { key: 'levadura', name: 'Levadura fresca', category: 'Abarrotes', location: 'Nevera Coca-Cola', unit: 'g', kind: 'insumo', min: 100, pack: [500, 'paquete'] },
  { key: 'leche', name: 'Leche', category: 'Lácteos', location: 'Nevera Coca-Cola', unit: 'l', kind: 'insumo', min: 2 },
  { key: 'limon', name: 'Limón', category: 'Verduras y frutas', location: 'Nevera Coca-Cola', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'postobon_125', name: 'Postobón 1,25 L', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6 },
  { key: 'cocacola_15', name: 'Coca-Cola 1,5 L', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6 },
  { key: 'hit_litro', name: 'Hit litro', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6 },
  { key: 'eco_litro', name: 'Eco litro', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 6 },
  { key: 'cocacola_pet', name: 'Coca-Cola Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'postobon_pet', name: 'Postobón Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'hit_pet', name: 'Hit Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'agua_pet', name: 'Agua Pet', category: 'Bebidas', location: 'Nevera Coca-Cola', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'harina', name: 'Harina de trigo 0000', category: 'Abarrotes', location: 'Bodega seca', unit: 'kg', kind: 'insumo', min: 15 },
  { key: 'sal', name: 'Sal', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500 },
  { key: 'aceite', name: 'Aceite de girasol', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 1000 },
  { key: 'azucar', name: 'Azúcar', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500, pack: [1000, 'bolsa'] },
  { key: 'pan_hamburguesa', name: 'Pan de hamburguesa', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'pan_perro', name: 'Pan de perro', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12, pack: [6, 'paquete'] },
  { key: 'pulpa_fruta', name: 'Pulpa de fruta', category: 'Verduras y frutas', location: 'Congelador', unit: 'kg', kind: 'insumo', min: 1 },
  { key: 'crema_coco', name: 'Crema de coco', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 400 },
  { key: 'cerezas', name: 'Cerezas en almíbar', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 200 },
  { key: 'aceite_oliva', name: 'Aceite de oliva', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 0, pack: [500, 'botella'] },
  { key: 'vinagre', name: 'Vinagre', category: 'Abarrotes', location: 'Bodega seca', unit: 'ml', kind: 'insumo', min: 0, pack: [3000, 'garrafa'] },
  { key: 'platano', name: 'Plátano', category: 'Verduras y frutas', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 0 },
  { key: 'pan_suave', name: 'Pan mini (bambino)', category: 'Masas y panes', location: 'Bodega seca', unit: 'unidad', kind: 'insumo', min: 12 },
  { key: 'aceitunas', name: 'Aceitunas', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 200, pack: [250, 'frasco'] },
  { key: 'oregano', name: 'Orégano', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 50 },
  { key: 'bocadillo', name: 'Bocadillo', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 500 },
  { key: 'cebolla_crispi', name: 'Cebolla crispi', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 300 },
  { key: 'papa_ripio', name: 'Papa ripio', category: 'Abarrotes', location: 'Bodega seca', unit: 'g', kind: 'insumo', min: 300, pack: [1000, 'bolsa'] },
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
  /** Está en la carta pero no en el Excel de recetas: la receta es aproximada y hay que confirmarla. */
  pending?: boolean;
}

type Line = RecipeLine;

/** Multiplica las cantidades de una receta; las unidades sueltas (panes, salchichas) se redondean. */
const scale = (lines: Line[], f: number): Line[] =>
  lines.map(([k, q, u]) => [k, u === 'unidad' ? Math.max(1, Math.round(q * f)) : Math.round(q * f), u]);

/** Una receta no puede repetir un ingrediente: suma las líneas iguales. */
const merge = (lines: Line[]): Line[] => {
  const byKey = new Map<string, Line>();
  for (const [k, q, u] of lines) {
    const prev = byKey.get(k);
    byKey.set(k, prev ? [k, prev[1] + q, u] : [k, q, u]);
  }
  return [...byKey.values()];
};

// ---- Pizzas: un producto por tamaño, como en la carta ----
const PIZZA_SIZES = [
  { name: 'personal', key: 'p' },
  { name: 'small', key: 's' },
  { name: 'medium', key: 'm' },
  { name: 'familiar', key: 'f' },
] as const;

// Sabores de la carta. Los que tienen receta en el Excel la toman de PIZZA_RECIPES; los demás
// (pending) se arman con la base de la pizza solo mozzarella y los ingredientes de una medium.
const PIZZAS: { key: string; name: string; line: string; description: string; toppings?: Line[] }[] = [
  // Tradición
  { key: 'salami', name: 'Salami', line: 'Tradición', description: 'Mozzarella y salami.' },
  { key: 'pepperoni', name: 'Pepperoni', line: 'Tradición', description: 'Mozzarella y pepperoni.' },
  { key: 'chorizo', name: 'Chorizo', line: 'Tradición', description: 'Mozzarella y chorizo.' },
  { key: 'jamon_queso', name: 'Jamón y queso', line: 'Tradición', description: 'Mozzarella y jamón ahumado.' },
  { key: 'hawaiana', name: 'Hawaiana', line: 'Tradición', description: 'Mozzarella, jamón ahumado y piña.' },
  { key: 'pollo_champi', name: 'Pollo champiñones', line: 'Tradición', description: 'Mozzarella, pollo y champiñones.' },
  { key: 'pollo_vegetales', name: 'Pollo vegetales', line: 'Tradición', description: 'Mozzarella, pollo, cebolla y pimentón.' },
  { key: 'margarita', name: 'Margarita', line: 'Tradición', description: 'Mozzarella, orégano y salsa de pesto.' },
  { key: 'solo_mozzarella', name: 'Solo mozzarella', line: 'Tradición', description: 'Mozzarella.' },
  // Green Ndiana
  { key: 'pollo_fusion', name: 'Pollo fusión', line: 'Green Ndiana', description: 'Mozzarella, pollo, chorizo, pesto y jamón ahumado.' },
  { key: 'pollo_pesto', name: 'Pollo al pesto', line: 'Green Ndiana', description: 'Mozzarella, pollo, tomate y salsa de pesto.' },
  {
    key: 'vegetariana', name: 'Vegetariana', line: 'Green Ndiana', description: 'Pimentón, cebolla, ajo, champiñones, piña y aceitunas.',
    toppings: [['pimenton', 30, 'g'], ['cebolla', 30, 'g'], ['ajo', 5, 'g'], ['champinones', 50, 'g'], ['pina_trocitos', 50, 'g'], ['aceitunas', 25, 'g']],
  },
  { key: 'napolitana', name: 'Napolitana', line: 'Green Ndiana', description: 'Mozzarella, tomate y pesto.' },
  {
    key: 'pollo_chorizo_jamon', name: 'Pollo, chorizo y jamón', line: 'Green Ndiana', description: 'Mozzarella, chorizo santarrosano, pesto, pollo y jamón ahumado.',
    toppings: [['chorizo_santarrosano', 60, 'g'], ['salsa_pesto', 20, 'g'], ['pechuga_desmechada', 60, 'g'], ['jamon', 60, 'g']],
  },
  // Exclusive Ndiana
  { key: 'del_campo', name: 'Del campo especial', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo, tocineta, maíz tierno y cebolla caramelizada.' },
  { key: 'cartagenera', name: 'Cartagenera', line: 'Exclusive Ndiana', description: 'Mozzarella, chorizo, butifarra y maíz.' },
  { key: 'carnavalera', name: 'Carnavalera', line: 'Exclusive Ndiana', description: 'Mozzarella, jamón, salami, tomate, cebolla y pimentón finamente picados.' },
  {
    key: 'pollo_barbacoa', name: 'Pollo barbacoa', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo, carne, jamón, salsa BBQ y salsa ahumada.',
    toppings: [['pechuga_desmechada', 70, 'g'], ['carne_molida_prep', 60, 'g'], ['jamon', 40, 'g'], ['salsa_bbq', 30, 'g'], ['salsa_ahumada', 20, 'ml']],
  },
  { key: 'pollo_dulce', name: 'Pollo dulce', line: 'Exclusive Ndiana', description: 'Mozzarella, pollo y cebolla caramelizada.' },
  { key: 'mediterranea', name: 'Mediterránea', line: 'Exclusive Ndiana', description: 'Mozzarella, pimentón, aceitunas, tomate y salsa de pesto.' },
  // Bacon Ndiana
  { key: 'tocineta_pina', name: 'Tocineta y piña en almíbar', line: 'Bacon Ndiana', description: 'Mozzarella, tocineta, jamón ahumado y piña.' },
  { key: 'campesina', name: 'Campesina', line: 'Bacon Ndiana', description: 'Mozzarella, maíz tierno y tocineta ahumada.' },
  { key: 'pollo_tocineta', name: 'Pollo tocineta', line: 'Bacon Ndiana', description: 'Mozzarella, pollo y tocineta.' },
  { key: 'tocineta_cebolla', name: 'Tocineta y cebolla caramelizada', line: 'Bacon Ndiana', description: 'Mozzarella, tocineta y cebolla caramelizada.' },
  // Candy Ndiana
  {
    key: 'bocadillo_parmesano', name: 'Bocadillo parmesano', line: 'Candy Ndiana', description: 'Mozzarella, parmesano y bocadillo.',
    toppings: [['queso_parmesano', 20, 'g'], ['bocadillo', 100, 'g']],
  },
  {
    key: 'bocadillo_tocineta', name: 'Bocadillo tocineta', line: 'Candy Ndiana', description: 'Mozzarella, bocadillo, parmesano y tocineta.',
    toppings: [['bocadillo', 90, 'g'], ['queso_parmesano', 15, 'g'], ['tocineta', 50, 'g']],
  },
  // Red Ndiana
  {
    key: 'chorizo_espanol', name: 'Chorizo español y santarrosano', line: 'Red Ndiana', description: 'Mozzarella, chorizo santarrosano, pesto y chorizo español.',
    toppings: [['chorizo_santarrosano', 60, 'g'], ['salsa_pesto', 20, 'g'], ['chorizo_espanol', 60, 'g']],
  },
  { key: 'salami_champi', name: 'Salami champiñones', line: 'Red Ndiana', description: 'Mozzarella, salami y champiñones.' },
];

// Tamaño de los ingredientes de una medium en cada tamaño (según la masa del Excel: 148, 200, 340 y 625 g).
const SIZE_FACTOR = [0.45, 0.6, 1, 1.8];

const pizzaProducts: CatalogProduct[] = PIZZAS.flatMap((p) =>
  PIZZA_SIZES.map((s, i) => {
    const real = PIZZA_RECIPES[p.key]?.[i];
    const recipe = real ?? merge([...PIZZA_RECIPES.solo_mozzarella[i], ...scale(p.toppings ?? [], SIZE_FACTOR[i])]);
    return {
      key: `pizza_${p.key}_${s.key}`,
      name: `Pizza ${p.name} ${s.name}`,
      category: 'Pizzas',
      type: 'preparado' as const,
      description: `${p.line}: ${p.description}`,
      recipe,
      pending: !real,
    };
  }),
);

// Pizzas 2x1: dos small del mismo sabor.
const pizza2x1Products: CatalogProduct[] = Object.entries(PIZZA_2X1_RECIPES).map(([key, recipe]) => {
  const p = PIZZAS.find((x) => x.key === key)!;
  return {
    key: `pizza2x1_${key}`,
    name: `Pizza 2x1 ${p.name}`,
    category: 'Pizzas 2x1',
    type: 'preparado' as const,
    description: `Dos pizzas small: ${p.description.charAt(0).toLowerCase()}${p.description.slice(1)}`,
    recipe,
  };
});

const fast = (key: string, name: string, category: string, description: string): CatalogProduct => ({
  key,
  name,
  category,
  type: 'preparado',
  description,
  recipe: FAST_RECIPES[key],
});

const ENSALADA_BAMBINO: Line[] = [['lechuga', 15, 'g'], ['tomate', 25, 'g']];

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  ...pizzaProducts,
  ...pizza2x1Products,
  // ---- Hamburguesas (todas con papas a la francesa) ----
  fast('hamb_costena', 'Hamburguesa Costeña dulce', 'Hamburguesas', 'Salsa de la casa, lechuga, tomate, queso costeño, tocineta, carne y cebolla caramelizada.'),
  fast('hamb_grille', 'Hamburguesa Grille', 'Hamburguesas', 'Salsa de la casa, carne, tocineta, champiñones, cebolla salteada, tomate, lechuga y mozzarella.'),
  fast('hamb_paisa', 'Hamburguesa Burger paisa', 'Hamburguesas', 'Salsa de la casa, papa ripio, carne, chorizo santarrosano, tomate, lechuga, mozzarella y cebolla.'),
  fast('hamb_smash', 'Hamburguesa Smash', 'Hamburguesas', 'Carne con cebolla, mozzarella, salsa de la casa y pepinillo.'),
  fast('hamb_tradicional', 'Hamburguesa Tradicional', 'Hamburguesas', 'Salsa de la casa, jamón, carne, mozzarella, lechuga, tomate y cebolla.'),
  fast('hamb_pollo', 'Hamburguesa de pollo', 'Hamburguesas', 'Salsa de la casa, pechuga, mozzarella, tomate, cebolla, lechuga y papa ripio.'),
  fast('hamb_bambina', 'Hamburguesa bambina', 'Hamburguesas', 'Pan mini, carne pequeña, tomate, cebolla, lechuga, queso y salsa.'),
  // ---- Perros ----
  fast('perro_chorizo_diana', 'Perro Chorizo Diana', 'Perros', 'Chorizo parrillada, salsa de la casa, tocineta, mozzarella, papa ripio, cebolla caramelizada y papas.'),
  fast('perro_super', 'Perro Super', 'Perros', 'Salchicha, salsa de la casa, papa ripio, cebolla caramelizada, mozzarella y papas.'),
  fast('bambinoperro', 'Bambinoperro', 'Perros', 'Pan mini, salchicha bambino, salsa, queso y papa ripio.'),
  // ---- Asados ----
  fast('asado_pechuga', 'Asado de pechuga', 'Asados', 'Pechuga, papas francesas y ensalada.'),
  fast('asado_cerdo', 'Asado de cerdo', 'Asados', 'Cerdo, papas francesas y ensalada.'),
  {
    key: 'asado_bambino_pechuga', name: 'Asado bambino de pechuga', category: 'Asados', type: 'preparado', pending: true,
    description: 'Papa francesa, pechuga y ensalada.',
    recipe: [['papas', 120, 'g'], ['pechuga_plancha', 150, 'g'], ...ENSALADA_BAMBINO],
  },
  {
    key: 'asado_bambino_cerdo', name: 'Asado bambino de cerdo', category: 'Asados', type: 'preparado', pending: true,
    description: 'Papa francesa, cerdo y ensalada.',
    recipe: [['papas', 120, 'g'], ['cerdo_prep', 150, 'g'], ...ENSALADA_BAMBINO],
  },
  // ---- Salchipapas y picadas ----
  fast('chori_papa', 'Chori papa artesanal', 'Picadas', 'Papa francesa, chorizo artesanal salteado con cebolla, mozzarella, maíz, salsa de la casa y BBQ.'),
  fast('salchipapa_1', 'Salchipapa tradicional para 1', 'Salchipapas', 'Papas, salsa de la casa, lechuga, salchicha, mozzarella y papa ripio.'),
  fast('salchipapa_2', 'Salchipapa tradicional para 2', 'Salchipapas', 'Papas, salsa de la casa, lechuga, 2 salchichas, mozzarella y papa ripio.'),
  fast('picadita_mix_1', 'Picadita mix para 1', 'Picadas', 'Papas, chorizo, butifarra, pollo, salsa de la casa, lechuga, papa ripio y mozzarella.'),
  fast('picadita_mix_2', 'Picadita mix para 2', 'Picadas', 'Papas, chorizo, butifarra, pollo, salsa de la casa, lechuga, papa ripio y mozzarella.'),
  {
    key: 'picadita_mix_4', name: 'Picadita mix para 4', category: 'Picadas', type: 'preparado', pending: true,
    description: 'Papas, chorizo, butifarra, pollo, salsa de la casa, lechuga, papa ripio y mozzarella.',
    recipe: scale(FAST_RECIPES.picadita_mix_2, 2),
  },
  fast('picadita_casa_3', 'Picadita de la casa para 3', 'Picadas', 'Papas, salsa de la casa, cebolla, lechuga, chorizo artesanal, cerdo, pollo, mozzarella, maíz y papa ripio.'),
  fast('picadita_casa_4', 'Picadita de la casa para 4', 'Picadas', 'Papas, salsa de la casa, cebolla, lechuga, chorizo artesanal, cerdo, pollo, mozzarella, maíz y papa ripio.'),
  fast('picadita_casa_6', 'Picadita de la casa para 6', 'Picadas', 'Papas, salsa de la casa, cebolla, lechuga, chorizo artesanal, cerdo, pollo, mozzarella, maíz y papa ripio.'),
  // ---- Bebidas (las preparadas no están en el Excel: recetas por confirmar) ----
  { key: 'jugo_agua', name: 'Jugo natural en agua', category: 'Bebidas', type: 'preparado', pending: true, description: 'Pulpa de fruta en agua.', recipe: [['pulpa_fruta', 150, 'g'], ['azucar', 20, 'g']] },
  {
    key: 'jugo_leche', name: 'Jugo natural en leche', category: 'Bebidas', type: 'preparado', pending: true, description: 'Pulpa de fruta en leche.',
    recipe: [['pulpa_fruta', 150, 'g'], ['leche', 250, 'ml'], ['azucar', 20, 'g']],
  },
  { key: 'limonada', name: 'Limonada natural', category: 'Bebidas', type: 'preparado', pending: true, description: 'Limón, azúcar y hielo.', recipe: [['limon', 80, 'g'], ['azucar', 30, 'g']] },
  {
    key: 'limonada_coco', name: 'Limonada de coco', category: 'Bebidas', type: 'preparado', pending: true, description: 'Limón, crema de coco y hielo.',
    recipe: [['limon', 60, 'g'], ['crema_coco', 60, 'ml'], ['azucar', 20, 'g']],
  },
  {
    key: 'limonada_cerezada', name: 'Limonada cerezada', category: 'Bebidas', type: 'preparado', pending: true, description: 'Limón, cerezas en almíbar y hielo.',
    recipe: [['limon', 70, 'g'], ['cerezas', 30, 'g'], ['azucar', 25, 'g']],
  },
  ...(['postobon_125', 'cocacola_15', 'hit_litro', 'eco_litro', 'cocacola_pet', 'postobon_pet', 'hit_pet', 'agua_pet'] as const).map((key) => {
    const item = CATALOG_ITEMS.find((i) => i.key === key)!;
    return { key, name: item.name, category: 'Bebidas', type: 'directo' as const, description: '', recipe: [[key, 1, 'unidad']] as Line[] };
  }),
  // ---- Adicionales: se agregan a la venta junto con el plato ----
  ...FAST_EXTRAS.map(([key, name, recipe]) => ({ key, name, category: 'Adicionales', type: 'preparado' as const, description: '', recipe })),
  ...PIZZA_EXTRAS.flatMap(([key, name, item, grams]) =>
    PIZZA_SIZES.map((s, i) => ({
      key: `ad_pizza_${key}_${s.key}`,
      name: `Adicional pizza ${name} ${s.name}`,
      category: 'Adicionales',
      type: 'preparado' as const,
      description: `Para una pizza ${s.name}.`,
      recipe: [[item, grams[i], 'g']] as Line[],
    })),
  ),
];
