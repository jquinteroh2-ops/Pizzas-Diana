// GENERADO desde «recetas 1.xlsx» (recetas de Pizza Diana, noviembre de 2026).
// Cantidades por plato tal como las escribió la pizzería, sin precios ni costos.
// Los desechables (plato, aluminio, bolsa, cajas) no se descuentan del inventario.
import type { Unit } from './units.ts';

export type RecipeLine = [key: string, qty: number, unit: Unit];

/** Pizzas por sabor: receta de cada tamaño [personal, small, medium, familiar]. */
export const PIZZA_RECIPES: Record<string, [RecipeLine[], RecipeLine[], RecipeLine[], RecipeLine[]]> = {
  salami: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['salami', 55, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['salami', 80, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['salami', 135, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['salami', 210, 'g']],
  ],
  pepperoni: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pepperoni', 50, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pepperoni', 80, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pepperoni', 135, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pepperoni', 210, 'g']],
  ],
  chorizo: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['chorizo_santacruz', 77, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['chorizo_santacruz', 102, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['chorizo_santacruz', 120, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['chorizo_santacruz', 209, 'g']],
  ],
  jamon_queso: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['jamon', 30, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['jamon', 64, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['jamon', 115, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['jamon', 194, 'g']],
  ],
  hawaiana: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['jamon', 30, 'g'], ['pina_trocitos', 60, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['jamon', 64, 'g'], ['pina_trocitos', 133, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['jamon', 115, 'g'], ['pina_trocitos', 160, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['jamon', 194, 'g'], ['pina_trocitos', 180, 'g']],
  ],
  pollo_champi: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 60, 'g'], ['champinones', 35, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 105, 'g'], ['champinones', 50, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 115, 'g'], ['champinones', 65, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 185, 'g'], ['champinones', 105, 'g']],
  ],
  pollo_vegetales: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 60, 'g'], ['pimenton', 15, 'g'], ['cebolla', 20, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 105, 'g'], ['pimenton', 50, 'g'], ['cebolla', 35, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 115, 'g'], ['pimenton', 50, 'g'], ['cebolla', 35, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 185, 'g'], ['pimenton', 55, 'g'], ['cebolla', 55, 'g']],
  ],
  margarita: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['oregano', 1, 'g'], ['salsa_pesto', 7, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['oregano', 1, 'g'], ['salsa_pesto', 12, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['oregano', 1, 'g'], ['salsa_pesto', 17, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['oregano', 1, 'g'], ['salsa_pesto', 19, 'g']],
  ],
  solo_mozzarella: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g']],
  ],
  pollo_fusion: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 50, 'g'], ['chorizo_santacruz', 30, 'g'], ['salsa_pesto', 30, 'g'], ['jamon', 7, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 60, 'g'], ['chorizo_santacruz', 40, 'g'], ['salsa_pesto', 40, 'g'], ['jamon', 12, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 105, 'g'], ['chorizo_santacruz', 95, 'g'], ['salsa_pesto', 50, 'g'], ['jamon', 17, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 135, 'g'], ['chorizo_santacruz', 105, 'g'], ['salsa_pesto', 115, 'g'], ['jamon', 19, 'g']],
  ],
  pollo_pesto: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 65, 'g'], ['tomate', 20, 'g'], ['salsa_pesto', 7, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 110, 'g'], ['tomate', 40, 'g'], ['salsa_pesto', 12, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 120, 'g'], ['tomate', 85, 'g'], ['salsa_pesto', 17, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 135, 'g'], ['tomate', 145, 'g'], ['salsa_pesto', 19, 'g']],
  ],
  mediterranea: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['tomate', 20, 'g'], ['pimenton', 20, 'g'], ['aceitunas', 10, 'g'], ['salsa_pesto', 7, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['tomate', 45, 'g'], ['pimenton', 45, 'g'], ['aceitunas', 10, 'g'], ['salsa_pesto', 12, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['tomate', 95, 'g'], ['pimenton', 35, 'g'], ['aceitunas', 15, 'g'], ['salsa_pesto', 17, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['tomate', 145, 'g'], ['pimenton', 60, 'g'], ['aceitunas', 30, 'g'], ['salsa_pesto', 19, 'g']],
  ],
  napolitana: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['tomate', 45, 'g'], ['salsa_pesto', 7, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['tomate', 85, 'g'], ['salsa_pesto', 12, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['tomate', 95, 'g'], ['salsa_pesto', 17, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['tomate', 165, 'g'], ['salsa_pesto', 19, 'g']],
  ],
  del_campo: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 50, 'g'], ['tocineta', 30, 'g'], ['maiz', 25, 'g'], ['cebolla_caramelizada', 10, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 85, 'g'], ['tocineta', 50, 'g'], ['maiz', 55, 'g'], ['cebolla_caramelizada', 13, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 110, 'g'], ['tocineta', 90, 'g'], ['maiz', 75, 'g'], ['cebolla_caramelizada', 18, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 135, 'g'], ['tocineta', 95, 'g'], ['maiz', 95, 'g'], ['cebolla_caramelizada', 23, 'g']],
  ],
  cartagenera: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['chorizo_santacruz', 30, 'g'], ['butifarra', 30, 'g'], ['maiz', 55, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['chorizo_santacruz', 55, 'g'], ['butifarra', 65, 'g'], ['maiz', 40, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['chorizo_santacruz', 60, 'g'], ['butifarra', 55, 'g'], ['maiz', 75, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['chorizo_santacruz', 105, 'g'], ['butifarra', 105, 'g'], ['maiz', 105, 'g']],
  ],
  carnavalera: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['jamon', 30, 'g'], ['salami', 30, 'g'], ['tomate', 45, 'g'], ['cebolla', 20, 'g'], ['pimenton', 20, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['jamon', 50, 'g'], ['salami', 65, 'g'], ['tomate', 50, 'g'], ['cebolla', 25, 'g'], ['pimenton', 25, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['jamon', 60, 'g'], ['salami', 105, 'g'], ['tomate', 65, 'g'], ['cebolla', 40, 'g'], ['pimenton', 30, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['jamon', 97, 'g'], ['salami', 107, 'g'], ['tomate', 75, 'g'], ['cebolla', 60, 'g'], ['pimenton', 42, 'g']],
  ],
  pollo_dulce: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 55, 'g'], ['cebolla_caramelizada', 10, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 110, 'g'], ['cebolla_caramelizada', 13, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 120, 'g'], ['cebolla_caramelizada', 18, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 185, 'g'], ['cebolla_caramelizada', 23, 'g']],
  ],
  tocineta_pina: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['tocineta', 45, 'g'], ['jamon', 30, 'g'], ['pina_trocitos', 15, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['tocineta', 50, 'g'], ['jamon', 55, 'g'], ['pina_trocitos', 40, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['tocineta', 85, 'g'], ['jamon', 85, 'g'], ['pina_trocitos', 80, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['tocineta', 115, 'g'], ['jamon', 105, 'g'], ['pina_trocitos', 130, 'g']],
  ],
  campesina: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['maiz', 20, 'g'], ['tocineta', 45, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['maiz', 40, 'g'], ['tocineta', 45, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['maiz', 110, 'g'], ['tocineta', 95, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['maiz', 100, 'g'], ['tocineta', 175, 'g']],
  ],
  pollo_tocineta: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['pechuga_desmechada', 65, 'g'], ['tocineta', 35, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['pechuga_desmechada', 105, 'g'], ['tocineta', 50, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['pechuga_desmechada', 115, 'g'], ['tocineta', 85, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['pechuga_desmechada', 185, 'g'], ['tocineta', 120, 'g']],
  ],
  tocineta_cebolla: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['tocineta', 50, 'g'], ['cebolla_caramelizada', 10, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['tocineta', 60, 'g'], ['cebolla_caramelizada', 13, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['tocineta', 100, 'g'], ['cebolla_caramelizada', 18, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['tocineta', 180, 'g'], ['cebolla_caramelizada', 23, 'g']],
  ],
  salami_champi: [
    [['masa', 148, 'g'], ['salsa_pizza', 30, 'g'], ['queso_mozzarella', 90, 'g'], ['salami', 55, 'g'], ['champinones', 35, 'g']],
    [['masa', 200, 'g'], ['salsa_pizza', 50, 'g'], ['queso_mozzarella', 130, 'g'], ['salami', 120, 'g'], ['champinones', 60, 'g']],
    [['masa', 340, 'g'], ['salsa_pizza', 90, 'g'], ['queso_mozzarella', 250, 'g'], ['salami', 115, 'g'], ['champinones', 65, 'g']],
    [['masa', 625, 'g'], ['salsa_pizza', 115, 'g'], ['queso_mozzarella', 390, 'g'], ['salami', 210, 'g'], ['champinones', 180, 'g']],
  ],
};

/** Pizzas 2x1: dos pizzas small del mismo sabor (la receta es la de las dos). */
export const PIZZA_2X1_RECIPES: Record<string, RecipeLine[]> = {
  jamon_queso: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['jamon', 128, 'g']],
  pepperoni: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['pepperoni', 160, 'g']],
  tocineta_cebolla: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['tocineta', 120, 'g'], ['cebolla_caramelizada', 26, 'g']],
  tocineta_pina: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['tocineta', 100, 'g'], ['jamon', 110, 'g'], ['pina_trocitos', 80, 'g']],
  mediterranea: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['tomate', 90, 'g'], ['pimenton', 90, 'g'], ['aceitunas', 20, 'g'], ['salsa_pesto', 24, 'g']],
  napolitana: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['tomate', 170, 'g'], ['salsa_pesto', 24, 'g']],
  pollo_vegetales: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['pechuga_desmechada', 110, 'g'], ['pimenton', 80, 'g'], ['cebolla', 70, 'g']],
  cartagenera: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['chorizo_santacruz', 110, 'g'], ['butifarra', 130, 'g'], ['maiz', 80, 'g']],
  salami: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['salami', 160, 'g']],
  hawaiana: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['jamon', 128, 'g'], ['pina_trocitos', 266, 'g']],
  campesina: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['maiz', 80, 'g'], ['tocineta', 90, 'g']],
  chorizo: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['chorizo_santacruz', 204, 'g']],
  solo_mozzarella: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g']],
  margarita: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['salsa_pesto', 24, 'g']],
  pollo_champi: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['pechuga_desmechada', 210, 'g'], ['champinones', 100, 'g']],
  pollo_pesto: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['pechuga_desmechada', 220, 'g'], ['tomate', 80, 'g'], ['salsa_pesto', 24, 'g']],
  pollo_dulce: [['masa', 400, 'g'], ['salsa_pizza', 100, 'g'], ['queso_mozzarella', 260, 'g'], ['pechuga_desmechada', 110, 'g'], ['cebolla_caramelizada', 26, 'g']],
};

