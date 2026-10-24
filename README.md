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

El proyecto incluye 33 pruebas automatizadas con `node:test` que verifican cada regla de negocio, seguridad y persistencia:
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
   - Roles: **Administrador** (ve todo), **Caja** (vende y avisa faltantes/bajas) y **Cocina** (prepara, cuenta neveras, avisa faltantes/bajas; no vende ni ve estadísticas).
   - Permisos adicionales asignables a caja y cocina (entradas de mercancía, reportes, historial completo).
   - Sesiones autenticadas protegidas contra CSRF y fuerza bruta.

8. **Hojas** (el sistema funciona como los formatos de papel de Pizza Diana, para no aprender nada nuevo):
   - El menú empieza por las hojas: **Inventario diario** (Producto | Inicio | Entrada | Fin | Consumo, por nevera), **Recibir pedido**, **Porcionado**, **Bebidas**, **Ventas del día**, **Merma**, **Masa y recetas** y **Bajas**. El administrador y la cocina entran directo a «Inventario diario»; la caja, a «Registrar venta».
   - Se llenan en la misma tabla, se imprimen con el mismo formato y el administrador autoriza ahí mismo (Aprobar/Rechazar en Bajas, «Revisar inicio/fin» en Inventario diario).
   - Tablero, Más vendidos, Reportes, Plan, Inventario, Productos, Usuarios y Configuración quedan en «Más».

9. **Cocina** (por dentro de las hojas):
   - **Preparar**: transformaciones con merma (cebolla → cebolla picada o caramelizada) y recetas por lote (masa de pizza escalada según la harina). Calcula rendimiento contra el estándar y alerta si rinde bajo.
   - **Falta algo**: faltantes reportados por cualquiera, sin duplicados; se juntan con lo que está bajo el mínimo en la **lista de compras** (copiar o enviar por WhatsApp). Al registrar la entrada, el faltante se cierra solo.
   - **Dar de baja**: con motivo y foto; solo descuenta cuando el administrador la aprueba.
   - **Contar nevera**: conteo a ciegas por ubicación (congelador, nevera negra, nevera Coca-Cola, bodega), en paquetes + sueltos, de **apertura** (al abrir), **cierre** (al cerrar) o suelto. El administrador revisa y aplica solo la diferencia.
   - **Caja vs cocina**: por producto y por día, lo que descontaron las ventas según las recetas frente a lo que de verdad gastó la cocina (apertura + entradas + preparado − usado para preparar − bajas − cierre), con la diferencia y alerta desde el 5 %.
   - **Plan de preparación** semanal (cada día algo distinto), con «copiar semana anterior».
   - Reporte de cocina: rendimiento, bajas por motivo, entradas de mercancía y diferencias de conteo.
   - **Cargar catálogo Pizza Diana** (Configuración): productos de las hojas por nevera, 8 preparaciones y el menú con recetas sugeridas (revisar cantidades con el dueño).

10. **Modo Demostración (DEMO)**:
   - Usa el catálogo real de Pizza Diana con 5 semanas de ventas, preparaciones, bajas, conteos y faltantes.
   - Marcador `is_demo` que permite restablecer o eliminar todos los datos de prueba en 1 clic.
   - Sin servidor (abriendo el archivo compilado), los datos viven en el navegador de cada dispositivo (`src/lib/browserStorage.ts`) y la pantalla de entrada ofrece botones para probar cada rol (clave `demo1234`). Para que cocina, caja y administrador compartan datos se usa el servidor publicado en Render (ver abajo).

11. **Presentaciones, porciones y unidades** (cómo se trabaja en Pizza Diana):
   - **Dos formas de controlar**: por **unidad** (butifarra, chorizo, salchichas, panes, bebidas) o por **peso en gramos** (quesos, carnes, papas). Las recetas descuentan igual: la salchipapa para 2 lleva 2 salchichas; la picada de 21, 2 butifarras y 1 chorizo; la de 40, 2 chorizos y 2 butifarras.
   - **Cómo viene**: cada artículo dice al lado del nombre cómo lo trae el proveedor («paquete × 10 und», «bloque × 2.500 g», «paca × 12 und»). Al recibir y al contar se escribe en paquetes y el sistema multiplica.
   - **Porciones**: la pechuga, el cerdo y las papas tienen porciones (porción picada 80 g, porción asado 300 g…). **Siguen siendo el mismo artículo**: porcionar no duplica el inventario ni obliga a contar entrada y salida; solo se descuenta la merma que se bota. Al contar se escribe «2 paquetes + 12 porciones picada + 140 g» y queda guardado así.
   - **Quesos en gramos**: no se porcionan (en la plancha se mezclaban y quedaban porciones con gramos de más). Se ven los bloques cerrados y cuánto lleva consumido el abierto.
   - **Recibir pedido**: muestra lo que se pidió (faltantes y lo que está bajo el mínimo); se escribe lo que llegó y entra todo junto, cerrando los faltantes.
   - **Día de recetas** (martes en el plan): carne molida, salsa de pizza, salsa de la casa, salsa de piña, adobo y piña en trocitos son preparaciones que descuentan sus insumos. Las cantidades son sugeridas: revisarlas con el dueño.
   - **Bebidas**: hoja diaria con inicio + entrada − vendido = lo que debe quedar, frente al conteo final. Todo va por unidad, así que cualquier faltante sale a la vista.

---

## ☁️ Publicar en Render

El repositorio trae `render.yaml`. En Render: **New → Blueprint**, elegir este repositorio y confirmar. Render compila (`npm ci --include=dev && npm run build`) y arranca con `npm start`.

- La base de datos es un archivo SQLite guardado en un **disco persistente** (`/var/data`). Render solo ofrece discos en planes pagos (Starter): en el plan gratis el disco se borra con cada reinicio y se perderían los datos.
- Al abrir la dirección por primera vez aparece la **Configuración inicial** para crear el administrador.

> Las bases creadas con la versión anterior se migran solas al arrancar (PRAGMA `user_version`): el rol «empleado» pasa a «caja» y no se pierde nada.

---

## 🔐 Configuración Inicial y Modo Demo

1. Al abrir la aplicación por primera vez en un entorno vacío, se presenta la pantalla de **Configuración inicial**.
2. Ingresa el nombre, usuario y contraseña del **Administrador**.
3. Una vez dentro:
   - Si deseas probar el sistema con datos de ejemplo, ve a **Configuración** y pulsa **Cargar datos DEMO**.
   - Para limpiar los datos ficticios y comenzar con la operación real de la pizzería, pulsa **Salir del modo demo** en cualquier momento.
