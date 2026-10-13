# Pizza Diana — Sistema Inteligente de Inventario y Control de Ventas

Aplicación web integral para la pizzería **Pizza Diana**, diseñada para el control estricto de inventario por cantidades, registro ágil de ventas con descuento automático según recetas, panel de control con métricas en tiempo real y gestión de roles.

---

## 🚀 Inicio Rápido

### Requisitos previos
- **Node.js** >= 22.13 (incluye soporte nativo para `node:sqlite`).
- **NPM** instalado.

### Instalación de dependencias
```bash
npm install
```

### Modo Desarrollo
Inicia concurrentemente el servidor backend (puerto 3001) y la interfaz en Vite (puerto 5173):
```bash
npm run dev
```
Abre tu navegador en: **`http://localhost:5173`**

### Modo Producción
Compila el frontend y sirve toda la aplicación completa desde el servidor Express:
```bash
npm run build
npm start
```
Abre tu navegador en: **`http://localhost:3001`**

---

## 🧪 Pruebas y Validación

El proyecto incluye 14 pruebas automatizadas con `node:test` que verifican cada regla de negocio, seguridad y persistencia:
```bash
# Ejecutar suite de pruebas
npm test

# Verificación de tipos TypeScript (cliente y servidor)
npm run typecheck

# Verificación de linter
npm run lint
```

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**:
  - React 19
  - TypeScript
  - Tailwind CSS v4
  - Recharts (visualización de datos y métricas)
  - Lucide React (iconografía consistente)
  - Vite 8
- **Backend**:
  - Node.js 24 + Express 5
  - Base de datos SQLite nativa (`node:sqlite`) con modo WAL, llaves foráneas y transacciones atómicas
  - Seguridad con hashing criptográfico `scrypt` y cookies de sesión seguras `HttpOnly`
  - Manejo de zona horaria de Colombia (`America/Bogota`, UTC-5) y semanas laborales lunes a domingo.

---

## 📋 Módulos del Sistema

1. **Tablero / Dashboard**:
   - KPIs de ventas del día, semana, mes y nivel de existencias.
   - Gráfico de evolución temporal (7 días, 30 días, mes actual).
   - Gráfico de productos más vendidos y gráfico de participación (dona).
   - Alertas inmediatas de ingredientes bajos o agotados.

2. **Inventario de Ingredientes**:
   - Catálogo de insumos clasificados por categoría.
   - Almacenamiento en milésimas de unidad para evitar errores de coma flotante.
   - Conversiones automáticas entre unidades compatibles (kg ↔ g, l ↔ ml, unidad).
   - Registro de entradas de mercancía y ajustes manuales auditados con motivo.
   - Historial detallado de movimientos por ingrediente.

3. **Productos y Recetas**:
   - Gestión de pizzas preparadas y productos directos (bebidas, empaques).
   - Constructor visual de recetas por porciones exactas.
   - Validaciones contra ingredientes repetidos o cantidades inválidas.

4. **Registro de Ventas (Punto de Venta)**:
   - Registro rápido por cantidades de producto.
   - Previsualización en vivo del consumo de insumos antes de confirmar.
   - Operación atómica: si falta un solo ingrediente, la venta se cancela íntegramente.
   - Protección contra doble clic e idempotencia mediante `requestId`.
   - Copia histórica de la receta consumida para auditorías futuras.

5. **Historial y Anulaciones**:
   - Registro completo de ventas con desglose de insumos consumidos.
   - Anulación autorizada por Administrador que devuelve automáticamente las cantidades exactas al inventario.

6. **Reportes**:
   - Consolidado por períodos (Día, Semana lunes a domingo, Mes).
   - Comparativa contra el período anterior.
   - Exportación de datos a formato CSV.

7. **Control de Acceso y Usuarios**:
   - Roles: **Administrador** y **Empleado**.
   - Permisos granulares asignables a empleados (ej. autorizar registro de entradas).
   - Sesiones autenticadas protegidas contra CSRF y fuerza bruta.

8. **Modo Demostración (DEMO)**:
   - Generación de datos consistentes (15 ingredientes, 7 productos con recetas, histórico de 5 semanas de ventas).
   - Marcador `is_demo` que permite restablecer o eliminar todos los datos de prueba en 1 clic para iniciar en limpio con los datos reales de Pizza Diana.

---

## 🔐 Configuración Inicial y Modo Demo

1. Al abrir la aplicación por primera vez en un entorno vacío, se presenta la pantalla de **Configuración inicial**.
2. Ingresa el nombre, usuario y contraseña del **Administrador**.
3. Una vez dentro:
   - Si deseas probar el sistema con datos de ejemplo, ve a **Configuración** y pulsa **Cargar datos DEMO**.
   - Para limpiar los datos ficticios y comenzar con la operación real de la pizzería, pulsa **Salir del modo demo** en cualquier momento.