/** Perros, hamburguesas, salchipapas, picadas y asados. */
export const FAST_RECIPES: Record<string, RecipeLine[]> = {
  perro_super: [['pan_perro', 1, 'unidad'], ['salsa_casa', 40, 'g'], ['papa_ripio', 11, 'g'], ['cebolla_caramelizada', 7, 'g'], ['queso_mozzarella', 40, 'g'], ['salchicha_zenu', 1, 'unidad'], ['papas', 69, 'g']],
  perro_chorizo_diana: [['pan_perro', 1, 'unidad'], ['chorizo_parrillada', 1, 'unidad'], ['salsa_casa', 19, 'g'], ['tocineta', 30, 'g'], ['queso_mozzarella', 35, 'g'], ['papa_ripio', 11, 'g'], ['cebolla_caramelizada', 10, 'g'], ['papas', 69, 'g']],
  bambinoperro: [['pan_suave', 1, 'unidad'], ['salsa_casa', 23, 'g'], ['salchicha_mini', 1, 'unidad'], ['queso_mozzarella', 27, 'g'], ['papa_ripio', 7, 'g']],
  chori_papa: [['chorizo_artesanal', 90, 'g'], ['cebolla', 20, 'g'], ['queso_mozzarella', 86, 'g'], ['maiz', 62, 'g'], ['salsa_casa', 65, 'g'], ['papas', 290, 'g'], ['salsa_bbq', 14, 'g']],
  salchipapa_1: [['papas', 211, 'g'], ['salsa_casa', 100, 'g'], ['lechuga', 25, 'g'], ['salchicha_manguera', 1, 'unidad'], ['queso_mozzarella', 71, 'g'], ['papa_ripio', 44, 'g']],
  salchipapa_2: [['papas', 350, 'g'], ['salsa_casa', 185, 'g'], ['lechuga', 65, 'g'], ['salchicha_manguera', 2, 'unidad'], ['queso_mozzarella', 130, 'g'], ['papa_ripio', 95, 'g']],
  picadita_mix_1: [['papas', 216, 'g'], ['chorizo_artesanal', 40, 'g'], ['butifarra', 40, 'g'], ['pechuga_plancha', 96, 'g'], ['salsa_casa', 150, 'g'], ['lechuga', 25, 'g'], ['papa_ripio', 51, 'g'], ['queso_mozzarella', 65, 'g']],
  picadita_mix_2: [['papas', 489, 'g'], ['chorizo_artesanal', 64, 'g'], ['butifarra', 64, 'g'], ['pechuga_plancha', 230, 'g'], ['salsa_casa', 200, 'g'], ['lechuga', 50, 'g'], ['papa_ripio', 124, 'g'], ['queso_mozzarella', 200, 'g']],
  picadita_casa_3: [['papas', 524, 'g'], ['salsa_casa', 208, 'g'], ['cebolla', 60, 'g'], ['lechuga', 100, 'g'], ['chorizo_artesanal', 106, 'g'], ['cerdo_prep', 134, 'g'], ['pechuga_plancha', 128, 'g'], ['queso_mozzarella', 135, 'g'], ['maiz', 66, 'g'], ['papa_ripio', 123, 'g']],
  picadita_casa_4: [['papas', 540, 'g'], ['salsa_casa', 255, 'g'], ['cebolla', 70, 'g'], ['lechuga', 100, 'g'], ['chorizo_artesanal', 200, 'g'], ['cerdo_prep', 168, 'g'], ['pechuga_plancha', 120, 'g'], ['queso_mozzarella', 200, 'g'], ['maiz', 100, 'g'], ['papa_ripio', 127, 'g']],
  picadita_casa_6: [['papas', 1225, 'g'], ['salsa_casa', 280, 'g'], ['cebolla', 116, 'g'], ['lechuga', 170, 'g'], ['chorizo_artesanal', 300, 'g'], ['cerdo_prep', 285, 'g'], ['pechuga_plancha', 200, 'g'], ['queso_mozzarella', 290, 'g'], ['maiz', 120, 'g'], ['papa_ripio', 260, 'g']],
  hamb_costena: [['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 40, 'g'], ['lechuga', 5, 'g'], ['tomate', 10, 'g'], ['queso_costeno', 65, 'g'], ['cebolla_caramelizada', 15, 'g'], ['tocineta', 15, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['papas', 69, 'g']],
  hamb_tradicional: [['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 36, 'g'], ['jamon', 10, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['queso_mozzarella', 23, 'g'], ['lechuga', 6, 'g'], ['tomate', 10, 'g'], ['cebolla', 6, 'g'], ['papas', 69, 'g']],
  hamb_grille: [['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 20, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['tocineta', 19, 'g'], ['champinones', 35, 'g'], ['cebolla', 17, 'g'], ['tomate', 20, 'g'], ['lechuga', 4, 'g'], ['queso_mozzarella', 20, 'g'], ['papas', 69, 'g']],
  hamb_pollo: [['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 51, 'g'], ['pechuga_plancha', 92, 'g'], ['queso_mozzarella', 25, 'g'], ['tomate', 5, 'g'], ['cebolla', 4, 'g'], ['lechuga', 6, 'g'], ['papa_ripio', 11, 'g'], ['papas', 69, 'g']],
  hamb_paisa: [['pan_hamburguesa', 1, 'unidad'], ['salsa_casa', 35, 'g'], ['papa_ripio', 10, 'g'], ['carne_hamb_gde', 1, 'unidad'], ['chorizo_santarrosano', 50, 'g'], ['tomate', 15, 'g'], ['lechuga', 5, 'g'], ['queso_mozzarella', 30, 'g'], ['cebolla', 15, 'g'], ['papas', 69, 'g']],
  hamb_smash: [['pan_hamburguesa', 1, 'unidad'], ['carne_hamb_gde', 1, 'unidad'], ['cebolla', 4, 'g'], ['queso_mozzarella', 30, 'g'], ['salsa_casa', 50, 'g'], ['pepinillos', 7, 'g'], ['papas', 69, 'g']],
  hamb_bambina: [['pan_suave', 1, 'unidad'], ['salsa_casa', 23, 'g'], ['cebolla', 5, 'g'], ['carne_hamb_peq', 1, 'unidad'], ['tomate', 20, 'g'], ['lechuga', 4, 'g'], ['queso_mozzarella', 25, 'g']],
  asado_cerdo: [['cerdo_prep', 230, 'g'], ['papas', 64, 'g'], ['lechuga', 30, 'g'], ['tomate', 40, 'g']],
  asado_pechuga: [['pechuga_plancha', 240, 'g'], ['lechuga', 30, 'g'], ['tomate', 40, 'g'], ['papas', 65, 'g']],
};

/** Adicionales de comidas rápidas. */
export const FAST_EXTRAS: [key: string, name: string, recipe: RecipeLine[]][] = [
  ['ad_maiz_perro', 'Adicional maíz (perro)', [['maiz', 20, 'g']]],
  ['ad_maiz_salchi', 'Adicional maíz (salchipapa y picada)', [['maiz', 90, 'g']]],
  ['ad_gratinado', 'Adicional gratinado (asado)', [['queso_mozzarella', 85, 'g']]],
  ['ad_queso_salchi', 'Adicional queso extra (salchipapa y picada)', [['queso_mozzarella', 120, 'g']]],
  ['ad_carne_hamb', 'Adicional carne extra (hamburguesa)', [['carne_hamb_gde', 1, 'unidad']]],
  ['ad_tocineta_perro', 'Adicional tocineta (perro y hamburguesa)', [['tocineta', 30, 'g']]],
  ['ad_tocineta_salchi', 'Adicional tocineta (salchipapa para 2)', [['tocineta', 60, 'g']]],
  ['ad_tocineta_picada', 'Adicional tocineta (picada para 4)', [['tocineta', 120, 'g']]],
  ['ad_papas', 'Adicional papas francesas', [['papas', 200, 'g']]],
];

/** Adicionales de pizza: gramos por tamaño [personal, small, medium, familiar]. */
export const PIZZA_EXTRAS: [key: string, name: string, item: string, grams: [number, number, number, number]][] = [
  ['borde', 'borde de queso', 'queso_mozzarella', [88, 105, 172, 283]],
  ['maiz', 'maíz', 'maiz', [20, 40, 90, 100]],
  ['tocineta', 'tocineta', 'tocineta', [60, 60, 90, 120]],
  ['queso', 'queso extra', 'queso_mozzarella', [50, 120, 180, 220]],
];
